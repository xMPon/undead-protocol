// "Blacksite" — the Phase 1 map. Two rooms: a spawn room (region 0) and a
// vault room (region 1) unlocked by a 750-point door. Walls are axis-aligned
// rectangles with gaps; each gap is either a zombie barrier or the door.
//
// Coordinate note: +x is east, +y is south (screen-down in the 2D view).

import type { MapDef, WallRect } from "../sim/types";

const wall = (minX: number, minY: number, maxX: number, maxY: number): WallRect => ({ minX, minY, maxX, maxY });

// Spawn room interior: x[-12,12] y[-9,9].  Vault room interior: x[12,32] y[-9,9].
export const BLACKSITE: MapDef = {
  name: "Blacksite",
  bounds: wall(-15, -12, 35, 12),
  playerSpawn: { x: 0, y: 0 },
  startRegions: [0],

  walls: [
    // --- Spawn room (region 0) perimeter, gaps for N/S/W barriers ---
    // North (y=-9), gap x[-1.6,1.6]
    wall(-12.6, -9.6, -1.6, -9), wall(1.6, -9.6, 12.6, -9),
    // South (y=9), gap x[-1.6,1.6]
    wall(-12.6, 9, -1.6, 9.6), wall(1.6, 9, 12.6, 9.6),
    // West (x=-12), gap y[-1.6,1.6]
    wall(-12.6, -9.6, -12, -1.6), wall(-12.6, 1.6, -12, 9.6),

    // --- Shared wall between rooms (x=12), gap = door y[-2.6,2.6] ---
    wall(11.7, -9.6, 12.3, -2.6), wall(11.7, 2.6, 12.3, 9.6),

    // --- Vault room (region 1) perimeter ---
    // North (y=-9), gap for B-N barrier x[20.4,23.6]
    wall(11.7, -9.6, 20.4, -9), wall(23.6, -9.6, 32.6, -9),
    // South (y=9) solid
    wall(11.7, 9, 32.6, 9.6),
    // East (x=32), gap for B-E barrier y[-1.6,1.6]
    wall(32, -9.6, 32.6, -1.6), wall(32, 1.6, 32.6, 9.6),
  ],

  barriers: [
    { pos: { x: 0, y: -9 }, inward: { x: 0, y: 1 }, region: 0 },  // north
    { pos: { x: 0, y: 9 }, inward: { x: 0, y: -1 }, region: 0 },  // south
    { pos: { x: -12, y: 0 }, inward: { x: 1, y: 0 }, region: 0 }, // west
    { pos: { x: 22, y: -9 }, inward: { x: 0, y: 1 }, region: 1 }, // vault north
    { pos: { x: 32, y: 0 }, inward: { x: -1, y: 0 }, region: 1 }, // vault east
  ],

  wallBuys: [
    { pos: { x: -11, y: -7 }, weaponId: "pdw", region: 0 },       // spawn room SMG
    { pos: { x: 30, y: -7 }, weaponId: "kr12", region: 1 },       // vault rifle
    { pos: { x: 30, y: 7 }, weaponId: "breacher", region: 1 },    // vault shotgun
  ],

  doors: [
    {
      id: "vault-door",
      pos: { x: 12, y: 0 },
      cost: 750,
      blocks: wall(11.7, -2.6, 12.3, 2.6),
      opensRegion: 1,
    },
  ],
};
