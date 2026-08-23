// Single source of truth for prop dimensions. Used by Map/World (collision
// footprint + obstacle top height), the 3D renderer (mesh sizing / light
// emission), and the 2D renderer (footprint drawing). Pure data.

import type { PropKind, PropDef } from "./types";

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
}

export const PROP_SPECS: Record<PropKind, PropSpec> = {
  // --- Cover and clutter ---
  crate: { hx: 0.45, hy: 0.45, height: 0.9, color: 0x6b4f2a },
  barrel: { hx: 0.4, hy: 0.4, height: 0.95, color: 0x6e4a2a },
  rock: { hx: 0.55, hy: 0.55, height: 1.2, color: 0x565550 },
  sandbag: { hx: 0.55, hy: 0.32, height: 0.42, color: 0x8a7a4a },
  container: { hx: 1.5, hy: 0.6, height: 2.4, color: 0x3a6a8a },
  pallet: { hx: 0.6, hy: 0.5, height: 0.34, color: 0x8a6f42 },
  pipe: { hx: 2.0, hy: 0.55, height: 1.1, color: 0x4a5054 },
  dumpster: { hx: 1.0, hy: 0.55, height: 1.25, color: 0x2f5a3a },
  concreteBarrier: { hx: 1.0, hy: 0.32, height: 0.85, color: 0x8b8a84 },
  rubble: { hx: 0.9, hy: 0.7, height: 0.55, color: 0x5a5650 },
  deadTree: { hx: 0.3, hy: 0.3, height: 4.6, color: 0x3b3128 },
  wreck: { hx: 1.1, hy: 0.5, height: 1.15, color: 0x2b2724 },

  // --- Compound structure and machinery ---
  fence: { hx: 1.6, hy: 0.08, height: 2.4, color: 0x6b7076 },
  generator: { hx: 1.1, hy: 0.6, height: 1.4, color: 0x5a6a4a },
  tank: { hx: 0.95, hy: 0.95, height: 4.2, color: 0x7d7f78 },
  tower: { hx: 1.2, hy: 1.2, height: 6.4, color: 0x50565c, emits: true },
  antenna: { hx: 0.35, hy: 0.35, height: 9.5, color: 0x585e64 },

  // --- Light sources ---
  lamp: { hx: 0.18, hy: 0.18, height: 4.2, color: 0xffe0b0, emits: true },
  car: { hx: 1.1, hy: 0.5, height: 1.3, color: 0x8a2a2a, emits: true },
  floodlight: { hx: 0.5, hy: 0.5, height: 2.5, color: 0xfff0cc, emits: true },
  firebarrel: { hx: 0.4, hy: 0.4, height: 0.95, color: 0x4a3a2a, emits: true },

  // --- Non-blocking dressing ---
  cone: { hx: 0.22, hy: 0.22, height: 0.55, color: 0xd85a1e, decor: true },
  sign: { hx: 0.6, hy: 0.1, height: 1.9, color: 0xd8b32a, decor: true },
  puddle: { hx: 1.4, hy: 1.0, height: 0.02, color: 0x1c242a, decor: true },
};

/** Whether a placed prop blocks movement and bullets. */
export function isSolidProp(p: PropDef): boolean {
  return p.solid ?? !PROP_SPECS[p.kind].decor;
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
