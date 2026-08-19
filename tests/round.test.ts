import { describe, it, expect } from "vitest";
import { zombieHealth, zombieCount, RoundManager, FIRST_ROUND_DELAY } from "../src/sim/Round";

describe("round scaling", () => {
  it("health is linear +100/round through round 9", () => {
    expect(zombieHealth(1)).toBe(150);
    expect(zombieHealth(2)).toBe(250);
    expect(zombieHealth(9)).toBe(950);
  });

  it("health compounds +10%/round from round 10", () => {
    expect(zombieHealth(10)).toBe(Math.round(950 * 1.1)); // 1045
    expect(zombieHealth(11)).toBe(Math.round(Math.round(950 * 1.1) * 1.1));
    expect(zombieHealth(20)).toBeGreaterThan(zombieHealth(19));
  });

  it("count ramps and then clamps at the cap", () => {
    expect(zombieCount(1)).toBe(6);
    expect(zombieCount(2)).toBe(9);
    expect(zombieCount(100, 24)).toBe(24);
  });
});

describe("RoundManager state machine", () => {
  it("starts round 1 after the initial delay", () => {
    const rm = new RoundManager();
    expect(rm.round).toBe(0);
    expect(rm.tick(FIRST_ROUND_DELAY + 0.01, 0)).toBe("start");
    expect(rm.round).toBe(1);
    expect(rm.phase).toBe("active");
    expect(rm.toSpawn).toBe(zombieCount(1));
  });

  it("ends the round only once spawned out and cleared", () => {
    const rm = new RoundManager();
    rm.tick(FIRST_ROUND_DELAY + 0.01, 0); // begin round 1
    // Drain the spawn budget.
    while (rm.toSpawn > 0) rm.markSpawned();
    // Still zombies alive -> no end.
    expect(rm.tick(0.1, 3)).toBeNull();
    // Cleared -> round ends, back to intermission.
    expect(rm.tick(0.1, 0)).toBe("end");
    expect(rm.phase).toBe("intermission");
  });

  it("advances round numbers across intermissions", () => {
    const rm = new RoundManager();
    rm.tick(FIRST_ROUND_DELAY + 0.01, 0);
    while (rm.toSpawn > 0) rm.markSpawned();
    rm.tick(0.1, 0); // end -> intermission
    rm.tick(999, 0); // wait out intermission -> round 2
    expect(rm.round).toBe(2);
  });
});
