// Board-up barriers: the plank counter on its own, then the whole loop in the
// real simulation — a zombie tearing its way in, and the player nailing it back
// up for points while it does.

import { describe, it, expect } from "vitest";
import { Boards, MAX_BOARDS, BOARD_TEAR_TIME, BOARD_REPAIR_TIME } from "../src/sim/Barriers";
import { World } from "../src/sim/World";
import { emptyIntent } from "../src/sim/types";
import { POINTS_REPAIR } from "../src/sim/Economy";
import { BLACKSITE } from "../src/data/map_blacksite";
import { FIRST_ROUND_DELAY } from "../src/sim/Round";

const DT = 1 / 60;

describe("Boards", () => {
  it("starts every barrier boarded up", () => {
    const b = new Boards(3);
    expect(b.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(b.at(i)).toBe(MAX_BOARDS);
      expect(b.isOpen(i)).toBe(false);
    }
  });

  it("opens only when the last plank comes off", () => {
    const b = new Boards(1);
    for (let i = 0; i < MAX_BOARDS - 1; i++) {
      expect(b.tear(0)).toBe(true);
      expect(b.isOpen(0)).toBe(false);
    }
    expect(b.tear(0)).toBe(true);
    expect(b.isOpen(0)).toBe(true);
    expect(b.tear(0)).toBe(false); // nothing left to rip off
  });

  it("rebuilds up to full and no further", () => {
    const b = new Boards(1);
    b.tear(0);
    b.tear(0);
    expect(b.needsRepair(0)).toBe(true);
    expect(b.repair(0)).toBe(true);
    expect(b.repair(0)).toBe(true);
    expect(b.repair(0)).toBe(false);
    expect(b.at(0)).toBe(MAX_BOARDS);
    expect(b.needsRepair(0)).toBe(false);
  });

  it("shrugs off an index that is not a barrier", () => {
    const b = new Boards(1);
    expect(b.at(9)).toBe(0);
    expect(b.repair(-1)).toBe(false);
    expect(b.tear(9)).toBe(false);
  });
});

describe("World — breaching and rebuilding", () => {
  it("holds a spawned zombie at the window until every plank is off", () => {
    const w = new World();
    const idle = emptyIntent();
    // Run until the spawner produces one.
    for (let i = 0; i < 1200 && w.zombies.length === 0; i++) w.update(DT, idle);
    const z = w.zombies[0];
    expect(z).toBeDefined();
    expect(z.state).toBe("breaching");
    expect(z.barrier).toBeGreaterThanOrEqual(0);

    const before = w.map.boards.at(z.barrier);
    for (let i = 0; i < Math.ceil((BOARD_TEAR_TIME + 0.05) * 60); i++) w.update(DT, idle);
    expect(w.map.boards.at(z.barrier)).toBeLessThan(before);

    // ...and it is through once the barrier is bare.
    for (let i = 0; i < Math.ceil(BOARD_TEAR_TIME * MAX_BOARDS * 60) + 120; i++) w.update(DT, idle);
    expect(w.map.boards.isOpen(z.barrier)).toBe(true);
    expect(z.state).not.toBe("breaching");
  });

  it("pays the player to nail a plank back on, one hold at a time", () => {
    const w = new World();
    const barrier = BLACKSITE.barriers[0];
    w.map.boards.tear(0);
    w.map.boards.tear(0);
    // Stand just inside the window.
    w.player.pos = { x: barrier.pos.x + barrier.inward.x * 1.2, y: barrier.pos.y + barrier.inward.y * 1.2 };
    w.update(DT, emptyIntent());
    expect(w.prompt?.kind).toBe("repair");
    expect(w.prompt?.hold).toBe(true);

    const boards = w.map.boards.at(0);
    const points = w.player.points;
    const hold = { ...emptyIntent(), interact: true };
    for (let i = 0; i < Math.ceil((BOARD_REPAIR_TIME + 0.05) * 60); i++) w.update(DT, hold);
    expect(w.map.boards.at(0)).toBe(boards + 1);
    expect(w.player.points).toBe(points + POINTS_REPAIR);
  });

  it("stops paying once the barrier is whole again", () => {
    // Held through the pre-round countdown, so nothing is tearing at it: an
    // intact barrier must not be an income stream you can stand and farm.
    const w = new World();
    const barrier = BLACKSITE.barriers[0];
    w.player.pos = { x: barrier.pos.x + barrier.inward.x * 1.2, y: barrier.pos.y + barrier.inward.y * 1.2 };
    const points = w.player.points;
    const hold = { ...emptyIntent(), interact: true };
    for (let i = 0; i < Math.floor((FIRST_ROUND_DELAY - 0.2) * 60); i++) w.update(DT, hold);
    expect(w.map.boards.at(0)).toBe(MAX_BOARDS);
    expect(w.prompt?.kind).not.toBe("repair");
    expect(w.player.points).toBe(points);
  });
});
