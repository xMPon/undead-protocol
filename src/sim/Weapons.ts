// Pure weapon mechanics operating on a WeaponInstance (live ammo) plus its
// static WeaponDef. No timers here — the Player owns cooldown/reload clocks and
// calls these to mutate ammo. Kept side-effect-light and testable.

import type { WeaponDef, WeaponInstance } from "./types";

/** Seconds between shots derived from rounds-per-minute. */
export function fireInterval(def: WeaponDef): number {
  return 60 / def.rpm;
}

/** Can this weapon fire right now (rounds chambered, not mid-reload/cooldown)? */
export function canFire(inst: WeaponInstance, fireCooldown: number, reloadTimer: number): boolean {
  return inst.mag > 0 && fireCooldown <= 0 && reloadTimer <= 0;
}

/** Would a reload do anything (room in mag and rounds in reserve)? */
export function canReload(inst: WeaponInstance, def: WeaponDef): boolean {
  return inst.mag < def.magSize && inst.reserve > 0;
}

/** Spend one round from the magazine. */
export function consumeRound(inst: WeaponInstance): void {
  if (inst.mag > 0) inst.mag--;
}

/** Move rounds from reserve into the magazine (simple whole-mag reload). */
export function applyReload(inst: WeaponInstance, def: WeaponDef): void {
  const need = def.magSize - inst.mag;
  const take = Math.min(need, inst.reserve);
  inst.mag += take;
  inst.reserve -= take;
}

/** Refill both magazine and reserve to full (wall-buy re-purchase / max ammo). */
export function refillAmmo(inst: WeaponInstance, def: WeaponDef): void {
  inst.mag = def.magSize;
  inst.reserve = def.reserveMax;
}

/** Total rounds available including the magazine. */
export function totalAmmo(inst: WeaponInstance): number {
  return inst.mag + inst.reserve;
}

/** A fresh, fully-loaded instance of a weapon. */
export function makeInstance(def: WeaponDef): WeaponInstance {
  return { defId: def.id, mag: def.magSize, reserve: def.reserveMax };
}
