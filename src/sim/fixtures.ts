// Footprints for the things a map places that are not props: perk machines,
// The Cache, and grenade resupply crates. Same job `props.ts` does for scenery —
// one source of truth for collision, the 3D meshes, and the 2D footprints, so
// what blocks you and what you can see can never disagree.

import type { Vec2 } from "../core/math";
import type { WallRect } from "./types";

export interface FixtureSpec {
  /** Half extents before rotation. */
  hx: number;
  hy: number;
  /** Height in world units above the ground it stands on. */
  height: number;
  /** Whether it blocks movement and bullets. */
  solid: boolean;
}

/** A chest-high cabinet you have to walk around. */
export const PERK_MACHINE: FixtureSpec = { hx: 0.55, hy: 0.45, height: 2.1, solid: true };
/**
 * The Cache is a strapped timber crate you have to walk around. It relocates
 * mid-round, so World re-runs `buildObstacles` (and the flow field) whenever the
 * box moves — without that, a solid Cache would leave an invisible box behind
 * wherever it used to be, which is why this was non-solid to begin with.
 */
export const CACHE_BOX: FixtureSpec = { hx: 0.9, hy: 0.62, height: 0.95, solid: true };
/** A thigh-high ammo crate. Hard-edged enough that walking through it reads as a
 *  bug, so it blocks; the jump clears it if you want to be on top of it. */
export const SUPPLY_CRATE: FixtureSpec = { hx: 0.6, hy: 0.45, height: 0.62, solid: true };

/** The world AABB a fixture covers, rotation included. */
export function fixtureAabb(spec: FixtureSpec, pos: Vec2, rot = 0): WallRect {
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  const ex = spec.hx * c + spec.hy * s;
  const ey = spec.hx * s + spec.hy * c;
  return { minX: pos.x - ex, minY: pos.y - ey, maxX: pos.x + ex, maxY: pos.y + ey };
}
