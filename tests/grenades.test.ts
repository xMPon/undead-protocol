// Grenades: the damage falloff on its own, then a thrown one in the real world —
// it has to arc, come to rest on the ground, kill what is stood next to it, and
// leave what is behind a wall alone.

import { describe, it, expect } from "vitest";
import { World } from "../src/sim/World";
import { Zombie } from "../src/sim/Zombie";
import { emptyIntent } from "../src/sim/types";
import {
  Grenade,
  blastDamage,
  GRENADE_RADIUS,
  GRENADE_MAX_DAMAGE,
  GRENADE_FUSE,
  START_GRENADES,
  MAX_GRENADES,
  THROW_COOLDOWN,
} from "../src/sim/Grenade";

const DT = 1 / 60;

describe("blast falloff", () => {
  it("is hardest at the seat of the blast and nothing past the rim", () => {
    expect(blastDamage(0)).toBeCloseTo(GRENADE_MAX_DAMAGE, 5);
    expect(blastDamage(GRENADE_RADIUS)).toBe(0);
    expect(blastDamage(GRENADE_RADIUS + 3)).toBe(0);
  });

  it("falls off with distance the whole way out", () => {
    let prev = Infinity;
    for (let d = 0; d < GRENADE_RADIUS; d += 0.25) {
      const dmg = blastDamage(d);
      expect(dmg).toBeLessThan(prev);
      prev = dmg;
    }
  });
});

describe("World — throwing", () => {
  it("spends one grenade and puts it in the air", () => {
    const w = new World();
    expect(w.player.grenades).toBe(START_GRENADES);
    w.update(DT, { ...emptyIntent(), grenade: true });
    expect(w.player.grenades).toBe(START_GRENADES - 1);
    expect(w.grenades.length).toBe(1);
    expect(w.grenades[0].footY).toBeGreaterThan(w.player.footY);
  });

  it("will not empty the pouch in one frame", () => {
    const w = new World();
    const throwing = { ...emptyIntent(), grenade: true };
    for (let i = 0; i < 10; i++) w.update(DT, throwing);
    expect(w.player.grenades).toBe(START_GRENADES - 1); // held, not tapped
    expect(w.player.grenadeCooldown).toBeGreaterThan(0);
    expect(THROW_COOLDOWN).toBeGreaterThan(0);
  });

  it("throws nothing when the pouch is empty", () => {
    const w = new World();
    w.player.grenades = 0;
    w.update(DT, { ...emptyIntent(), grenade: true });
    expect(w.grenades.length).toBe(0);
  });

  it("detonates on the fuse and leaves a blast for the renderers", () => {
    const w = new World();
    w.update(DT, { ...emptyIntent(), grenade: true });
    for (let i = 0; i < Math.ceil((GRENADE_FUSE + 0.1) * 60); i++) w.update(DT, emptyIntent());
    expect(w.grenades.length).toBe(0);
    expect(w.blasts.length).toBeGreaterThan(0);
  });

  it("kills what it goes off next to and pays for it", () => {
    const w = new World();
    const z = new Zombie({ x: 6, y: 0 }, 400, 0);
    z.state = "chasing";
    w.zombies.push(z);
    const points = w.player.points;

    // Dropped at its feet rather than thrown: this is about the blast, not the
    // arc, and a thrown one covers thirty units before the fuse runs out.
    w.grenades.push(new Grenade({ x: 6, y: 0 }, { x: 0, y: 0 }, z.footY, 0));
    for (let i = 0; i < Math.ceil((GRENADE_FUSE + 0.2) * 60); i++) w.update(DT, emptyIntent());

    expect(z.isDead).toBe(true);
    expect(w.kills).toBe(1);
    expect(w.player.points).toBeGreaterThan(points);
  });

  it("leaves a zombie outside the radius alone", () => {
    const w = new World();
    const z = new Zombie({ x: 6, y: 0 }, 400, 0);
    z.state = "chasing";
    w.zombies.push(z);
    w.grenades.push(new Grenade({ x: 6 + GRENADE_RADIUS + 1, y: 0 }, { x: 0, y: 0 }, z.footY, 0));
    for (let i = 0; i < Math.ceil((GRENADE_FUSE + 0.2) * 60); i++) w.update(DT, emptyIntent());
    expect(z.health).toBe(400);
  });

  it("does not throw frag through a wall", () => {
    const w = new World();
    // Either side of the spawn-yard north wall (x=10 is solid; the gap at x=0 is
    // the barrier), and well inside the blast radius.
    w.player.pos = { x: 10, y: -16.5 };
    const z = new Zombie({ x: 10, y: -19.5 }, 400, 0);
    z.state = "chasing";
    w.zombies.push(z);

    w.grenades.push(new Grenade({ x: 10, y: -16.5 }, { x: 0, y: 0 }, w.player.footY, 0));
    for (let i = 0; i < Math.ceil((GRENADE_FUSE + 0.2) * 60); i++) w.update(DT, emptyIntent());
    expect(z.health).toBe(400);
  });

  it("comes to rest instead of bouncing for ever", () => {
    const w = new World();
    w.update(DT, { ...emptyIntent(), grenade: true });
    const g = w.grenades[0];
    for (let i = 0; i < Math.ceil((GRENADE_FUSE - 0.2) * 60); i++) w.update(DT, emptyIntent());
    expect(g.onGround).toBe(true);
    expect(Math.abs(g.vz)).toBeLessThan(0.5);
  });
});

describe("World — resupply", () => {
  it("sells grenades back up to a full pouch at a supply crate", () => {
    const w = new World();
    const crate = w.def.supplies![0];
    w.player.grenades = 0;
    w.player.points = 5000;
    w.player.pos = { x: crate.pos.x, y: crate.pos.y - 1 };

    w.update(DT, emptyIntent());
    expect(w.prompt?.kind).toBe("supply");
    w.update(DT, { ...emptyIntent(), interact: true });
    expect(w.player.grenades).toBe(MAX_GRENADES);
    expect(w.player.points).toBeLessThan(5000);
  });

  it("charges nothing when the pouch is already full", () => {
    const w = new World();
    const crate = w.def.supplies![0];
    w.player.grenades = MAX_GRENADES;
    w.player.points = 5000;
    w.player.pos = { x: crate.pos.x, y: crate.pos.y - 1 };
    w.update(DT, emptyIntent());
    w.update(DT, { ...emptyIntent(), interact: true });
    expect(w.player.points).toBe(5000);
  });
});
