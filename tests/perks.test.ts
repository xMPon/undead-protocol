// Perks: the effect rules on their own, and what buying one actually does to
// the player. The Second Wind cases matter most — a perk that decides whether a
// run ends has to be exact about when it is spent.

import { describe, it, expect } from "vitest";
import { Player } from "../src/sim/Player";
import { fireIntervalMul, healthMul, reloadMul, hasSelfRevive, REVIVE_TIME, REVIVE_HEALTH_FRAC } from "../src/sim/Perks";
import { PERKS, PERK_ORDER, getPerk } from "../src/data/perks";
import { fireInterval } from "../src/sim/Weapons";

const spawn = { x: 0, y: 0 };

describe("perk effects", () => {
  it("does nothing at all without the perk", () => {
    const none = new Set<string>();
    expect(healthMul(none)).toBe(1);
    expect(fireIntervalMul(none)).toBe(1);
    expect(reloadMul(none)).toBe(1);
    expect(hasSelfRevive(none)).toBe(false);
  });

  it("scales health, fire rate and reload for the perk that owns each", () => {
    expect(healthMul(new Set(["ironhide"]))).toBe(2);
    expect(fireIntervalMul(new Set(["rapidrounds"]))).toBeLessThan(1);
    expect(reloadMul(new Set(["fasthands"]))).toBe(0.5);
    expect(hasSelfRevive(new Set(["secondwind"]))).toBe(true);
  });

  it("keeps the registry and the HUD order in step", () => {
    expect(PERK_ORDER.length).toBe(Object.keys(PERKS).length);
    for (const id of PERK_ORDER) expect(getPerk(id).id).toBe(id);
    for (const def of Object.values(PERKS)) {
      expect.soft(def.cost, `${def.id} is free`).toBeGreaterThan(0);
      expect.soft(def.short.length, `${def.id} chip is too long`).toBeLessThanOrEqual(3);
    }
  });

  it("throws on an id nothing defines", () => {
    expect(() => getPerk("nope")).toThrow();
  });
});

describe("Player with perks", () => {
  it("raises the health ceiling and tops the player up when Ironhide lands", () => {
    const p = new Player(spawn);
    const base = p.maxHealth;
    p.hurt(60);
    p.grantPerk("ironhide");
    expect(p.maxHealth).toBe(base * 2);
    expect(p.health).toBe(p.maxHealth);
  });

  it("speeds up the trigger and the reload", () => {
    const p = new Player(spawn);
    const baseFire = p.fireInterval();
    const baseReload = p.reloadDuration();
    expect(baseFire).toBeCloseTo(fireInterval(p.def()), 6);
    p.grantPerk("rapidrounds");
    p.grantPerk("fasthands");
    expect(p.fireInterval()).toBeLessThan(baseFire);
    expect(p.reloadDuration()).toBeCloseTo(baseReload * 0.5, 6);
  });

  it("ignores a perk bought twice", () => {
    const p = new Player(spawn);
    p.grantPerk("ironhide");
    const ceiling = p.maxHealth;
    p.grantPerk("ironhide");
    expect(p.maxHealth).toBe(ceiling);
    expect(p.perks.size).toBe(1);
  });
});

describe("Second Wind", () => {
  it("spends itself on a killing blow instead of ending the run", () => {
    const p = new Player(spawn);
    p.grantPerk("secondwind");
    p.hurt(10_000);
    expect(p.alive).toBe(true);
    expect(p.downed).toBe(true);
    expect(p.hasPerk("secondwind")).toBe(false); // one use only
  });

  it("ignores damage while down, then gets back up on its own", () => {
    const p = new Player(spawn);
    p.grantPerk("secondwind");
    p.hurt(10_000);
    p.hurt(10_000); // the horde standing over you must not finish the job
    expect(p.alive).toBe(true);

    let revived = false;
    for (let i = 0; i < Math.ceil((REVIVE_TIME + 0.2) * 60); i++) {
      if (p.tick(1 / 60)) revived = true;
    }
    expect(revived).toBe(true);
    expect(p.downed).toBe(false);
    expect(p.health).toBeCloseTo(p.maxHealth * REVIVE_HEALTH_FRAC, 5);
  });

  it("is the end of the run once it has been spent", () => {
    const p = new Player(spawn);
    p.grantPerk("secondwind");
    p.hurt(10_000);
    // Long enough to be back on your feet and out of the post-revive i-frames.
    for (let i = 0; i < Math.ceil((REVIVE_TIME + 1) * 60); i++) p.tick(1 / 60);
    p.hurt(10_000);
    expect(p.alive).toBe(false);
  });

  it("drops the Ironhide ceiling back down when Second Wind is spent", () => {
    // Both perks touch maxHealth, so spending one must not quietly keep the
    // other's multiplier or lose it.
    const p = new Player(spawn);
    p.grantPerk("ironhide");
    p.grantPerk("secondwind");
    const ceiling = p.maxHealth;
    p.hurt(10_000);
    expect(p.maxHealth).toBe(ceiling); // Ironhide is still held
  });
});
