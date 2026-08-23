// Procedural per-map heightfield. Pure and DOM-free: the sim can hold it and
// both renderers sample it, all testable in Node. Elevation is presentation +
// entity-Y only — movement/collision stay 2D, so nothing here affects gameplay
// determinism beyond where things are drawn.

import { hash01 } from "../core/rng";
import type { TerrainDef, TerrainLayer } from "./types";

export const FLAT_TERRAIN: TerrainDef = { baseHeight: 0, layers: [] };

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Smooth value noise on the integer lattice, returns [0, 1). */
function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const v00 = hash01(x0, y0, seed);
  const v10 = hash01(x0 + 1, y0, seed);
  const v01 = hash01(x0, y0 + 1, seed);
  const v11 = hash01(x0 + 1, y0 + 1, seed);
  const sx = smooth(fx);
  const sy = smooth(fy);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}

function layerHeight(layer: TerrainLayer, x: number, y: number): number {
  const nx = x / layer.wavelength;
  const ny = y / layer.wavelength;
  switch (layer.kind) {
    case "hills":
    case "drifts":
      return (valueNoise(nx, ny, layer.seed) * 2 - 1) * layer.amplitude;
    case "noise":
      return (valueNoise(nx * 2, ny * 2, layer.seed) * 2 - 1) * layer.amplitude;
    case "dunes": {
      const a = layer.angle ?? 0;
      const u = (x * Math.cos(a) + y * Math.sin(a)) / layer.wavelength;
      const ridge = 1 - Math.abs(Math.sin(u * Math.PI));
      return ridge * layer.amplitude + (valueNoise(nx, ny, layer.seed) - 0.5) * layer.amplitude * 0.3;
    }
    case "terraces": {
      const steps = layer.steps ?? 4;
      const n = valueNoise(nx, ny, layer.seed);
      return (Math.floor(n * steps) / steps) * layer.amplitude;
    }
  }
}

export class Terrain {
  constructor(private readonly def: TerrainDef) {}

  heightAt(x: number, y: number): number {
    let h = this.def.baseHeight;
    for (const layer of this.def.layers) h += layerHeight(layer, x, y);

    for (const fz of this.def.flatZones ?? []) {
      const r = fz.rect;
      if (x <= r.minX || x >= r.maxX || y <= r.minY || y >= r.maxY) continue;
      const blend = fz.blend ?? 0;
      if (blend <= 0) {
        h = fz.height;
      } else {
        // Distance to the nearest edge, ramped 0..1 over `blend` units inward.
        const d = Math.min(x - r.minX, r.maxX - x, y - r.minY, r.maxY - y);
        const t = Math.min(1, d / blend);
        h = h + (fz.height - h) * t;
      }
    }
    return h;
  }

  /** Approximate slope magnitude (|∇h|) via central differences. */
  slopeAt(x: number, y: number, eps = 0.5): number {
    const dx = (this.heightAt(x + eps, y) - this.heightAt(x - eps, y)) / (2 * eps);
    const dy = (this.heightAt(x, y + eps) - this.heightAt(x, y - eps)) / (2 * eps);
    return Math.hypot(dx, dy);
  }
}
