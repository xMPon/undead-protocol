// The simulation. Owns every piece of game state and advances it via a single
// update(dt, intent) call. Strictly headless: no DOM, no three.js — renderers
// read this, they never write to it. Audio/UI hooks are optional callbacks so
// the sim stays decoupled from presentation.

import type { Vec2 } from "../core/math";
import { add, angleOf, fromAngle, len, norm, rotate, scale, sub, distSq } from "../core/math";
import { randInt } from "../core/rng";
import { mulberry32 } from "../core/rng";
import type { Intent, Tracer, Obstacle, Blast, WallBuyDef, DoorDef, PerkMachineDef, SupplyDef, CacheSiteDef } from "./types";
import { GameMap, INTERACT_RANGE } from "./Map";
import type { IndexedBarrier } from "./Map";
import { Player, ADS_SPEED_MUL, ADS_SPREAD_MUL } from "./Player";
import { Zombie, ZOMBIE_TOUCH_DAMAGE, ZOMBIE_ATTACK_CADENCE, ZOMBIE_RISE_TIME } from "./Zombie";
import { RoundManager } from "./Round";
import { spawnGate, spawnInterval } from "./Spawner";
import { FlowField } from "./pathing";
import { Terrain, FLAT_TERRAIN } from "./Terrain";
import { resolveCircleObstacles, supportHeight, rayVsCircle, nearestWallDist, clampToZones } from "./collision";
import { canFire, consumeRound, canReload } from "./Weapons";
import { POINTS_HIT, POINTS_KILL, POINTS_REPAIR, spend } from "./Economy";
import { PROP_SPECS, propColliders, colliderAabb, isSolidProp } from "./props";
import { PERK_MACHINE, fixtureAabb } from "./fixtures";
import { BOARD_TEAR_TIME, BOARD_REPAIR_TIME } from "./Barriers";
import { Cache, CACHE_COST } from "./Cache";
import {
  Grenade,
  blastDamage,
  GRENADE_RADIUS,
  THROW_SPEED,
  THROW_VZ,
  SELF_DAMAGE_FRAC,
  MAX_GRENADES,
  SUPPLY_COST,
} from "./Grenade";
import { getWeapon, CACHE_POOL } from "../data/weapons";
import { getPerk } from "../data/perks";
import { BLACKSITE } from "../data/map_blacksite";
import type { MapDef } from "./types";

const FLOW_INTERVAL = 0.15; // seconds between flow-field recomputes
const SEPARATION_RADIUS = 1.05;
const GRAVITY = 24; // world units / s^2
const JUMP_V = 8.2; // launch velocity (peak ~1.4 units — clears crates/barrels)
const WALL_TOP = 1000; // effectively impassable
const STUCK_TIME = 0.4; // seconds barely moving before a zombie nudges/jumps
const ATTACK_MAX_DZ = 1.2; // max feet-height gap for a zombie to land a hit
const BLAST_TTL = 0.5; // seconds a detonation stays in `blasts` for the renderers

export type PromptKind = "wallbuy" | "door" | "perk" | "cache" | "supply" | "repair";

export interface InteractPrompt {
  kind: PromptKind;
  text: string;
  cost: number;
  affordable: boolean;
  /** Held down rather than tapped — barrier repair rebuilds a plank at a time. */
  hold?: boolean;
}

/**
 * What the interact key would act on this frame. The prompt is rendered from
 * it and the keypress is resolved against it, so what the HUD offers and what
 * the world does can never be two different things.
 */
type Focus =
  | { kind: "wallbuy"; wallBuy: WallBuyDef }
  | { kind: "door"; door: DoorDef }
  | { kind: "perk"; machine: PerkMachineDef }
  | { kind: "cache"; site: CacheSiteDef }
  | { kind: "supply"; supply: SupplyDef }
  | { kind: "repair"; barrier: IndexedBarrier };

/** Zombie move speed for a given round (Phase 1: walkers with a gentle ramp). */
function zombieSpeed(round: number): number {
  return Math.min(4.2, 2.0 + round * 0.08);
}

export class World {
  /** The map currently loaded. Swapped by `loadMap`, never mutated in place. */
  def: MapDef;
  map: GameMap;
  player: Player;
  zombies: Zombie[] = [];
  rounds = new RoundManager();
  flow: FlowField;
  terrain: Terrain;
  obstacles: Obstacle[] = [];

  tracers: Tracer[] = [];
  grenades: Grenade[] = [];
  blasts: Blast[] = [];
  /** The mystery box. Rebuilt per game so a run cannot inherit its luck. */
  cache: Cache;
  muzzle = 0; // muzzle-flash timer for renderers
  banner = { text: "", ttl: 0 };
  /** Second line under the banner — perks bought, what The Cache just did. */
  notice = { text: "", ttl: 0 };
  /** Whether the player is aiming down sights this frame (renderers read it). */
  ads = false;
  kills = 0;
  /** Kills so far in the round currently running. */
  roundKills = 0;
  /** Kills in the round that just ended — what the intermission reports. */
  lastRoundKills = 0;
  gameOver = false;
  prompt: InteractPrompt | null = null;

  // Presentation hooks — wired by main.ts to the Sound module.
  onShot?: (weaponId: string) => void;
  onDryFire?: () => void;
  onHitZombie?: () => void;
  onKill?: () => void;
  onHurt?: () => void;
  onReload?: () => void;
  onBuy?: () => void;
  onDenied?: () => void;
  onRoundStart?: (round: number) => void;
  /** A round has been cleared; the intermission starts now. */
  onRoundEnd?: (round: number, kills: number) => void;
  onDoor?: () => void;
  onDeath?: () => void;
  onPerk?: (perkId: string) => void;
  onCacheOpen?: () => void;
  onCacheReveal?: () => void;
  onCacheMove?: () => void;
  onThrow?: () => void;
  onExplosion?: () => void;
  onBoardTear?: () => void;
  onRepair?: () => void;
  onRevive?: () => void;

  private spawnCooldown = 0;
  private flowTimer = 0;
  private prevFiring = false;
  private prevInteract = false;
  private prevReload = false;
  private prevGrenade = false;
  private focus: Focus | null = null;
  /** Seconds of held interact banked toward the next plank. */
  private repairProgress = 0;

  constructor(def: MapDef = BLACKSITE) {
    // Assigned properly by loadMap; these keep TypeScript happy about definite
    // assignment without duplicating the setup.
    this.def = def;
    this.map = new GameMap(def);
    this.player = new Player(def.playerSpawn);
    this.terrain = new Terrain(def.terrain ?? FLAT_TERRAIN);
    this.flow = new FlowField(def.bounds, 0.8);
    this.cache = newCache();
    this.loadMap(def);
  }

  /**
   * Point the simulation at a different map and start it fresh. Everything
   * derived from the map — terrain, obstacles, the flow field's own grid — is
   * rebuilt; the presentation callbacks wired by main.ts are preserved, which is
   * why this exists rather than constructing a new World.
   */
  loadMap(def: MapDef): void {
    this.def = def;
    this.terrain = new Terrain(def.terrain ?? FLAT_TERRAIN);
    this.flow = new FlowField(def.bounds, 0.8);
    this.reset();
  }

  /** Rebuild the height-aware obstacle list (walls + closed doors + solid props). */
  private buildObstacles(): void {
    const obs: Obstacle[] = [];
    for (const w of this.def.walls) obs.push({ rect: w, top: WALL_TOP });
    for (const d of this.def.doors) {
      if (!this.map.openedDoors.has(d.id)) obs.push({ rect: d.blocks, top: WALL_TOP });
    }
    for (const p of this.def.props ?? []) {
      if (!isSolidProp(p)) continue;
      const s = p.scale ?? 1;
      const top = this.terrain.heightAt(p.pos.x, p.pos.y) + PROP_SPECS[p.kind].height * s;
      for (const c of propColliders(p)) {
        obs.push({
          rect: colliderAabb(c),
          top,
          rot: c.radius === undefined ? c.rot : undefined,
          half: c.radius === undefined ? { x: c.hx, y: c.hy } : undefined,
          radius: c.radius,
        });
      }
    }
    for (const m of this.def.perkMachines ?? []) {
      obs.push({
        rect: fixtureAabb(PERK_MACHINE, m.pos, m.rot ?? 0),
        top: this.terrain.heightAt(m.pos.x, m.pos.y) + PERK_MACHINE.height,
        rot: m.rot ?? 0,
        half: { x: PERK_MACHINE.hx, y: PERK_MACHINE.hy },
      });
    }
    this.obstacles = obs;
  }

  /** Reset to a fresh game on the current map, preserving wired callbacks. */
  reset(): void {
    this.map = new GameMap(this.def);
    this.player = new Player(this.def.playerSpawn);
    this.player.footY = this.terrain.heightAt(this.player.pos.x, this.player.pos.y);
    this.zombies = [];
    this.rounds = new RoundManager();
    this.tracers = [];
    this.grenades = [];
    this.blasts = [];
    this.cache = newCache();
    this.cache.site = this.map.liveCacheSites()[0] ?? 0;
    this.kills = 0;
    this.roundKills = 0;
    this.lastRoundKills = 0;
    this.gameOver = false;
    this.prompt = null;
    this.focus = null;
    this.repairProgress = 0;
    this.ads = false;
    this.banner = { text: "", ttl: 0 };
    this.notice = { text: "", ttl: 0 };
    this.spawnCooldown = 0;
    this.flowTimer = 0;
    this.prevFiring = this.prevInteract = this.prevReload = this.prevGrenade = false;
    this.buildObstacles();
    this.flow.rebuild(this.map.walls);
    this.flow.compute(this.player.pos);
  }

  aliveCount(): number {
    let n = 0;
    for (const z of this.zombies) if (!z.isDead) n++;
    return n;
  }

  update(dt: number, intent: Intent): void {
    if (this.gameOver) return;

    // On the floor after a killing blow: no input at all until Second Wind
    // finishes picking the player back up. The round keeps running around them.
    const down = this.player.downed;
    this.ads = intent.ads && !down;

    this.handleMovement(dt, down ? { ...intent, move: { x: 0, y: 0 }, jump: false } : intent);
    if (!down) this.player.aim = intent.aim;
    this.handleWeaponInput(down ? { ...intent, firing: false, reload: false, grenade: false } : intent);
    if (this.player.tick(dt)) this.onRevive?.();

    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.flow.compute(this.player.pos);
      this.flowTimer = FLOW_INTERVAL;
    }

    this.updateRounds(dt);
    this.updateZombies(dt);
    this.updateGrenades(dt);
    this.updateCache(dt);

    this.updateFocus();
    this.handleInteract(dt, down ? { ...intent, interact: false } : intent);

    this.updateTransient(dt);

    if (!this.player.alive && !this.gameOver) {
      this.gameOver = true;
      this.onDeath?.();
    }
  }

  // ---- movement ----

  private handleMovement(dt: number, intent: Intent): void {
    const p = this.player;
    let mv: Vec2 = intent.move;
    const l = len(mv);
    if (l > 1) mv = scale(mv, 1 / l);
    // Sighted movement is a deliberate trade: you give up ground speed (and the
    // sprint that would have got you out) for a barrel that stays where you put it.
    const sp = p.speed * (this.ads ? ADS_SPEED_MUL : intent.sprint ? p.sprintMul : 1);
    const desired = { x: p.pos.x + mv.x * sp * dt, y: p.pos.y + mv.y * sp * dt };
    p.pos = resolveCircleObstacles(desired, p.radius, p.footY, this.obstacles);
    // Keep the player caged inside the map even where zombie barriers leave gaps.
    const pb = this.def.playBounds;
    if (pb?.length) p.pos = clampToZones(p.pos, p.radius, pb);
    this.applyGravity(dt, p.pos, p, intent.jump);
  }

  /** Vertical integration + jump for any entity with footY/vz/onGround. */
  private applyGravity(dt: number, pos: Vec2, ent: { footY: number; vz: number; onGround: boolean }, jump: boolean): void {
    const groundY = this.terrain.heightAt(pos.x, pos.y);
    const support = supportHeight(pos, ent.footY, groundY, this.obstacles);
    if (jump && ent.onGround) ent.vz = JUMP_V;
    ent.footY += ent.vz * dt;
    ent.vz -= GRAVITY * dt;
    if (ent.footY <= support) {
      ent.footY = support;
      ent.vz = 0;
      ent.onGround = true;
    } else {
      ent.onGround = false;
    }
  }

  // ---- shooting ----

  private handleWeaponInput(intent: Intent): void {
    const p = this.player;
    if (intent.switchTo != null) p.switchTo(intent.switchTo);

    const grenadeEdge = intent.grenade && !this.prevGrenade;
    this.prevGrenade = intent.grenade;
    if (grenadeEdge && p.takeGrenade()) this.throwGrenade();

    const reloadEdge = intent.reload && !this.prevReload;
    this.prevReload = intent.reload;
    if (reloadEdge && canReload(p.weapon(), p.def()) && p.reloadTimer <= 0) {
      p.startReload();
      this.onReload?.();
    }

    const def = p.def();
    const inst = p.weapon();
    const fireEdge = intent.firing && !this.prevFiring;
    const mayFire = def.auto ? intent.firing : fireEdge;

    if (mayFire && canFire(inst, p.fireCooldown, p.reloadTimer)) {
      this.fire();
    } else if (fireEdge && inst.mag <= 0 && p.reloadTimer <= 0) {
      if (canReload(inst, def)) {
        p.startReload();
        this.onReload?.();
      } else {
        this.onDryFire?.();
      }
    }
    this.prevFiring = intent.firing;
  }

  private fire(): void {
    const p = this.player;
    const def = p.def();
    const inst = p.weapon();
    consumeRound(inst);
    p.fireCooldown = p.fireInterval();
    this.muzzle = 0.05;
    this.onShot?.(def.id);

    const origin = { x: p.pos.x, y: p.pos.y };
    let anyHit = false;
    const spread = def.spread * (this.ads ? ADS_SPREAD_MUL : 1);
    for (let i = 0; i < def.pellets; i++) {
      const a = p.aim + (Math.random() * 2 - 1) * spread;
      const dir = fromAngle(a);
      const wallD = nearestWallDist(origin.x, origin.y, dir.x, dir.y, this.map.walls);
      const maxD = Math.min(def.range, wallD);

      let bestT = Infinity;
      let bestZ: Zombie | null = null;
      for (const z of this.zombies) {
        if (z.isDead) continue;
        const t = rayVsCircle(origin.x, origin.y, dir.x, dir.y, z.pos.x, z.pos.y, z.radius);
        if (t !== null && t <= maxD && t < bestT) {
          bestT = t;
          bestZ = z;
        }
      }

      const dist = bestZ ? bestT : maxD;
      const to = { x: origin.x + dir.x * dist, y: origin.y + dir.y * dist };
      this.tracers.push({ from: { ...origin }, to, ttl: 0.05, hit: !!bestZ });

      if (bestZ) {
        anyHit = true;
        p.points += POINTS_HIT;
        const killed = bestZ.damage(def.damage);
        if (killed) {
          p.points += POINTS_KILL - POINTS_HIT;
          this.kills++;
          this.roundKills++;
          this.onKill?.();
        }
      }
    }
    if (anyHit) this.onHitZombie?.();
  }

  // ---- grenades ----

  /** Lob one from the player's hand along their aim. */
  private throwGrenade(): void {
    const p = this.player;
    const dir = fromAngle(p.aim);
    const pos = { x: p.pos.x + dir.x * 0.7, y: p.pos.y + dir.y * 0.7 };
    this.grenades.push(new Grenade(pos, scale(dir, THROW_SPEED), p.footY + 1.2, THROW_VZ));
    this.onThrow?.();
  }

  /**
   * Arc, bounce, and detonate. A grenade is the one thing in the game that has
   * to agree with the geometry in all three axes, so it runs the same obstacle
   * resolution and support-height query the entities do.
   */
  private updateGrenades(dt: number): void {
    if (this.grenades.length === 0) return;
    for (const g of this.grenades) {
      g.fuse -= dt;
      g.spin += dt * 14;

      const desired = { x: g.pos.x + g.vel.x * dt, y: g.pos.y + g.vel.y * dt };
      const solved = resolveCircleObstacles(desired, g.radius, g.footY, this.obstacles);
      // Pushed out along an axis = it hit something on that axis; bounce off it.
      if (Math.abs(solved.x - desired.x) > 1e-4) g.vel.x = -g.vel.x * 0.45;
      if (Math.abs(solved.y - desired.y) > 1e-4) g.vel.y = -g.vel.y * 0.45;
      g.pos = solved;

      const groundY = this.terrain.heightAt(g.pos.x, g.pos.y);
      const support = supportHeight(g.pos, g.footY, groundY, this.obstacles, 0.1);
      g.vz -= GRAVITY * dt;
      g.footY += g.vz * dt;
      if (g.footY <= support) {
        g.footY = support;
        // Below a threshold it stops bouncing rather than jittering on the spot.
        if (g.vz < -1.5) {
          g.vz = -g.vz * 0.35;
        } else {
          g.vz = 0;
          g.onGround = true;
        }
        g.vel = scale(g.vel, 0.6);
      }
    }

    const live: Grenade[] = [];
    for (const g of this.grenades) {
      if (g.fuse <= 0) this.detonate(g);
      else live.push(g);
    }
    this.grenades = live;
  }

  /** Whether a blast at `from` has line of sight to `to` — walls stop frag. */
  private blastReaches(from: Vec2, to: Vec2): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-3) return true;
    return nearestWallDist(from.x, from.y, dx / d, dy / d, this.map.walls) >= d;
  }

  private detonate(g: Grenade): void {
    this.blasts.push({ pos: { ...g.pos }, footY: g.footY, radius: GRENADE_RADIUS, ttl: BLAST_TTL });
    this.onExplosion?.();
    const p = this.player;

    for (const z of this.zombies) {
      if (z.isDead) continue;
      const d = Math.hypot(z.pos.x - g.pos.x, z.pos.y - g.pos.y, z.footY - g.footY);
      if (d >= GRENADE_RADIUS || !this.blastReaches(g.pos, z.pos)) continue;
      const killed = z.damage(blastDamage(d));
      p.points += POINTS_HIT;
      if (killed) {
        p.points += POINTS_KILL - POINTS_HIT;
        this.kills++;
        this.roundKills++;
        this.onKill?.();
      }
    }

    // Your own frag counts. Standing on top of it is the player's mistake to make.
    const pd = Math.hypot(p.pos.x - g.pos.x, p.pos.y - g.pos.y, p.footY - g.footY);
    if (pd < GRENADE_RADIUS && this.blastReaches(g.pos, p.pos)) {
      const before = p.health;
      p.hurt(blastDamage(pd) * SELF_DAMAGE_FRAC);
      if (p.health < before) this.onHurt?.();
    }
  }

  // ---- The Cache ----

  /** Where the box is sitting right now, or null on a map without one. */
  cacheSite(): CacheSiteDef | null {
    return this.def.cacheSites?.[this.cache.site] ?? null;
  }

  private updateCache(dt: number): void {
    const ev = this.cache.tick(dt);
    if (ev === "reveal") {
      this.onCacheReveal?.();
    } else if (ev === "withdraw") {
      this.notice = { text: "The Cache closed", ttl: 1.8 };
      this.onDenied?.();
    } else if (ev === "relocate") {
      this.relocateCache();
    }
  }

  /** Move the box to another live site — or restock in place if it is the only one. */
  private relocateCache(): void {
    const options = this.map.liveCacheSites().filter((i) => i !== this.cache.site);
    const moved = options.length > 0;
    const next = moved ? options[randInt(0, options.length - 1)] : this.cache.site;
    this.cache.relocate(next);
    this.notice = { text: moved ? "The Cache has moved" : "The Cache restocked", ttl: 2.4 };
    this.onCacheMove?.();
  }

  // ---- rounds & spawning ----

  private updateRounds(dt: number): void {
    const alive = this.aliveCount();
    const ev = this.rounds.tick(dt, alive);
    if (ev === "start") {
      this.roundKills = 0;
      this.banner = { text: `Round ${this.rounds.round}`, ttl: 2.2 };
      this.onRoundStart?.(this.rounds.round);
    } else if (ev === "end") {
      // The wave being over is worth its own beat: the banner says so, the notice
      // reports the tally, and the HUD counts the intermission down from here.
      this.lastRoundKills = this.roundKills;
      this.banner = { text: "Wave Cleared", ttl: 2.4 };
      this.notice = { text: `${this.roundKills} ${this.roundKills === 1 ? "kill" : "kills"}`, ttl: 2.8 };
      this.onRoundEnd?.(this.rounds.round, this.roundKills);
    }

    this.spawnCooldown -= dt;
    if (spawnGate(this.rounds.phase, this.rounds.toSpawn, alive, this.spawnCooldown)) {
      if (this.spawnZombie()) {
        this.rounds.markSpawned();
        this.spawnCooldown = spawnInterval(this.rounds.round);
      }
    }
  }

  private spawnZombie(): boolean {
    const barriers = this.map.activeBarrierEntries();
    if (barriers.length === 0) return false;
    const entry = barriers[randInt(0, barriers.length - 1)];
    const b = entry.def;
    const pos = { x: b.pos.x - b.inward.x, y: b.pos.y - b.inward.y };
    const z = new Zombie(pos, this.rounds.spawnHealth, zombieSpeed(this.rounds.round));
    z.facing = angleOf(b.inward);
    z.footY = this.terrain.heightAt(pos.x, pos.y);
    z.barrier = entry.index;
    // A boarded window has to come apart first; an open one it just climbs.
    if (this.map.boards.isOpen(entry.index)) {
      z.state = "rising";
      z.riseTimer = ZOMBIE_RISE_TIME;
    } else {
      z.state = "breaching";
      z.breachTimer = BOARD_TEAR_TIME;
    }
    this.zombies.push(z);
    return true;
  }

  // ---- zombie AI ----

  private updateZombies(dt: number): void {
    const p = this.player;
    for (const z of this.zombies) {
      if (z.isDead) {
        z.deadTimer += dt;
        continue;
      }
      if (z.hitFlash > 0) z.hitFlash = Math.max(0, z.hitFlash - dt * 3);
      z.attackCooldown -= dt;

      if (z.state === "breaching") {
        this.tickBreach(z, dt);
        continue;
      }

      if (z.state === "rising") {
        z.riseTimer -= dt;
        if (z.riseTimer <= 0) z.state = "chasing";
        continue;
      }

      const toP = sub(p.pos, z.pos);
      const d = len(toP);
      z.facing = angleOf(toP);
      const contact = p.radius + z.radius + 0.12;

      if (d <= contact && Math.abs(p.footY - z.footY) < ATTACK_MAX_DZ) {
        z.state = "attacking";
        if (z.attackCooldown <= 0) {
          const before = p.health;
          p.hurt(ZOMBIE_TOUCH_DAMAGE);
          z.attackCooldown = ZOMBIE_ATTACK_CADENCE;
          if (p.health < before) this.onHurt?.();
        }
        this.applyGravity(dt, z.pos, z, false);
        continue;
      }

      z.state = "chasing";
      const flowDir = this.flow.sample(z.pos);
      const sep = this.separation(z);
      let steer = norm(add(flowDir, scale(sep, 0.7)));

      // Unstuck: barely moving for a while → sidestep and hop over the obstacle.
      let wantJump = false;
      if (z.stuckTimer > STUCK_TIME) {
        steer = rotate(flowDir, z.nextStuckSign() * (Math.PI / 2));
        wantJump = true;
        z.stuckTimer = 0;
      }
      // Follow the player up onto objects.
      if (z.onGround && p.footY - z.footY > 0.5 && d < 3) wantJump = true;

      const step = z.speed * dt;
      const desired = { x: z.pos.x + steer.x * step, y: z.pos.y + steer.y * step };
      const oldx = z.pos.x;
      const oldy = z.pos.y;
      z.pos = resolveCircleObstacles(desired, z.radius, z.footY, this.obstacles);
      this.applyGravity(dt, z.pos, z, wantJump);

      if (Math.hypot(z.pos.x - oldx, z.pos.y - oldy) < 0.02) z.stuckTimer += dt;
      else z.stuckTimer = 0;
    }

    // Cull corpses once their fade-out has elapsed.
    this.zombies = this.zombies.filter((z) => !(z.isDead && z.deadTimer > 0.6));
  }

  /**
   * A zombie at a boarded window, pulling it apart one plank at a time. It only
   * climbs through once the last board is off — which is what makes rebuilding
   * them worth doing, and what buys the player the seconds to do it.
   */
  private tickBreach(z: Zombie, dt: number): void {
    const barrier = this.def.barriers[z.barrier];
    if (!barrier) {
      z.state = "rising";
      z.riseTimer = ZOMBIE_RISE_TIME;
      return;
    }
    z.facing = angleOf(barrier.inward);
    z.breachTimer -= dt;
    if (z.breachTimer > 0) return;

    if (this.map.boards.tear(z.barrier)) this.onBoardTear?.();
    z.breachTimer = BOARD_TEAR_TIME;
    if (!this.map.boards.isOpen(z.barrier)) return;

    // Through the gap: step inside the room and start clawing upright.
    z.pos = { x: barrier.pos.x + barrier.inward.x * 0.6, y: barrier.pos.y + barrier.inward.y * 0.6 };
    z.footY = this.terrain.heightAt(z.pos.x, z.pos.y);
    z.state = "rising";
    z.riseTimer = ZOMBIE_RISE_TIME;
  }

  private separation(self: Zombie): Vec2 {
    let sx = 0;
    let sy = 0;
    const r2 = SEPARATION_RADIUS * SEPARATION_RADIUS;
    for (const o of this.zombies) {
      if (o === self || o.isDead) continue;
      const dd = distSq(self.pos, o.pos);
      if (dd < r2 && dd > 1e-6) {
        const d = Math.sqrt(dd);
        const w = (SEPARATION_RADIUS - d) / SEPARATION_RADIUS;
        sx += ((self.pos.x - o.pos.x) / d) * w;
        sy += ((self.pos.y - o.pos.y) / d) * w;
      }
    }
    return { x: sx, y: sy };
  }

  // ---- interaction ----

  /**
   * Pick what the interact key would act on, and describe it for the HUD. The
   * nearest thing in range wins, except a settled Cache draw, which takes
   * priority because it is on a clock and everything else is not.
   */
  private updateFocus(): void {
    const p = this.player;
    if (p.downed) {
      this.focus = null;
      this.prompt = null;
      return;
    }

    let best: Focus | null = null;
    let bestD = Infinity;
    const consider = (focus: Focus, at: Vec2): void => {
      const d = distSq(p.pos, at);
      if (d < bestD) {
        bestD = d;
        best = focus;
      }
    };

    const wallBuy = this.map.nearestWallBuy(p.pos);
    if (wallBuy) consider({ kind: "wallbuy", wallBuy }, wallBuy.pos);
    const door = this.map.nearestClosedDoor(p.pos);
    if (door) consider({ kind: "door", door }, door.pos);
    const machine = this.map.nearestPerkMachine(p.pos);
    if (machine) consider({ kind: "perk", machine }, machine.pos);
    const supply = this.map.nearestSupply(p.pos);
    if (supply) consider({ kind: "supply", supply }, supply.pos);
    const barrier = this.map.nearestRepairableBarrier(p.pos);
    if (barrier) consider({ kind: "repair", barrier }, barrier.def.pos);

    const site = this.cacheSite();
    if (site && this.map.isRegionActive(site.region) && distSq(p.pos, site.pos) <= INTERACT_RANGE * INTERACT_RANGE) {
      if (this.cache.isOffering) best = { kind: "cache", site };
      else consider({ kind: "cache", site }, site.pos);
    }

    // Focus objects are rebuilt every frame, so identity is no test of sameness:
    // compare what they point at, or held repairs would reset on every tick.
    if (!sameFocus(best, this.focus)) this.repairProgress = 0;
    this.focus = best;
    this.prompt = best ? this.describe(best) : null;
  }

  /** The HUD line for a focus: what it is, what it costs, whether you can pay. */
  private describe(focus: Focus): InteractPrompt {
    const p = this.player;
    const afford = (cost: number): boolean => p.points >= cost;
    switch (focus.kind) {
      case "wallbuy": {
        const def = getWeapon(focus.wallBuy.weaponId);
        const owned = p.hasWeapon(focus.wallBuy.weaponId) >= 0;
        const cost = owned ? def.ammoCost : def.wallCost;
        return { kind: "wallbuy", text: owned ? `${def.name} \u2014 Ammo` : def.name, cost, affordable: afford(cost) };
      }
      case "door":
        return {
          kind: "door",
          text: focus.door.name ?? "Open Door",
          cost: focus.door.cost,
          affordable: afford(focus.door.cost),
        };
      case "perk": {
        const def = getPerk(focus.machine.perkId);
        if (p.hasPerk(def.id)) return { kind: "perk", text: `${def.name} \u2014 Held`, cost: 0, affordable: true };
        return { kind: "perk", text: `${def.name} \u2014 ${def.blurb}`, cost: def.cost, affordable: afford(def.cost) };
      }
      case "cache": {
        if (this.cache.isOffering) {
          return { kind: "cache", text: `Take ${getWeapon(this.cache.display).name}`, cost: 0, affordable: true };
        }
        if (!this.cache.isIdle) return { kind: "cache", text: "The Cache \u2014 cycling", cost: 0, affordable: true };
        return { kind: "cache", text: "The Cache", cost: CACHE_COST, affordable: afford(CACHE_COST) };
      }
      case "supply": {
        const full = p.grenades >= MAX_GRENADES;
        return {
          kind: "supply",
          text: full ? "Grenades \u2014 Full" : "Grenades",
          cost: full ? 0 : SUPPLY_COST,
          affordable: full || afford(SUPPLY_COST),
        };
      }
      case "repair":
        return {
          kind: "repair",
          text: `Rebuild Barrier (+${POINTS_REPAIR})`,
          cost: 0,
          affordable: true,
          hold: true,
        };
    }
  }

  private handleInteract(dt: number, intent: Intent): void {
    const focus = this.focus;
    const edge = intent.interact && !this.prevInteract;
    this.prevInteract = intent.interact;
    if (!focus) {
      this.repairProgress = 0;
      return;
    }

    // Rebuilding is the one held action: plank by plank for as long as F is down.
    if (focus.kind === "repair") {
      if (!intent.interact) {
        this.repairProgress = 0;
        return;
      }
      this.repairProgress += dt;
      while (this.repairProgress >= BOARD_REPAIR_TIME) {
        this.repairProgress -= BOARD_REPAIR_TIME;
        if (!this.map.boards.repair(focus.barrier.index)) break;
        this.player.points += POINTS_REPAIR;
        this.onRepair?.();
      }
      return;
    }

    if (!edge) return;
    switch (focus.kind) {
      case "wallbuy":
        this.buyWallWeapon(focus.wallBuy);
        break;
      case "door":
        this.buyDoor(focus.door);
        break;
      case "perk":
        this.buyPerk(focus.machine);
        break;
      case "cache":
        this.useCache();
        break;
      case "supply":
        this.buySupply();
        break;
    }
  }

  private buyWallWeapon(wb: WallBuyDef): void {
    const p = this.player;
    const def = getWeapon(wb.weaponId);
    const owned = p.hasWeapon(wb.weaponId) >= 0;
    const r = spend(p.points, owned ? def.ammoCost : def.wallCost);
    if (!r.ok) {
      this.onDenied?.();
      return;
    }
    p.points = r.points;
    p.acquire(wb.weaponId);
    this.onBuy?.();
  }

  private buyDoor(door: DoorDef): void {
    const p = this.player;
    const r = spend(p.points, door.cost);
    if (!r.ok) {
      this.onDenied?.();
      return;
    }
    p.points = r.points;
    this.map.openDoor(door.id);
    this.buildObstacles();
    this.flow.rebuild(this.map.walls);
    this.onDoor?.();
  }

  private buyPerk(machine: PerkMachineDef): void {
    const p = this.player;
    const def = getPerk(machine.perkId);
    if (p.hasPerk(def.id)) {
      this.onDenied?.();
      return;
    }
    const r = spend(p.points, def.cost);
    if (!r.ok) {
      this.onDenied?.();
      return;
    }
    p.points = r.points;
    p.grantPerk(def.id);
    this.notice = { text: def.name, ttl: 2.2 };
    this.onPerk?.(def.id);
  }

  private useCache(): void {
    const p = this.player;
    if (this.cache.isOffering) {
      const id = this.cache.take();
      if (!id) return;
      p.acquire(id);
      this.notice = { text: getWeapon(id).name, ttl: 2.2 };
      this.onBuy?.();
      return;
    }
    if (!this.cache.isIdle) return;
    const r = spend(p.points, CACHE_COST);
    if (!r.ok) {
      this.onDenied?.();
      return;
    }
    p.points = r.points;
    this.cache.open();
    this.onCacheOpen?.();
  }

  private buySupply(): void {
    const p = this.player;
    if (p.grenades >= MAX_GRENADES) {
      this.onDenied?.();
      return;
    }
    const r = spend(p.points, SUPPLY_COST);
    if (!r.ok) {
      this.onDenied?.();
      return;
    }
    p.points = r.points;
    p.refillGrenades();
    this.onBuy?.();
  }

  // ---- transient effects ----

  private updateTransient(dt: number): void {
    if (this.muzzle > 0) this.muzzle -= dt;
    if (this.banner.ttl > 0) this.banner.ttl -= dt;
    if (this.notice.ttl > 0) this.notice.ttl -= dt;
    for (const t of this.tracers) t.ttl -= dt;
    this.tracers = this.tracers.filter((t) => t.ttl > 0);
    for (const b of this.blasts) b.ttl -= dt;
    this.blasts = this.blasts.filter((b) => b.ttl > 0);
  }
}

/** Whether two focus values point at the same thing in the world. */
function sameFocus(a: Focus | null, b: Focus | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "wallbuy":
      return b.kind === "wallbuy" && a.wallBuy === b.wallBuy;
    case "door":
      return b.kind === "door" && a.door === b.door;
    case "perk":
      return b.kind === "perk" && a.machine === b.machine;
    case "cache":
      return b.kind === "cache" && a.site === b.site;
    case "supply":
      return b.kind === "supply" && a.supply === b.supply;
    case "repair":
      return b.kind === "repair" && a.barrier.index === b.barrier.index;
  }
}

/** A fresh Cache with its own unseeded draw sequence. */
function newCache(): Cache {
  return new Cache(CACHE_POOL, mulberry32((Math.random() * 0xffffffff) >>> 0));
}
