import { describe, it, expect } from "vitest";
import {
  fireInterval,
  canFire,
  canReload,
  consumeRound,
  applyReload,
  refillAmmo,
  totalAmmo,
  makeInstance,
} from "../src/sim/Weapons";
import { getWeapon } from "../src/data/weapons";
import { Player } from "../src/sim/Player";

describe("weapons", () => {
  const m9 = getWeapon("m9");

  it("derives fire interval from rpm", () => {
    expect(fireInterval(m9)).toBeCloseTo(60 / 360, 5);
  });

  it("makeInstance is fully loaded", () => {
    const inst = makeInstance(m9);
    expect(inst.mag).toBe(m9.magSize);
    expect(inst.reserve).toBe(m9.reserveMax);
    expect(totalAmmo(inst)).toBe(m9.magSize + m9.reserveMax);
  });

  it("cannot fire while on cooldown, mid-reload, or empty", () => {
    const inst = makeInstance(m9);
    expect(canFire(inst, 0, 0)).toBe(true);
    expect(canFire(inst, 0.1, 0)).toBe(false); // cooldown
    expect(canFire(inst, 0, 0.5)).toBe(false); // reloading
    inst.mag = 0;
    expect(canFire(inst, 0, 0)).toBe(false); // empty
  });

  it("consumeRound drains the magazine and reload refills from reserve", () => {
    const inst = makeInstance(m9);
    for (let i = 0; i < 5; i++) consumeRound(inst);
    expect(inst.mag).toBe(m9.magSize - 5);
    expect(canReload(inst, m9)).toBe(true);
    applyReload(inst, m9);
    expect(inst.mag).toBe(m9.magSize);
    expect(inst.reserve).toBe(m9.reserveMax - 5);
  });

  it("cannot reload a full mag or with empty reserve", () => {
    const inst = makeInstance(m9);
    expect(canReload(inst, m9)).toBe(false); // already full
    inst.mag = 3;
    inst.reserve = 0;
    expect(canReload(inst, m9)).toBe(false); // no reserve
  });

  it("refillAmmo tops both mag and reserve", () => {
    const inst = { defId: "m9", mag: 1, reserve: 2 };
    refillAmmo(inst, m9);
    expect(inst.mag).toBe(m9.magSize);
    expect(inst.reserve).toBe(m9.reserveMax);
  });
});

describe("player weapon acquisition", () => {
  it("adds a second weapon, then refills instead of adding a third", () => {
    const p = new Player({ x: 0, y: 0 });
    expect(p.weapons.length).toBe(1); // m9 to start
    p.acquire("pdw");
    expect(p.weapons.length).toBe(2);
    expect(p.hasWeapon("pdw")).toBeGreaterThanOrEqual(0);
    // Re-buying an owned weapon refills rather than adding.
    p.weapons[p.hasWeapon("pdw")].reserve = 0;
    p.acquire("pdw");
    expect(p.weapons.length).toBe(2);
    expect(p.weapons[p.hasWeapon("pdw")].reserve).toBe(getWeapon("pdw").reserveMax);
  });

  it("replaces the held weapon when both slots are full", () => {
    const p = new Player({ x: 0, y: 0 });
    p.acquire("pdw"); // slot 2
    p.current = 0; // holding m9
    p.acquire("kr12"); // slots full -> replaces current (m9)
    expect(p.weapons.length).toBe(2);
    expect(p.hasWeapon("m9")).toBe(-1);
    expect(p.hasWeapon("kr12")).toBeGreaterThanOrEqual(0);
  });
});
