// Single source of truth for prop dimensions. Used by Map/World (collision
// footprint + obstacle top height), the 3D renderer (mesh sizing / light
// emission), and the 2D renderer (footprint drawing). Pure data.

import type { PropKind, PropDef, WallRect } from "./types";

/** One solid piece of a placed prop, in world space. A disc when `radius` is set. */
export interface PropCollider {
  cx: number;
  cy: number;
  /** Half extents of the oriented box (ignored when `radius` is set). */
  hx: number;
  hy: number;
  rot: number;
  radius?: number;
}

export interface PropSpec {
  /** Half-extents of the footprint (x, y) before scale/rotation. */
  hx: number;
  hy: number;
  /** Height in world units (top = ground + height*scale). */
  height: number;
  /** Default colour (hex). */
  color: number;
  /** Casts a real light in the 3D view (lamp head / headlights / flame / floodlight).
   *  Self-lit detail like the generator LED or the mast beacon is emissive-only and
   *  deliberately does NOT set this — point lights cost per fragment, glow does not. */
  emits?: boolean;
  /** Dressing only: no collision unless a PropDef opts in with `solid: true`. */
  decor?: boolean;
  /** Collides as a disc of radius `hx` rather than a box — drums, posts, tanks,
   *  anything the player can see is round. Squaring these off is what a
   *  "caught on nothing" corner feels like. */
  round?: boolean;
  /** Sub-footprints in local space (+x along the prop's `rot`). When set, the
   *  prop collides as these pieces instead of one block, so you can walk between
   *  the legs of a structure the way it looks like you should. */
  parts?: Array<{ dx: number; dy: number; hx: number; hy: number }>;
}

export const PROP_SPECS: Record<PropKind, PropSpec> = {
  // --- Cover and clutter ---
  crate: { hx: 0.45, hy: 0.45, height: 0.9, color: 0x6b4f2a },
  barrel: { hx: 0.4, hy: 0.4, height: 0.95, color: 0x6e4a2a, round: true },
  rock: { hx: 0.55, hy: 0.55, height: 1.2, color: 0x565550, round: true },
  sandbag: { hx: 0.55, hy: 0.32, height: 0.42, color: 0x8a7a4a },
  container: { hx: 1.5, hy: 0.6, height: 2.4, color: 0x3a6a8a },
  pallet: { hx: 0.6, hy: 0.5, height: 0.34, color: 0x8a6f42 },
  pipe: { hx: 2.0, hy: 0.55, height: 1.1, color: 0x4a5054 },
  dumpster: { hx: 1.0, hy: 0.55, height: 1.25, color: 0x2f5a3a },
  concreteBarrier: { hx: 1.0, hy: 0.32, height: 0.85, color: 0x8b8a84 },
  rubble: { hx: 0.9, hy: 0.7, height: 0.55, color: 0x5a5650 },
  deadTree: { hx: 0.3, hy: 0.3, height: 4.6, color: 0x3b3128, round: true },
  wreck: { hx: 1.1, hy: 0.5, height: 1.15, color: 0x2b2724 },

  // --- Compound structure and machinery ---
  // A walk-in outbuilding: four walls with a 2.2-wide doorway on its +x face.
  // The doorway has to stay wide enough for the 0.8-unit flow-field grid to keep
  // a walkable cell through it, or zombies will not follow you inside.
  blockhouse: {
    hx: 2.0,
    hy: 1.8,
    height: 3.0,
    color: 0x6a6963,
    emits: true,
    parts: [
      { dx: -1.85, dy: 0, hx: 0.15, hy: 1.8 },
      { dx: 0, dy: -1.65, hx: 2.0, hy: 0.15 },
      { dx: 0, dy: 1.65, hx: 2.0, hy: 0.15 },
      { dx: 1.85, dy: -1.45, hx: 0.15, hy: 0.35 },
      { dx: 1.85, dy: 1.45, hx: 0.15, hy: 0.35 },
    ],
  },
  fence: { hx: 1.6, hy: 0.08, height: 2.4, color: 0x6b7076 },
  generator: { hx: 1.1, hy: 0.6, height: 1.4, color: 0x5a6a4a },
  tank: { hx: 0.95, hy: 0.95, height: 4.2, color: 0x7d7f78, round: true },
  tower: {
    hx: 1.2,
    hy: 1.2,
    height: 6.4,
    color: 0x50565c,
    emits: true,
    parts: [
      { dx: -1.0, dy: -1.0, hx: 0.22, hy: 0.22 },
      { dx: 1.0, dy: -1.0, hx: 0.22, hy: 0.22 },
      { dx: -1.0, dy: 1.0, hx: 0.22, hy: 0.22 },
      { dx: 1.0, dy: 1.0, hx: 0.22, hy: 0.22 },
    ],
  },
  antenna: { hx: 0.35, hy: 0.35, height: 9.5, color: 0x585e64, round: true },

  // --- Light sources ---
  lamp: { hx: 0.18, hy: 0.18, height: 4.2, color: 0xffe0b0, emits: true, round: true },
  car: { hx: 1.1, hy: 0.5, height: 1.3, color: 0x8a2a2a, emits: true },
  floodlight: { hx: 0.5, hy: 0.5, height: 2.5, color: 0xfff0cc, emits: true, round: true },
  firebarrel: { hx: 0.4, hy: 0.4, height: 0.95, color: 0x4a3a2a, emits: true, round: true },

  // --- Non-blocking dressing ---
  cone: { hx: 0.22, hy: 0.22, height: 0.55, color: 0xd85a1e, decor: true, round: true },
  sign: { hx: 0.6, hy: 0.1, height: 1.9, color: 0xd8b32a, decor: true },
  puddle: { hx: 1.4, hy: 1.0, height: 0.02, color: 0x1c242a, decor: true },
};

/** Whether a placed prop blocks movement and bullets. */
export function isSolidProp(p: PropDef): boolean {
  return p.solid ?? !PROP_SPECS[p.kind].decor;
}

/**
 * The solids a placed prop actually contributes, in world space. One per entry
 * in the spec's `parts` (or a single box/disc when it has none), already rotated
 * by the prop's yaw. Both the collision obstacles and the flow-field walls are
 * built from this, so the two can never drift apart.
 */
export function propColliders(p: PropDef): PropCollider[] {
  const spec = PROP_SPECS[p.kind];
  const s = p.scale ?? 1;
  const rot = p.rot ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const parts = spec.parts ?? [{ dx: 0, dy: 0, hx: spec.hx, hy: spec.hy }];
  return parts.map((part) => ({
    cx: p.pos.x + (part.dx * cos - part.dy * sin) * s,
    cy: p.pos.y + (part.dx * sin + part.dy * cos) * s,
    hx: part.hx * s,
    hy: part.hy * s,
    rot,
    radius: spec.round ? part.hx * s : undefined,
  }));
}

/** The world AABB enclosing a collider — broadphase and flow-field input. */
export function colliderAabb(c: PropCollider): WallRect {
  const ex = c.radius ?? Math.abs(c.hx * Math.cos(c.rot)) + Math.abs(c.hy * Math.sin(c.rot));
  const ey = c.radius ?? Math.abs(c.hx * Math.sin(c.rot)) + Math.abs(c.hy * Math.cos(c.rot));
  return { minX: c.cx - ex, minY: c.cy - ey, maxX: c.cx + ex, maxY: c.cy + ey };
}

/** Rotated axis-aligned half-extents for a prop footprint. */
export function footprintExtents(kind: PropKind, scale: number, rot: number): { ex: number; ey: number } {
  const spec = PROP_SPECS[kind];
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  return {
    ex: spec.hx * scale * c + spec.hy * scale * s,
    ey: spec.hx * scale * s + spec.hy * scale * c,
  };
}
