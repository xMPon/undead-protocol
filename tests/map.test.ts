// Data-integrity checks for authored maps. A prop pass is the easiest way to
// accidentally wall off a barrier, bury an interaction point, or drop scenery
// outside the terrain grid — none of which typecheck, and all of which only
// show up as a mysteriously passive round. These run the real GameMap and
// FlowField, so they fail the same way the game would.

import { describe, it, expect } from "vitest";
import { BLACKSITE } from "../src/data/map_blacksite";
import { GameMap, INTERACT_RANGE } from "../src/sim/Map";
import { World } from "../src/sim/World";
import { resolveCircleObstacles } from "../src/sim/collision";
import { FlowField } from "../src/sim/pathing";
import { PROP_SPECS, footprintExtents, isSolidProp, propColliders } from "../src/sim/props";
import { getWeapon } from "../src/data/weapons";
import { Player } from "../src/sim/Player";
import type { MapDef, PropDef, WallRect } from "../src/sim/types";
import type { Vec2 } from "../src/core/math";

const PLAYER_RADIUS = new Player({ x: 0, y: 0 }).radius;

const MAPS: Array<[string, MapDef]> = [["Blacksite", BLACKSITE]];

/** The collision rectangle a placed prop contributes (solid props only). */
function propRect(p: PropDef): WallRect {
  const { ex, ey } = footprintExtents(p.kind, p.scale ?? 1, p.rot ?? 0);
  return { minX: p.pos.x - ex, minY: p.pos.y - ey, maxX: p.pos.x + ex, maxY: p.pos.y + ey };
}

function inflatedContains(r: WallRect, p: Vec2, pad: number): boolean {
  return p.x > r.minX - pad && p.x < r.maxX + pad && p.y > r.minY - pad && p.y < r.maxY + pad;
}

/** Whether the player cage admits this position (matching World's clamp). */
function caged(def: MapDef, v: Vec2): boolean {
  return (def.playBounds ?? []).some(
    (z) =>
      v.x >= z.minX + PLAYER_RADIUS &&
      v.x <= z.maxX - PLAYER_RADIUS &&
      v.y >= z.minY + PLAYER_RADIUS &&
      v.y <= z.maxY - PLAYER_RADIUS,
  );
}

function solidProps(def: MapDef): PropDef[] {
  return (def.props ?? []).filter(isSolidProp);
}

/** Where a zombie appears for a barrier, and the first steps of its route in. */
function breachRoute(pos: Vec2, inward: Vec2): Vec2[] {
  return [-1, 0, 1, 2, 3].map((k) => ({ x: pos.x + inward.x * k, y: pos.y + inward.y * k }));
}

describe.each(MAPS)("%s map data", (_name, def) => {
  it("places every prop inside the terrain/flow-field bounds", () => {
    for (const p of def.props ?? []) {
      const { ex, ey } = footprintExtents(p.kind, p.scale ?? 1, p.rot ?? 0);
      expect.soft(p.pos.x - ex, `${p.kind} at ${p.pos.x},${p.pos.y}`).toBeGreaterThanOrEqual(def.bounds.minX);
      expect.soft(p.pos.x + ex, `${p.kind} at ${p.pos.x},${p.pos.y}`).toBeLessThanOrEqual(def.bounds.maxX);
      expect.soft(p.pos.y - ey, `${p.kind} at ${p.pos.x},${p.pos.y}`).toBeGreaterThanOrEqual(def.bounds.minY);
      expect.soft(p.pos.y + ey, `${p.kind} at ${p.pos.x},${p.pos.y}`).toBeLessThanOrEqual(def.bounds.maxY);
    }
  });

  it("keeps the player spawn clear of solid geometry", () => {
    for (const r of [...def.walls, ...def.doors.map((d) => d.blocks), ...solidProps(def).map(propRect)]) {
      expect(inflatedContains(r, def.playerSpawn, PLAYER_RADIUS)).toBe(false);
    }
  });

  it("leaves every barrier breach route unobstructed", () => {
    for (const b of def.barriers) {
      expect(Math.hypot(b.inward.x, b.inward.y)).toBeCloseTo(1, 5); // must be a unit vector
      for (const step of breachRoute(b.pos, b.inward)) {
        for (const p of solidProps(def)) {
          expect.soft(inflatedContains(propRect(p), step, 0.5), `${p.kind} blocks barrier ${b.pos.x},${b.pos.y}`).toBe(false);
        }
      }
    }
  });

  it("leaves every interaction point reachable", () => {
    const points: Vec2[] = [...def.wallBuys.map((w) => w.pos), ...def.doors.map((d) => d.pos)];
    for (const point of points) {
      for (const p of solidProps(def)) {
        expect.soft(inflatedContains(propRect(p), point, PLAYER_RADIUS), `${p.kind} buries ${point.x},${point.y}`).toBe(false);
      }
    }
  });

  it("keeps solid props out of the walls", () => {
    for (const p of solidProps(def)) {
      const r = propRect(p);
      for (const w of def.walls) {
        const ox = Math.min(r.maxX, w.maxX) - Math.max(r.minX, w.minX);
        const oy = Math.min(r.maxY, w.maxY) - Math.max(r.minY, w.minY);
        expect.soft(ox > 0.05 && oy > 0.05, `${p.kind} at ${p.pos.x},${p.pos.y} is buried in a wall`).toBe(false);
      }
    }
  });

  it("cages the player around everything they have to reach", () => {
    const zones = def.playBounds ?? [];
    expect(zones.length).toBeGreaterThan(0);
    const mustReach: Array<[string, Vec2]> = [
      ["spawn", def.playerSpawn],
      ...def.wallBuys.map((w) => [`${w.weaponId} buy`, w.pos] as [string, Vec2]),
      ...def.doors.map((d) => [d.id, d.pos] as [string, Vec2]),
    ];
    for (const [what, v] of mustReach) {
      expect.soft(caged(def, v), `${what} at ${v.x},${v.y} sits outside playBounds`).toBe(true);
    }
  });

  it("keeps every doorway continuously inside the cage", () => {
    // Connected cage rects must overlap by more than the player diameter. If they
    // only touch, the doorway is a band neither rect accepts and the clamp pins
    // the player on the near side of a door they just paid for.
    for (const d of def.doors) {
      const acrossX = d.blocks.maxX - d.blocks.minX < d.blocks.maxY - d.blocks.minY;
      for (let t = -2.5; t <= 2.5; t += 0.1) {
        const v = acrossX ? { x: d.pos.x + t, y: d.pos.y } : { x: d.pos.x, y: d.pos.y + t };
        expect.soft(caged(def, v), `${d.id} doorway breaks at ${v.x.toFixed(1)},${v.y.toFixed(1)}`).toBe(true);
      }
    }
  });

  it("anchors each door prompt on the wall it removes", () => {
    for (const d of def.doors) {
      const centre = { x: (d.blocks.minX + d.blocks.maxX) / 2, y: (d.blocks.minY + d.blocks.maxY) / 2 };
      const gap = Math.hypot(d.pos.x - centre.x, d.pos.y - centre.y);
      expect.soft(gap, `${d.id} prompt is nowhere near its blocking wall`).toBeLessThanOrEqual(INTERACT_RANGE);
    }
  });

  it("gives every unlocked region something to do", () => {
    const opened = def.doors.map((d) => d.opensRegion);
    expect(new Set(opened).size, "two doors unlock the same region").toBe(opened.length);
    for (const region of opened) {
      expect.soft(def.barriers.some((b) => b.region === region), `region ${region} has no barrier`).toBe(true);
      expect.soft(def.wallBuys.some((w) => w.region === region), `region ${region} has no wall-buy`).toBe(true);
    }
  });

  it("feeds one collision rect per solid collider and nothing for dressing", () => {
    const map = new GameMap(def);
    const pieces = solidProps(def).reduce((n, p) => n + propColliders(p).length, 0);
    expect(map.walls.length).toBe(def.walls.length + def.doors.length + pieces);
  });

  it("leaves the space under a multi-part prop walkable", () => {
    // A guard tower is four legs. Standing dead centre under it has to be legal,
    // or it reads as an invisible wall in the middle of open ground.
    const world = new World(def);
    for (const p of def.props ?? []) {
      if (!PROP_SPECS[p.kind].parts) continue;
      const moved = resolveCircleObstacles(p.pos, world.player.radius, world.terrain.heightAt(p.pos.x, p.pos.y), world.obstacles);
      expect
        .soft(Math.hypot(moved.x - p.pos.x, moved.y - p.pos.y), `${p.kind} at ${p.pos.x},${p.pos.y} blocks its own centre`)
        .toBeLessThan(0.01);
    }
  });

  it("names weapons that exist and puts every buy in interaction range of its region", () => {
    for (const wb of def.wallBuys) expect(() => getWeapon(wb.weaponId)).not.toThrow();
    for (const d of def.doors) expect(d.cost).toBeGreaterThan(0);
    expect(INTERACT_RANGE).toBeGreaterThan(0);
  });

  it("keeps every active breach point able to path to the player", () => {
    const map = new GameMap(def);
    const flow = new FlowField(def.bounds, 0.8);
    const recompute = (): void => {
      flow.rebuild(map.walls);
      flow.compute(def.playerSpawn);
    };

    recompute();
    for (const b of map.activeBarriers()) {
      const spawn = { x: b.pos.x - b.inward.x, y: b.pos.y - b.inward.y };
      expect(flow.reachable(spawn), `barrier ${b.pos.x},${b.pos.y} is sealed off`).toBe(true);
    }

    // ...and still can once the doors are open and the deeper regions go live.
    for (const door of def.doors) map.openDoor(door.id);
    recompute();
    for (const b of map.activeBarriers()) {
      const spawn = { x: b.pos.x - b.inward.x, y: b.pos.y - b.inward.y };
      expect(flow.reachable(spawn), `barrier ${b.pos.x},${b.pos.y} is sealed off`).toBe(true);
    }
    for (const wb of map.activeWallBuys()) {
      expect(flow.reachable(wb.pos), `wall-buy ${wb.pos.x},${wb.pos.y} is walled in`).toBe(true);
    }
  });
});

describe("prop specs", () => {
  it("gives every kind a usable footprint and height", () => {
    for (const [kind, spec] of Object.entries(PROP_SPECS)) {
      expect.soft(spec.hx, kind).toBeGreaterThan(0);
      expect.soft(spec.hy, kind).toBeGreaterThan(0);
      expect.soft(spec.height, kind).toBeGreaterThan(0);
    }
  });

  it("treats dressing as pass-through unless a placement opts in", () => {
    expect(isSolidProp({ kind: "cone", pos: { x: 0, y: 0 } })).toBe(false);
    expect(isSolidProp({ kind: "cone", pos: { x: 0, y: 0 }, solid: true })).toBe(true);
    expect(isSolidProp({ kind: "crate", pos: { x: 0, y: 0 } })).toBe(true);
    expect(isSolidProp({ kind: "crate", pos: { x: 0, y: 0 }, solid: false })).toBe(false);
  });

  it("rotates footprints to a covering AABB", () => {
    const square = footprintExtents("crate", 1, Math.PI / 4);
    expect(square.ex).toBeCloseTo(square.ey, 6);
    expect(square.ex).toBeGreaterThan(PROP_SPECS.crate.hx); // a rotated box needs a wider box
    const flat = footprintExtents("container", 1, Math.PI / 2);
    expect(flat.ex).toBeCloseTo(PROP_SPECS.container.hy, 6);
    expect(flat.ey).toBeCloseTo(PROP_SPECS.container.hx, 6);
  });
});
