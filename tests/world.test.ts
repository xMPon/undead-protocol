import { describe, it, expect } from "vitest";
import { World } from "../src/sim/World";
import { Zombie } from "../src/sim/Zombie";
import { emptyIntent } from "../src/sim/types";
import type { Intent } from "../src/sim/types";
import { FIRST_ROUND_DELAY } from "../src/sim/Round";

const DT = 1 / 60;

function step(w: World, seconds: number, intent: Intent): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) w.update(DT, intent);
}

describe("World — shooting", () => {
  it("damages a zombie in the line of fire and awards points", () => {
    const w = new World();
    const z = new Zombie({ x: 5, y: 0 }, 200, 0);
    w.zombies.push(z);
    const pts = w.player.points;

    const intent = { ...emptyIntent(), aim: 0, firing: true };
    w.update(DT, intent);

    expect(z.health).toBeLessThan(200);
    expect(w.player.points).toBeGreaterThan(pts);
  });

  it("kills a low-health zombie and banks the kill bonus", () => {
    const w = new World();
    const z = new Zombie({ x: 5, y: 0 }, 30, 0);
    w.zombies.push(z);
    const pts = w.player.points;

    w.update(DT, { ...emptyIntent(), aim: 0, firing: true });

    expect(z.isDead).toBe(true);
    expect(w.kills).toBe(1);
    expect(w.player.points).toBe(pts + 60);
  });

  it("consumes a magazine round when it fires", () => {
    const w = new World();
    const before = w.player.weapon().mag;
    w.update(DT, { ...emptyIntent(), aim: 0, firing: true });
    expect(w.player.weapon().mag).toBe(before - 1);
  });
});

describe("World — rounds & spawning", () => {
  it("starts round 1 after the delay and breaches zombies from barriers", () => {
    const w = new World();
    const idle = emptyIntent();

    step(w, FIRST_ROUND_DELAY + 0.1, idle);
    expect(w.rounds.round).toBe(1);

    // Give the spawner a few seconds of cadence to breach at least one zombie.
    let sawZombie = false;
    for (let i = 0; i < 300 && !sawZombie; i++) {
      w.update(DT, idle);
      if (w.zombies.length > 0) sawZombie = true;
    }
    expect(sawZombie).toBe(true);
  });
});

describe("World — jumping", () => {
  it("launches the player off the ground and lands them again", () => {
    const w = new World();
    const ground = w.player.footY;
    w.update(DT, { ...emptyIntent(), jump: true });
    expect(w.player.vz).toBeGreaterThan(0);
    expect(w.player.onGround).toBe(false);
    expect(w.player.footY).toBeGreaterThan(ground);

    for (let i = 0; i < 150; i++) w.update(DT, emptyIntent());
    expect(w.player.onGround).toBe(true);
    expect(w.player.footY).toBeCloseTo(ground, 1);
  });
});

describe("World — economy interactions", () => {
  it("opens the vault door for 750 points and unlocks region 1", () => {
    const w = new World();
    w.player.pos = { x: 25, y: 0 }; // beside the door
    w.player.points = 1000;
    expect(w.map.activeWallBuys().length).toBe(1); // only spawn-room buy live

    w.update(DT, { ...emptyIntent(), interact: true });

    expect(w.map.openedDoors.has("vault-door")).toBe(true);
    expect(w.player.points).toBe(250);
    expect(w.map.activeWallBuys().length).toBe(3); // vault buys now live
  });

  it("lets the player walk through a door they paid for", () => {
    const w = new World();
    w.player.pos = { x: 13, y: 16.6 }; // just north of the substation door
    w.player.points = 5000;
    w.update(DT, { ...emptyIntent(), interact: true });
    expect(w.map.openedDoors.has("substation-door")).toBe(true);

    step(w, 1.0, { ...emptyIntent(), move: { x: 0, y: 1 } }); // walk south, into the room
    expect(w.player.pos.y).toBeGreaterThan(20);
  });

  it("refuses the door when broke", () => {
    const w = new World();
    w.player.pos = { x: 25, y: 0 };
    w.player.points = 100;
    w.update(DT, { ...emptyIntent(), interact: true });
    expect(w.map.openedDoors.has("vault-door")).toBe(false);
    expect(w.player.points).toBe(100);
  });
});
