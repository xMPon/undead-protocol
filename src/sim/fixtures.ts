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
 * The Cache is a low crate and deliberately NOT solid: it relocates mid-round,
 * and an obstacle list that only rebuilds when a door opens would leave an
 * invisible box behind wherever it used to be.
 */
export const CACHE_BOX: FixtureSpec = { hx: 0.9, hy: 0.62, height: 0.95, solid: false };
/** A knee-high ammo crate — dressing you step over. */
export const SUPPLY_CRATE: FixtureSpec = { hx: 0.6, hy: 0.45, height: 0.62, solid: false };

/** The world AABB a fixture covers, rotation included. */
export function fixtureAabb(spec: FixtureSpec, pos: Vec2, rot = 0): WallRect {
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  const ex = spec.hx * c + spec.hy * s;
  const ey = spec.hx * s + spec.hy * c;
  return { minX: pos.x - ex, minY: pos.y - ey, maxX: pos.x + ex, maxY: pos.y + ey };
}
