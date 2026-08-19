// The player entity: transform, survival state, points, and the 1–2 carried
// weapons with their ammo/reload/cooldown clocks. DOM-free and three-free —
// the World drives movement/firing, this owns the per-entity bookkeeping.

import type { Vec2 } from "../core/math";
import { clamp } from "../core/math";
import type { WeaponDef, WeaponInstance } from "./types";
import { getWeapon } from "../data/weapons";
import { applyReload, canReload, refillAmmo, makeInstance } from "./Weapons";
import { START_POINTS } from "./Economy";

const MAX_WEAPONS = 2;
const REGEN_DELAY = 4; // seconds after damage before health regenerates
const REGEN_RATE = 40; // hp per second once regen kicks in
const HURT_IFRAMES = 0.5; // seconds of invulnerability after a hit

export class Player {
  pos: Vec2;
  vel: Vec2 = { x: 0, y: 0 };
  aim = 0;
  radius = 0.45;

  maxHealth = 150;
  health = 150;
  alive = true;
  private hurtCooldown = 0;
  private regenDelay = 0;
  damageFlash = 0; // 0..1, decays — drives HUD vignette

  points = START_POINTS;

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

  /** Tick down per-frame clocks and complete reloads / regen. */
  tick(dt: number): void {
    this.fireCooldown -= dt;
    this.hurtCooldown -= dt;
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2);

    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) applyReload(this.weapon(), this.def());
    }

    if (this.regenDelay > 0) {
      this.regenDelay -= dt;
    } else if (this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + REGEN_RATE * dt);
    }
  }

  hurt(amount: number): void {
    if (!this.alive || this.hurtCooldown > 0) return;
    this.health -= amount;
    this.hurtCooldown = HURT_IFRAMES;
    this.regenDelay = REGEN_DELAY;
    this.damageFlash = 1;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
  }

  startReload(): void {
    if (this.reloadTimer <= 0 && canReload(this.weapon(), this.def())) {
      this.reloadTimer = this.def().reloadTime;
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
