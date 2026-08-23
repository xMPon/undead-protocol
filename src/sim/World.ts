// The simulation. Owns every piece of game state and advances it via a single
// update(dt, intent) call. Strictly headless: no DOM, no three.js — renderers
// read this, they never write to it. Audio/UI hooks are optional callbacks so
// the sim stays decoupled from presentation.

import type { Vec2 } from "../core/math";
import { add, angleOf, clamp, fromAngle, len, norm, rotate, scale, sub, distSq } from "../core/math";
import { randInt } from "../core/rng";
import type { Intent, Tracer, Obstacle } from "./types";
import { GameMap } from "./Map";
import { Player } from "./Player";
import { Zombie, ZOMBIE_TOUCH_DAMAGE, ZOMBIE_ATTACK_CADENCE } from "./Zombie";
import { RoundManager } from "./Round";
import { spawnGate, spawnInterval } from "./Spawner";
import { FlowField } from "./pathing";
import { Terrain, FLAT_TERRAIN } from "./Terrain";
import { resolveCircleObstacles, supportHeight, rayVsCircle, nearestWallDist } from "./collision";
import { canFire, consumeRound, canReload, fireInterval } from "./Weapons";
import { POINTS_HIT, POINTS_KILL, spend } from "./Economy";
import { PROP_SPECS, footprintExtents, isSolidProp } from "./props";
import { getWeapon } from "../data/weapons";
import { BLACKSITE } from "../data/map_blacksite";
import type { MapDef } from "./types";

const FLOW_INTERVAL = 0.15; // seconds between flow-field recomputes
const SEPARATION_RADIUS = 1.05;
const GRAVITY = 24; // world units / s^2
const JUMP_V = 8.2; // launch velocity (peak ~1.4 units — clears crates/barrels)
const WALL_TOP = 1000; // effectively impassable
const STUCK_TIME = 0.4; // seconds barely moving before a zombie nudges/jumps
const ATTACK_MAX_DZ = 1.2; // max feet-height gap for a zombie to land a hit

export interface InteractPrompt {
  kind: "wallbuy" | "door";
  text: string;
  cost: number;
  affordable: boolean;
}

/** Zombie move speed for a given round (Phase 1: walkers with a gentle ramp). */
function zombieSpeed(round: number): number {
  return Math.min(4.2, 2.0 + round * 0.08);
}

export class World {
  readonly def: MapDef;
  map: GameMap;
  player: Player;
  zombies: Zombie[] = [];
  rounds = new RoundManager();
  flow: FlowField;
  terrain: Terrain;
  obstacles: Obstacle[] = [];

  tracers: Tracer[] = [];
  muzzle = 0; // muzzle-flash timer for renderers
  banner = { text: "", ttl: 0 };
  kills = 0;
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
  onDoor?: () => void;
  onDeath?: () => void;

  private spawnCooldown = 0;
  private flowTimer = 0;
  private prevFiring = false;
  private prevInteract = false;
  private prevReload = false;

  constructor(def: MapDef = BLACKSITE) {
    this.def = def;
    this.map = new GameMap(def);
    this.player = new Player(def.playerSpawn);
    this.terrain = new Terrain(def.terrain ?? FLAT_TERRAIN);
    this.player.footY = this.terrain.heightAt(this.player.pos.x, this.player.pos.y);
    this.buildObstacles();
    this.flow = new FlowField(def.bounds, 0.8);
    this.flow.rebuild(this.map.walls);
    this.flow.compute(this.player.pos);
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
      const { ex, ey } = footprintExtents(p.kind, s, p.rot ?? 0);
      const rect = { minX: p.pos.x - ex, minY: p.pos.y - ey, maxX: p.pos.x + ex, maxY: p.pos.y + ey };
      const top = this.terrain.heightAt(p.pos.x, p.pos.y) + PROP_SPECS[p.kind].height * s;
      obs.push({ rect, top });
    }
    this.obstacles = obs;
  }

  /** Reset to a fresh game while preserving wired callbacks. */
  reset(): void {
    this.map = new GameMap(this.def);
    this.player = new Player(this.def.playerSpawn);
    this.player.footY = this.terrain.heightAt(this.player.pos.x, this.player.pos.y);
    this.zombies = [];
    this.rounds = new RoundManager();
    this.tracers = [];
    this.kills = 0;
    this.gameOver = false;
    this.prompt = null;
    this.banner = { text: "", ttl: 0 };
    this.spawnCooldown = 0;
    this.flowTimer = 0;
    this.prevFiring = this.prevInteract = this.prevReload = false;
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

    this.handleMovement(dt, intent);
    this.player.aim = intent.aim;
    this.handleWeaponInput(intent);
    this.player.tick(dt);

    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.flow.compute(this.player.pos);
      this.flowTimer = FLOW_INTERVAL;
    }

    this.updateRounds(dt);
    this.updateZombies(dt);

    this.updatePrompt();
    this.handleInteract(intent);

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
    const sp = p.speed * (intent.sprint ? p.sprintMul : 1);
    const desired = { x: p.pos.x + mv.x * sp * dt, y: p.pos.y + mv.y * sp * dt };
    p.pos = resolveCircleObstacles(desired, p.radius, p.footY, this.obstacles);
    // Keep the player caged inside the map even where zombie barriers leave gaps.
    const pb = this.def.playBounds;
    if (pb) {
      p.pos.x = clamp(p.pos.x, pb.minX + p.radius, pb.maxX - p.radius);
      p.pos.y = clamp(p.pos.y, pb.minY + p.radius, pb.maxY - p.radius);
    }
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
    p.fireCooldown = fireInterval(def);
    this.muzzle = 0.05;
    this.onShot?.(def.id);

    const origin = { x: p.pos.x, y: p.pos.y };
    let anyHit = false;
    for (let i = 0; i < def.pellets; i++) {
      const a = p.aim + (Math.random() * 2 - 1) * def.spread;
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
          this.onKill?.();
        }
      }
    }
    if (anyHit) this.onHitZombie?.();
  }

  // ---- rounds & spawning ----

  private updateRounds(dt: number): void {
    const alive = this.aliveCount();
    const ev = this.rounds.tick(dt, alive);
    if (ev === "start") {
      this.banner = { text: `Round ${this.rounds.round}`, ttl: 2.2 };
      this.onRoundStart?.(this.rounds.round);
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
    const barriers = this.map.activeBarriers();
    if (barriers.length === 0) return false;
    const b = barriers[randInt(0, barriers.length - 1)];
    const pos = { x: b.pos.x - b.inward.x, y: b.pos.y - b.inward.y };
    const z = new Zombie(pos, this.rounds.spawnHealth, zombieSpeed(this.rounds.round));
    z.facing = angleOf(b.inward);
    z.footY = this.terrain.heightAt(pos.x, pos.y);
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

  private updatePrompt(): void {
    const p = this.player;
    const wb = this.map.nearestWallBuy(p.pos);
    if (wb) {
      const def = getWeapon(wb.weaponId);
      const owned = p.hasWeapon(wb.weaponId) >= 0;
      const cost = owned ? def.ammoCost : def.wallCost;
      this.prompt = { kind: "wallbuy", text: owned ? `${def.name} — Ammo` : def.name, cost, affordable: p.points >= cost };
      return;
    }
    const door = this.map.nearestClosedDoor(p.pos);
    if (door) {
      this.prompt = { kind: "door", text: "Open Door", cost: door.cost, affordable: p.points >= door.cost };
      return;
    }
    this.prompt = null;
  }

  private handleInteract(intent: Intent): void {
    const edge = intent.interact && !this.prevInteract;
    this.prevInteract = intent.interact;
    if (!edge || !this.prompt) return;

    const p = this.player;
    if (this.prompt.kind === "wallbuy") {
      const wb = this.map.nearestWallBuy(p.pos);
      if (!wb) return;
      const def = getWeapon(wb.weaponId);
      const owned = p.hasWeapon(wb.weaponId) >= 0;
      const cost = owned ? def.ammoCost : def.wallCost;
      const r = spend(p.points, cost);
      if (r.ok) {
        p.points = r.points;
        p.acquire(wb.weaponId);
        this.onBuy?.();
      } else {
        this.onDenied?.();
      }
    } else {
      const door = this.map.nearestClosedDoor(p.pos);
      if (!door) return;
      const r = spend(p.points, door.cost);
      if (r.ok) {
        p.points = r.points;
        this.map.openDoor(door.id);
        this.buildObstacles();
        this.flow.rebuild(this.map.walls);
        this.onDoor?.();
      } else {
        this.onDenied?.();
      }
    }
  }

  // ---- transient effects ----

  private updateTransient(dt: number): void {
    if (this.muzzle > 0) this.muzzle -= dt;
    if (this.banner.ttl > 0) this.banner.ttl -= dt;
    for (const t of this.tracers) t.ttl -= dt;
    this.tracers = this.tracers.filter((t) => t.ttl > 0);
  }
}
