// Single source of truth for prop dimensions. Used by Map/World (collision
// footprint + obstacle top height), the 3D renderer (mesh sizing / light
// emission), and the 2D renderer (footprint drawing). Pure data.

import type { PropKind } from "./types";

export interface PropSpec {
  /** Half-extents of the footprint (x, y) before scale/rotation. */
  hx: number;
  hy: number;
  /** Height in world units (top = ground + height*scale). */
  height: number;
  /** Default colour (hex). */
  color: number;
  /** Emits light in the 3D view (lamp head / car headlights). */
  emits?: boolean;
}

export const PROP_SPECS: Record<PropKind, PropSpec> = {
  crate: { hx: 0.45, hy: 0.45, height: 0.9, color: 0x6b4f2a },
  barrel: { hx: 0.4, hy: 0.4, height: 0.95, color: 0x6e4a2a },
  rock: { hx: 0.55, hy: 0.55, height: 1.2, color: 0x565550 },
  sandbag: { hx: 0.55, hy: 0.32, height: 0.42, color: 0x8a7a4a },
  container: { hx: 1.5, hy: 0.6, height: 2.4, color: 0x3a6a8a },
  lamp: { hx: 0.18, hy: 0.18, height: 4.2, color: 0xffe0b0, emits: true },
  car: { hx: 1.1, hy: 0.5, height: 1.3, color: 0x8a2a2a, emits: true },
};

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
