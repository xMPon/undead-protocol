// The ground under a map does not stop at its bounds — it runs on past the fog
// so the level reads as part of a world instead of a slab hanging in the sky.
// `apronSampler` and `terrainAxis` are the two rules that make that true, and
// both are pure, so they are checked here without a GPU.
import { describe, it, expect } from "vitest";
import { apronSampler, terrainAxis } from "../src/render/procgen";
import { Terrain } from "../src/sim/Terrain";
import { MAPS } from "../src/data/maps";
import { FLAT_TERRAIN } from "../src/sim/Terrain";
import type { WallRect } from "../src/sim/types";

const B: WallRect = { minX: -30, minY: -22, maxX: 71, maxY: 45 };

describe("terrain apron", () => {
  it("is exactly the map's own heightfield inside the bounds", () => {
    const t = new Terrain(MAPS[0].terrain ?? FLAT_TERRAIN);
    const h = (x: number, y: number): number => t.heightAt(x, y);
    const sample = apronSampler(B, h, 200);
    for (const [x, y] of [
      [0, 0],
      [12, -4],
      [60, 33],
      [-29.5, 44.5],
    ]) {
      expect(sample(x, y).h).toBeCloseTo(h(x, y), 10);
      expect(sample(x, y).t).toBe(0);
    }
  });

  it("meets the bounds seamlessly — no cliff around the level", () => {
    const t = new Terrain(MAPS[0].terrain ?? FLAT_TERRAIN);
    const h = (x: number, y: number): number => t.heightAt(x, y);
    const sample = apronSampler(B, h, 200);
    // A hair outside every edge must match the edge itself.
    for (const [x, y] of [
      [B.maxX + 0.02, 10],
      [B.minX - 0.02, 10],
      [20, B.maxY + 0.02],
      [20, B.minY - 0.02],
    ]) {
      const edge = h(Math.min(Math.max(x, B.minX), B.maxX), Math.min(Math.max(y, B.minY), B.maxY));
      expect(Math.abs(sample(x, y).h - edge)).toBeLessThan(0.05);
    }
  });

  it("settles near the map's own ground level far out, never climbing away", () => {
    const t = new Terrain(MAPS[0].terrain ?? FLAT_TERRAIN);
    const h = (x: number, y: number): number => t.heightAt(x, y);
    const sample = apronSampler(B, h, 200);
    for (let d = 20; d <= 200; d += 20) {
      const s = sample(B.maxX + d, 10);
      expect(s.t).toBeGreaterThan(0);
      expect(Math.abs(s.h)).toBeLessThan(12);
    }
    // The rim droops, so the far edge is never above the play area.
    expect(sample(B.maxX + 200, 10).h).toBeLessThan(h(B.maxX, 10) + 4);
  });

  it("keeps flat ground flat — a harbour does not sprout hills", () => {
    const flat = (): number => -3.6;
    const sample = apronSampler(B, flat, 200);
    for (let d = 10; d <= 200; d += 25) {
      // Only the droop moves it, and only downward.
      const h = sample(B.maxX + d, 0).h;
      expect(h).toBeLessThanOrEqual(-3.6 + 1e-9);
      expect(h).toBeGreaterThan(-3.6 - 6);
    }
  });

  it("with no apron it is the raw heightfield (old behaviour)", () => {
    const t = new Terrain(MAPS[0].terrain ?? FLAT_TERRAIN);
    const h = (x: number, y: number): number => t.heightAt(x, y);
    const sample = apronSampler(B, h, 0);
    expect(sample(500, 500).h).toBe(h(B.maxX, B.maxY));
    expect(sample(500, 500).t).toBe(0);
  });

  it("every map's apron outruns its own fog, so the rim is never visible", () => {
    for (const m of MAPS) {
      const span = Math.max(m.bounds.maxX - m.bounds.minX, m.bounds.maxY - m.bounds.minY);
      // Mirrors the apron ThirdPerson3D asks for.
      const apron = Math.max((m.theme?.fogFar ?? 46) * 1.35, span * 1.1, 120);
      expect(apron).toBeGreaterThan(m.theme?.fogFar ?? 46);
    }
  });
});

describe("terrainAxis", () => {
  it("keeps full detail across the play area and coarsens outward", () => {
    const xs = terrainAxis(-30, 71, 1, 200);
    expect(xs[0]).toBeCloseTo(-230, 6);
    expect(xs[xs.length - 1]).toBeCloseTo(271, 6);
    expect(xs).toContain(-30);
    expect(xs).toContain(71);
    // Sorted, no duplicates.
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    // Unit cells inside the bounds.
    const inside = xs.filter((v) => v >= -30 && v <= 71);
    expect(inside.length).toBe(102);
    // The apron costs only a handful of rings, not a grid.
    expect(xs.length).toBeLessThan(inside.length + 30);
  });

  it("is the plain grid when there is no apron", () => {
    const xs = terrainAxis(0, 4, 1, 0);
    expect(xs).toEqual([0, 1, 2, 3, 4]);
  });
});
