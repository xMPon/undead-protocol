// Fragmentation grenades: the one thing the player carries that is not hitscan.
// A grenade is a tiny circle with a fuse that arcs, bounces, and then hands the
// World a blast radius to resolve. The entity is data plus a fuse; the physics
// and the damage live in World, which already owns gravity and the obstacle
// list. DOM-free.

import type { Vec2 } from "../core/math";

/** Seconds from the throw to the bang. Cook time is deliberately not a thing. */
export const GRENADE_FUSE = 2.6;
/** Everything inside this radius takes something. */
export const GRENADE_RADIUS = 5.5;
/** Damage at the centre of the blast. */
export const GRENADE_MAX_DAMAGE = 900;
/** Damage at the very edge, as a fraction of the centre. */
export const GRENADE_EDGE_FRAC = 0.15;
/** Horizontal launch speed. */
export const THROW_SPEED = 13;
/** Vertical launch speed — enough of a lob to clear a crate. */
export const THROW_VZ = 5.5;
/** Seconds between throws, so a full pouch cannot be dumped in one frame. */
export const THROW_COOLDOWN = 0.7;
/** How much of the blast the thrower takes if they are stood in it. */
export const SELF_DAMAGE_FRAC = 0.35;
/** Grenades carried at spawn, and the most a resupply will top you up to. */
export const START_GRENADES = 2;
export const MAX_GRENADES = 4;
/** Points for a resupply crate. */
export const SUPPLY_COST = 250;

export const GRENADE_RADIUS_BODY = 0.16;

/**
 * Damage dealt at `dist` from the centre of a blast: full at the seat, falling
 * off smoothly to `GRENADE_EDGE_FRAC` at the rim, nothing beyond it.
 */
export function blastDamage(dist: number, radius = GRENADE_RADIUS, max = GRENADE_MAX_DAMAGE): number {
  if (dist >= radius) return 0;
  const t = 1 - dist / radius;
  return max * (GRENADE_EDGE_FRAC + (1 - GRENADE_EDGE_FRAC) * t * t);
}

let NEXT_ID = 1;

export class Grenade {
  readonly id: number;
  pos: Vec2;
  /** Horizontal velocity on the sim plane. */
  vel: Vec2;
  /** Absolute height of the grenade. */
  footY: number;
  vz: number;
  onGround = false;
  fuse = GRENADE_FUSE;
  radius = GRENADE_RADIUS_BODY;
  /** Spin angle, for the renderers. */
  spin = 0;

  constructor(pos: Vec2, vel: Vec2, footY: number, vz: number) {
    this.id = NEXT_ID++;
    this.pos = { x: pos.x, y: pos.y };
    this.vel = { x: vel.x, y: vel.y };
    this.footY = footY;
    this.vz = vz;
  }
}
