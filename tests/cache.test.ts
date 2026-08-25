// The Cache. The state machine is on a clock and hands out weapons, so the
// tests drive it with a seeded RNG: the same seed must always produce the same
// run of draws, and every path out of "offering" has to spend exactly one use.

import { describe, it, expect } from "vitest";
import { Cache, SPIN_TIME, OFFER_TIME, CLOSE_TIME, CACHE_COST } from "../src/sim/Cache";
import { mulberry32 } from "../src/core/rng";
import { CACHE_POOL, getWeapon } from "../src/data/weapons";

const DT = 1 / 60;

function box(seed = 1, pool = CACHE_POOL): Cache {
  return new Cache(pool, mulberry32(seed));
}

/** Run the clock forward, returning every event it produced. */
function run(c: Cache, seconds: number): string[] {
  const events: string[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const ev = c.tick(DT);
    if (ev) events.push(ev);
  }
  return events;
}

describe("The Cache", () => {
  it("starts idle and costs something to open", () => {
    const c = box();
    expect(c.isIdle).toBe(true);
    expect(c.isOffering).toBe(false);
    expect(CACHE_COST).toBeGreaterThan(0);
  });

  it("refuses a second pay-in while it is already cycling", () => {
    const c = box();
    expect(c.open()).toBe(true);
    expect(c.open()).toBe(false);
  });

  it("settles on a weapon from the pool after the spin", () => {
    const c = box();
    c.open();
    expect(run(c, SPIN_TIME + DT)).toContain("reveal");
    expect(c.isOffering).toBe(true);
    expect(CACHE_POOL).toContain(c.display);
    expect(() => getWeapon(c.display)).not.toThrow();
  });

  it("hands the settled weapon over exactly once", () => {
    const c = box();
    c.open();
    run(c, SPIN_TIME + DT);
    const taken = c.take();
    expect(taken).toBe(c.display);
    expect(c.take()).toBeNull(); // the lid is already shutting
  });

  it("closes on its own and spends the draw when nobody takes it", () => {
    const c = box();
    const uses = c.usesLeft;
    c.open();
    run(c, SPIN_TIME + DT);
    expect(run(c, OFFER_TIME + DT)).toContain("withdraw");
    expect(c.usesLeft).toBe(uses - 1);
    run(c, CLOSE_TIME + DT);
    expect(c.isIdle).toBe(true);
  });

  it("never draws the starting sidearm", () => {
    // Landing on the gun you already have would be a punishment, not a draw.
    const c = box(99);
    for (let i = 0; i < 200; i++) {
      c.open();
      run(c, SPIN_TIME + DT);
      expect(c.display).not.toBe("m9");
      c.take();
      run(c, CLOSE_TIME + DT);
      if (c.wantsRelocate) c.relocate(c.site);
    }
  });

  it("asks to move once its uses run out, and restocks when it does", () => {
    const c = box(7);
    const uses = c.usesLeft;
    expect(uses).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < uses; i++) {
      c.open();
      run(c, SPIN_TIME + DT);
      c.take();
      run(c, CLOSE_TIME + DT);
    }
    expect(c.wantsRelocate).toBe(true);
    c.relocate(2);
    expect(c.site).toBe(2);
    expect(c.wantsRelocate).toBe(false);
    expect(c.usesLeft).toBeGreaterThan(0);
    expect(c.isIdle).toBe(true);
  });

  it("is deterministic for a given seed", () => {
    const draws = (seed: number): string[] => {
      const c = box(seed);
      const out: string[] = [];
      for (let i = 0; i < 12; i++) {
        c.open();
        run(c, SPIN_TIME + DT);
        out.push(c.display);
        c.take();
        run(c, CLOSE_TIME + DT);
        if (c.wantsRelocate) c.relocate(0);
      }
      return out;
    };
    expect(draws(1234)).toEqual(draws(1234));
  });

  it("refuses to exist with nothing to give out", () => {
    expect(() => new Cache([], mulberry32(1))).toThrow();
  });
});
