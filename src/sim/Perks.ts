// What a perk actually does. Pure functions over the set of perk ids the player
// owns, so the effects are unit-testable on their own and every consumer —
// Player, World, the HUD — asks the same question the same way.

import { PERKS } from "../data/perks";

/** You can hold every perk on the board; there are only four. */
export const MAX_PERKS = 4;

/** Health returned when Second Wind picks you back up, as a fraction of max. */
export const REVIVE_HEALTH_FRAC = 0.5;
/** Seconds spent on the floor before Second Wind revives you. */
export const REVIVE_TIME = 4.5;

type PerkSet = ReadonlySet<string>;

/** Maximum-health multiplier (Ironhide). */
export function healthMul(perks: PerkSet): number {
  return perks.has("ironhide") ? 2 : 1;
}

/** Multiplier on the seconds between shots (Rapid Rounds — lower is faster). */
export function fireIntervalMul(perks: PerkSet): number {
  return perks.has("rapidrounds") ? 0.7 : 1;
}

/** Multiplier on reload time (Fast Hands). */
export function reloadMul(perks: PerkSet): number {
  return perks.has("fasthands") ? 0.5 : 1;
}

/** Whether a killing blow puts the player down instead of ending the run. */
export function hasSelfRevive(perks: PerkSet): boolean {
  return perks.has("secondwind");
}

/** Every perk id the registry knows, for validation. */
export function isPerkId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(PERKS, id);
}
