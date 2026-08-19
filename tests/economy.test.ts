import { describe, it, expect } from "vitest";
import { canAfford, spend, POINTS_HIT, POINTS_KILL, START_POINTS } from "../src/sim/Economy";

describe("economy", () => {
  it("starts with the Black-Ops-style 500 points", () => {
    expect(START_POINTS).toBe(500);
  });

  it("awards more for a kill than a bare hit", () => {
    expect(POINTS_KILL).toBeGreaterThan(POINTS_HIT);
  });

  it("canAfford is inclusive of the exact cost", () => {
    expect(canAfford(750, 750)).toBe(true);
    expect(canAfford(749, 750)).toBe(false);
  });

  it("spend deducts on success and is a no-op on failure", () => {
    expect(spend(1000, 750)).toEqual({ ok: true, points: 250 });
    expect(spend(500, 750)).toEqual({ ok: false, points: 500 });
  });

  it("never goes negative", () => {
    const r = spend(0, 100);
    expect(r.points).toBeGreaterThanOrEqual(0);
  });
});
