// Data-integrity checks for authored maps. A prop pass is the easiest way to
// accidentally wall off a barrier, bury an interaction point, or drop scenery
// outside the terrain grid — none of which typecheck, and all of which only
// show up as a mysteriously passive round. These run the real GameMap and
// FlowField, so they fail the same way the game would.

import { describe, it, expect } from "vitest";
import { BLACKSITE } from "../src/data/map_blacksite";
import { GameMap, INTERACT_RANGE } from "../src/sim/Map";
import { FlowField } from "../src/sim/pathing";
import { PROP_SPECS, footprintExtents, isSolidProp } from "../src/sim/props";
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

  it("only feeds solid props into collision", () => {
    const map = new GameMap(def);
    expect(map.walls.length).toBe(def.walls.length + def.doors.length + solidProps(def).length);
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
