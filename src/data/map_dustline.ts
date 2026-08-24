// "Dustline" — a desert fuel depot on a forgotten airstrip. Unlike the other
// maps this one is an L: a yard (region 0) with an apron east behind an
// 850-point door (region 1) and a walled revetment north behind an 1100-point
// door (region 2). The revetment is the long way round, so late rounds have two
// very different places to hold.
//
// Coordinate note: +x is east, +y is south (screen-down in the 2D view).

import type { MapDef, WallRect } from "../sim/types";

const wall = (minX: number, minY: number, maxX: number, maxY: number): WallRect => ({ minX, minY, maxX, maxY });

// Yard: x[-22,14] y[-14,14].  Apron: x[14,46] y[-14,14].  Revetment: x[-10,14] y[-38,-14].
export const DUSTLINE: MapDef = {
  id: "dustline",
  name: "Dustline",
  blurb: "A fuel depot on a dead airstrip. Two doors lead two different ways, and the wind never stops.",
  bounds: wall(-28, -43, 52, 19),
  playerSpawn: { x: -6, y: 2 },
  startRegions: [0],
  // An L-shaped compound needs a rect per wing, overlapping across the doorway
  // by more than the player diameter.
  playBounds: [
    wall(-22, -14, 46, 14), // yard + apron
    wall(-10, -38, 14, -12.6), // revetment, reaching back into the yard
  ],

  walls: [
    // --- Yard (region 0) perimeter ---
    // north: barrier gap x[-20,-16], revetment door gap x[-2,2]
    wall(-22.6, -14.6, -20, -14), wall(-16, -14.6, -2, -14), wall(2, -14.6, 14.3, -14),
    wall(-22.6, 14, -4, 14.6), wall(0, 14, 14.3, 14.6), // south, gap x[-4,0]
    wall(-22.6, -14.6, -22, -2), wall(-22.6, 2, -22, 14.6), // west, gap y[-2,2]

    // --- Shared wall (x=14), gap = apron door y[-3,3] ---
    wall(13.7, -14.6, 14.3, -3), wall(13.7, 3, 14.3, 14.6),

    // --- Apron (region 1) perimeter ---
    wall(13.7, -14.6, 28, -14), wall(32, -14.6, 46.6, -14), // north, gap x[28,32]
    wall(13.7, 14, 46.6, 14.6), // south solid
    wall(46, -14.6, 46.6, -2), wall(46, 2, 46.6, 14.6), // east, gap y[-2,2]

    // --- Revetment (region 2) perimeter ---
    wall(-10.6, -38.6, -10, -28), wall(-10.6, -24, -10, -14), // west, gap y[-28,-24]
    wall(-10.6, -38.6, 0, -38), wall(4, -38.6, 14.3, -38), // north, gap x[0,4]
    wall(13.7, -38.6, 14.3, -14), // east solid

    // Blast walls and revetment berms.
    wall(-14, 6, -6, 7),
    wall(6, -10, 7, -2),
    wall(24, 4, 32, 5),
    wall(2, -30, 3, -22),
  ],

  barriers: [
    { pos: { x: -18, y: -14 }, inward: { x: 0, y: 1 }, region: 0 }, // yard north
    { pos: { x: -2, y: 14 }, inward: { x: 0, y: -1 }, region: 0 }, // yard south
    { pos: { x: -22, y: 0 }, inward: { x: 1, y: 0 }, region: 0 }, // yard west
    { pos: { x: 30, y: -14 }, inward: { x: 0, y: 1 }, region: 1 }, // apron north
    { pos: { x: 46, y: 0 }, inward: { x: -1, y: 0 }, region: 1 }, // apron east
    { pos: { x: 2, y: -38 }, inward: { x: 0, y: 1 }, region: 2 }, // revetment north
    { pos: { x: -10, y: -26 }, inward: { x: 1, y: 0 }, region: 2 }, // revetment west
  ],

  wallBuys: [
    { pos: { x: -20, y: 11 }, weaponId: "pdw", region: 0 },
    { pos: { x: 44, y: -11 }, weaponId: "breacher", region: 1 },
    { pos: { x: -8, y: -35 }, weaponId: "havoc", region: 2 },
  ],

  doors: [
    {
      id: "apron-door",
      pos: { x: 14, y: 0 },
      name: "Open Apron",
      cost: 850,
      blocks: wall(13.7, -3, 14.3, 3),
      opensRegion: 1,
    },
    {
      id: "revetment-door",
      pos: { x: 0, y: -14.3 },
      name: "Open Revetment",
      cost: 1100,
      blocks: wall(-2, -14.6, 2, -14),
      opensRegion: 2,
    },
  ],

  // Long dunes running across the strip, a drainage wadi cut through the yard,
  // and levelled slabs under the apron and the revetment.
  terrain: {
    baseHeight: 0,
    layers: [
      { kind: "dunes", amplitude: 0.7, wavelength: 22, seed: 909, angle: 1.1 },
      { kind: "noise", amplitude: 0.12, wavelength: 6, seed: 33 },
    ],
    flatZones: [
      { rect: wall(-18, -10, -8, 0), height: -1.4, blend: 2.0 }, // wadi
      { rect: wall(20, -10, 42, 8), height: 0.5, blend: 2.5 }, // apron slab
      { rect: wall(-6, -34, 10, -18), height: 0.9, blend: 2.2 }, // revetment pad
      { rect: wall(-20.6, 3.6, -15.4, 8.4), height: 0, blend: 1.2 }, // shelter pads
      { rect: wall(35.4, -8.4, 40.6, -3.6), height: 0.5, blend: 1.2 },
      { rect: wall(5.4, -32.4, 10.6, -27.6), height: 0.9, blend: 1.2 },
    ],
  },

  theme: {
    ground: "sand",
    fog: 0x2a2418,
    fogNear: 45,
    fogFar: 130,
    sky: 0x3a3020,
    hemiSky: 0xd8c090,
    hemiGround: 0x4a3c28,
    dir: 0xffd9a0,
    dirIntensity: 1.6,
  },

  props: [
    // --- Yard ---
    { kind: "lamp", pos: { x: -20, y: -12 } },
    { kind: "lamp", pos: { x: 12, y: -12 } },
    { kind: "lamp", pos: { x: -20, y: 12 } },
    { kind: "lamp", pos: { x: 12, y: 12 } },
    { kind: "blockhouse", pos: { x: -18, y: 6 } }, // door east
    { kind: "pipe", pos: { x: -13, y: -6 } },
    { kind: "pipe", pos: { x: -13, y: -7.4 } },
    { kind: "rubble", pos: { x: -16, y: -3 } },
    { kind: "wreck", pos: { x: -10, y: -4 }, rot: 2.4 },
    { kind: "container", pos: { x: 5, y: -11 }, color: 0x8a4a2a },
    { kind: "container", pos: { x: 9, y: -11 }, color: 0x2f7a3a },
    { kind: "sandbag", pos: { x: -6, y: -12 } },
    { kind: "sandbag", pos: { x: -4.9, y: -12 } },
    { kind: "sandbag", pos: { x: -3.8, y: -12 } },
    { kind: "crate", pos: { x: 10, y: 4 } },
    { kind: "crate", pos: { x: 10.9, y: 4.6 }, scale: 0.9 },
    { kind: "barrel", pos: { x: -2, y: 10 }, color: 0xc0a03a },
    { kind: "barrel", pos: { x: -1.1, y: 10.6 }, color: 0x8a7a2a },
    { kind: "tank", pos: { x: 2, y: -6 } },
    { kind: "tank", pos: { x: 2, y: -3.4 } },
    { kind: "concreteBarrier", pos: { x: 9, y: 0 }, rot: 1.57 },
    { kind: "concreteBarrier", pos: { x: 9, y: 2.2 }, rot: 1.57 },
    { kind: "firebarrel", pos: { x: -8, y: 10 } },
    { kind: "floodlight", pos: { x: 0, y: 12 }, rot: -1.3 },
    { kind: "cone", pos: { x: 0.6, y: -12.5 } },
    { kind: "cone", pos: { x: -1.5, y: -12.5 } },
    { kind: "sign", pos: { x: -19, y: -13 } },

    // --- Apron ---
    { kind: "lamp", pos: { x: 16, y: -12 } },
    { kind: "lamp", pos: { x: 44, y: -12 } },
    { kind: "lamp", pos: { x: 16, y: 12 } },
    { kind: "lamp", pos: { x: 44, y: 12 } },
    { kind: "tower", pos: { x: 18, y: 10 }, rot: -0.9 },
    { kind: "antenna", pos: { x: 20, y: -10 } },
    { kind: "container", pos: { x: 25, y: -6 }, color: 0x3a6a8a },
    { kind: "container", pos: { x: 25, y: -3 }, color: 0xb0902a },
    { kind: "container", pos: { x: 29.5, y: -6 }, color: 0x6a4a8a },
    { kind: "blockhouse", pos: { x: 38, y: -6 }, rot: 3.1416 }, // door west
    { kind: "tank", pos: { x: 42, y: 4 } },
    { kind: "tank", pos: { x: 42, y: 6.6 } },
    { kind: "pipe", pos: { x: 20, y: 4 }, rot: 1.57 },
    { kind: "pipe", pos: { x: 21.4, y: 4 }, rot: 1.57 },
    { kind: "wreck", pos: { x: 33, y: 9 }, rot: 0.6 },
    { kind: "generator", pos: { x: 35, y: -12 } },
    { kind: "firebarrel", pos: { x: 30, y: 1 } },
    { kind: "floodlight", pos: { x: 26, y: 12 }, rot: -1.7 },
    { kind: "crate", pos: { x: 44, y: -6 } },
    { kind: "crate", pos: { x: 44.9, y: -5.4 }, scale: 0.9 },
    { kind: "sandbag", pos: { x: 16, y: -6 }, rot: 1.57 },
    { kind: "sandbag", pos: { x: 16, y: -4.9 }, rot: 1.57 },
    { kind: "sandbag", pos: { x: 16, y: -3.8 }, rot: 1.57 },
    { kind: "rubble", pos: { x: 37, y: 12 } },

    // --- Revetment ---
    { kind: "lamp", pos: { x: -8, y: -16 } },
    { kind: "lamp", pos: { x: 12, y: -16 } },
    { kind: "lamp", pos: { x: -8, y: -36 } },
    { kind: "lamp", pos: { x: 12, y: -36 } },
    { kind: "blockhouse", pos: { x: 8, y: -30 }, rot: 3.1416 }, // door west
    { kind: "container", pos: { x: -6, y: -22 }, color: 0x2a6a8a },
    { kind: "container", pos: { x: -6, y: -19 }, color: 0x8a4a2a },
    { kind: "container", pos: { x: -1.5, y: -22 }, color: 0x6a6a2a },
    { kind: "tank", pos: { x: 10, y: -20 } },
    { kind: "tank", pos: { x: 10, y: -17.4 } },
    { kind: "pipe", pos: { x: 6, y: -20 } },
    { kind: "pipe", pos: { x: 6, y: -21.4 } },
    { kind: "wreck", pos: { x: 0, y: -34 }, rot: 1.8 },
    { kind: "sandbag", pos: { x: -8, y: -32 }, rot: 1.57 },
    { kind: "sandbag", pos: { x: -8, y: -30.9 }, rot: 1.57 },
    { kind: "sandbag", pos: { x: -8, y: -29.8 }, rot: 1.57 },
    { kind: "concreteBarrier", pos: { x: -6, y: -24.5 } },
    { kind: "concreteBarrier", pos: { x: -3.8, y: -24.5 } },
    { kind: "firebarrel", pos: { x: -4, y: -31 } },
    { kind: "floodlight", pos: { x: 4, y: -17 }, rot: 1.9 },
    { kind: "crate", pos: { x: -4, y: -17 } },
    { kind: "crate", pos: { x: -3.1, y: -16.4 }, scale: 0.9 },
    { kind: "rubble", pos: { x: 11.5, y: -33 } },
    { kind: "cone", pos: { x: 1.4, y: -36.5 } },
    { kind: "cone", pos: { x: 3.2, y: -36.5 } },

    // --- Outside the wire: scrub on the strip ---
    { kind: "deadTree", pos: { x: -25, y: -6 } },
    { kind: "deadTree", pos: { x: -25, y: 10 } },
    { kind: "deadTree", pos: { x: 20, y: -20 } },
    { kind: "deadTree", pos: { x: 26, y: -30 } },
    { kind: "deadTree", pos: { x: 49, y: 8 } },
    { kind: "deadTree", pos: { x: -16, y: -34 } },
  ],

  decals: [
    { kind: "stencil", pos: { x: -12, y: -13.85 }, rot: 1.5708, height: 1.75, text: "DEPOT 3" },
    { kind: "tag", pos: { x: 8, y: -13.85 }, rot: 1.5708, height: 1.6, text: "SAND GETS\nIN EVERYTHING", color: 0xf0c033 },
    { kind: "tally", pos: { x: -12, y: 13.85 }, rot: -1.5708, height: 1.5, scale: 1.1 },
    { kind: "biohazard", pos: { x: -21.85, y: -8 }, rot: 0, height: 1.7 },
    { kind: "stencil", pos: { x: 13.55, y: -8 }, rot: 3.1416, height: 1.75, text: "APRON" },
    { kind: "arrow", pos: { x: 13.55, y: 8 }, rot: 3.1416, height: 1.55 },
    { kind: "stencil", pos: { x: 1.5, y: -14.75 }, rot: -1.5708, height: 1.75, text: "REVETMENT" },
    { kind: "tag", pos: { x: 36, y: -13.85 }, rot: 1.5708, height: 1.6, text: "FUEL ONLY" },
    { kind: "tag", pos: { x: 30, y: 13.85 }, rot: -1.5708, height: 1.6, text: "WE HELD HERE" },
    { kind: "stencil", pos: { x: -9.85, y: -33 }, rot: 0, height: 1.75, text: "MAG 2" },
    { kind: "tag", pos: { x: 8, y: -37.85 }, rot: 1.5708, height: 1.6, text: "DO NOT DIG", color: 0xd8452c },
    { kind: "blood", pos: { x: -18, y: -11 }, height: 0, scale: 1.2 },
    { kind: "blood", pos: { x: -19, y: 0 }, height: 0 },
    { kind: "blood", pos: { x: 30, y: -11 }, height: 0, scale: 1.1 },
    { kind: "blood", pos: { x: 2, y: -35 }, height: 0 },
    { kind: "scorch", pos: { x: -10, y: -3 }, height: 0, scale: 1.4 },
    { kind: "scorch", pos: { x: 33, y: 10 }, height: 0, scale: 1.3 },
    { kind: "scorch", pos: { x: 0, y: -33 }, height: 0, scale: 1.2 },
  ],
};
