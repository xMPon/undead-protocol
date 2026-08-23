import { describe, it, expect } from "vitest";
import { Terrain, FLAT_TERRAIN } from "../src/sim/Terrain";
import { BLACKSITE } from "../src/data/map_blacksite";

describe("terrain", () => {
  it("flat terrain returns baseHeight everywhere", () => {
    const t = new Terrain(FLAT_TERRAIN);
    expect(t.heightAt(0, 0)).toBe(0);
    expect(t.heightAt(37, -11)).toBe(0);
  });

  it("heightAt is deterministic", () => {
    const t = new Terrain(BLACKSITE.terrain!);
    expect(t.heightAt(4.3, 1.1)).toBe(t.heightAt(4.3, 1.1));
  });

  it("a flat zone overrides height (hard blend)", () => {
    const t = new Terrain({
      baseHeight: 0,
      layers: [],
      flatZones: [{ rect: { minX: -2, minY: -2, maxX: 2, maxY: 2 }, height: -3 }],
    });
    expect(t.heightAt(0, 0)).toBe(-3);
    expect(t.heightAt(10, 10)).toBe(0);
  });

  it("Blacksite's sunken bay sits clearly below the rim", () => {
    const t = new Terrain(BLACKSITE.terrain!);
    const bay = t.heightAt(13, 0); // inside bay rect x[6,20] y[-9,9]
    const rim = t.heightAt(-24, -16); // flat rim by the spawn wall-buy
    expect(bay).toBeLessThan(rim - 1);
    expect(bay).toBeLessThan(-1);
  });

  it("Blacksite's vault dock is raised above the rim", () => {
    const t = new Terrain(BLACKSITE.terrain!);
    expect(t.heightAt(58, -8)).toBeGreaterThan(0.5); // dock rect x[52,64] y[-14,-3]
  });
});
