// The player entity: transform, survival state, perks, grenades, points, and
// the 1–2 carried weapons with their ammo/reload/cooldown clocks. DOM-free and
// three-free — the World drives movement/firing, this owns the per-entity
// bookkeeping. Every perk effect is asked for through `sim/Perks.ts`, so the
// rule for what a perk does lives in exactly one place.

import type { Vec2 } from "../core/math";
import { clamp } from "../core/math";
import type { WeaponDef, WeaponInstance } from "./types";
import { getWeapon } from "../data/weapons";
import { applyReload, canReload, refillAmmo, makeInstance, fireInterval } from "./Weapons";
import { START_POINTS } from "./Economy";
import { fireIntervalMul, healthMul, reloadMul, hasSelfRevive, REVIVE_HEALTH_FRAC, REVIVE_TIME } from "./Perks";
import { START_GRENADES, MAX_GRENADES, THROW_COOLDOWN } from "./Grenade";

const MAX_WEAPONS = 2;
/** Base maximum health, before Ironhide. */
const BASE_MAX_HEALTH = 150;
/** Walk-speed multiplier while aiming down sights. */
export const ADS_SPEED_MUL = 0.55;
/** Spread multiplier while aiming down sights. */
export const ADS_SPREAD_MUL = 0.3;
const REGEN_DELAY = 4; // seconds after damage before health regenerates
const REGEN_RATE = 40; // hp per second once regen kicks in
const HURT_IFRAMES = 0.5; // seconds of invulnerability after a hit

export class Player {
  pos: Vec2;
  vel: Vec2 = { x: 0, y: 0 };
  aim = 0;
  radius = 0.45;

  /** Absolute height of the feet (world up). Set by World from the terrain. */
  footY = 0;
  /** Vertical velocity for jumping. */
  vz = 0;
  onGround = true;

  maxHealth = BASE_MAX_HEALTH;
  health = BASE_MAX_HEALTH;
  alive = true;
  /** On the floor after a killing blow, waiting for Second Wind to pick you up. */
  downed = false;
  downTimer = 0;
  private hurtCooldown = 0;
  private regenDelay = 0;
  damageFlash = 0; // 0..1, decays — drives HUD vignette

  points = START_POINTS;
  /** Perk ids currently held. Lost on death, like everything else. */
  readonly perks = new Set<string>();
  grenades = START_GRENADES;
  grenadeCooldown = 0;

  weapons: WeaponInstance[] = [makeInstance(getWeapon("m9"))];
  current = 0;
  fireCooldown = 0;
  reloadTimer = 0;

  speed = 6.4;
  sprintMul = 1.5;

  constructor(spawn: Vec2) {
    this.pos = { x: spawn.x, y: spawn.y };
  }

  weapon(): WeaponInstance {
    return this.weapons[this.current];
  }
  def(): WeaponDef {
    return getWeapon(this.weapon().defId);
  }

  /** Seconds between shots for the carried weapon, after Rapid Rounds. */
  fireInterval(): number {
    return fireInterval(this.def()) * fireIntervalMul(this.perks);
  }
  /** Seconds a reload takes for the carried weapon, after Fast Hands. */
  reloadDuration(): number {
    return this.def().reloadTime * reloadMul(this.perks);
  }
  hasPerk(id: string): boolean {
    return this.perks.has(id);
  }

  /**
   * Grant a perk. Ironhide moves the health ceiling, and the top-up comes with
   * it — a perk you paid 2500 for that leaves you on a sliver is not a perk.
   */
  grantPerk(id: string): void {
    if (this.perks.has(id)) return;
    this.perks.add(id);
    this.maxHealth = BASE_MAX_HEALTH * healthMul(this.perks);
    this.health = this.maxHealth;
  }

  canThrow(): boolean {
    return this.grenades > 0 && this.grenadeCooldown <= 0 && !this.downed && this.alive;
  }

  /** Spend a grenade. Returns false when the pouch is empty or still cooling. */
  takeGrenade(): boolean {
    if (!this.canThrow()) return false;
    this.grenades--;
    this.grenadeCooldown = THROW_COOLDOWN;
    return true;
  }

  /** Top the pouch back up. Returns false when it was already full. */
  refillGrenades(): boolean {
    if (this.grenades >= MAX_GRENADES) return false;
    this.grenades = MAX_GRENADES;
    return true;
  }

  /**
   * Tick down per-frame clocks and complete reloads / regen. Returns true on the
   * frame Second Wind puts the player back on their feet, so the World can make
   * a noise about it.
   */
  tick(dt: number): boolean {
    this.fireCooldown -= dt;
    this.hurtCooldown -= dt;
    this.grenadeCooldown -= dt;
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2);

    if (this.downed) {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        this.downed = false;
        this.health = this.maxHealth * REVIVE_HEALTH_FRAC;
        this.regenDelay = REGEN_DELAY;
        this.hurtCooldown = HURT_IFRAMES;
        return true;
      }
      return false;
    }

    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) applyReload(this.weapon(), this.def());
    }

    if (this.regenDelay > 0) {
      this.regenDelay -= dt;
    } else if (this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + REGEN_RATE * dt);
    }
    return false;
  }

  /**
   * Take damage. A killing blow with Second Wind held spends the perk and puts
   * the player on the floor instead of ending the run; without it, that is the
   * end. Being down is its own invulnerability — the horde standing over you
   * finishing the job would make the perk worth nothing.
   */
  hurt(amount: number): void {
    if (!this.alive || this.downed || this.hurtCooldown > 0) return;
    this.health -= amount;
    this.hurtCooldown = HURT_IFRAMES;
    this.regenDelay = REGEN_DELAY;
    this.damageFlash = 1;
    if (this.health <= 0) {
      this.health = 0;
      if (hasSelfRevive(this.perks)) {
        this.perks.delete("secondwind");
        this.maxHealth = BASE_MAX_HEALTH * healthMul(this.perks);
        this.downed = true;
        this.downTimer = REVIVE_TIME;
        this.reloadTimer = 0;
        return;
      }
      this.alive = false;
    }
  }

  startReload(): void {
    if (this.reloadTimer <= 0 && canReload(this.weapon(), this.def())) {
      this.reloadTimer = this.reloadDuration();
    }
  }

  switchTo(index: number): void {
    if (index < 0 || index >= this.weapons.length || index === this.current) return;
    if (this.reloadTimer > 0) return;
    this.current = index;
    this.fireCooldown = Math.max(this.fireCooldown, 0.15);
  }

  hasWeapon(defId: string): number {
    return this.weapons.findIndex((w) => w.defId === defId);
  }

  /**
   * Acquire a wall-buy weapon. If already owned, tops up ammo. Otherwise adds a
   * slot (max 2); if full, replaces the currently-held weapon.
   */
  acquire(defId: string): void {
    const def = getWeapon(defId);
    const owned = this.hasWeapon(defId);
    if (owned >= 0) {
      refillAmmo(this.weapons[owned], def);
      this.current = owned;
      return;
    }
    if (this.weapons.length < MAX_WEAPONS) {
      this.weapons.push(makeInstance(def));
      this.current = this.weapons.length - 1;
    } else {
      this.weapons[this.current] = makeInstance(def);
    }
    this.reloadTimer = 0;
  }

  healthFrac(): number {
    return clamp(this.health / this.maxHealth, 0, 1);
  }
}
