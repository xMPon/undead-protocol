// "Deepcut" — an open-cast quarry worked until the day it wasn't. The rim yard
// (region 0) looks down into the pit, which drops four units below it (region 1,
// 950 points), and a crusher house sits off the pit's south side (region 2,
// 1300). The elevation is cosmetic to the simulation but not to the fight: the
// pit is a bowl you can be surrounded in.
//
// Coordinate note: +x is east, +y is south (screen-down in the 2D view).

import type { MapDef, WallRect } from "../sim/types";

const wall = (minX: number, minY: number, maxX: number, maxY: number): WallRect => ({ minX, minY, maxX, maxY });

// Rim: x[-20,16] y[-14,14].  Pit: x[16,52] y[-14,14].  Crusher: x[16,52] y[14,36].
export const DEEPCUT: MapDef = {
  id: "deepcut",
  name: "Deepcut",
  blurb: "An open-cast quarry. The pit is four units down and every wall of it is somewhere they can come from.",
  bounds: wall(-26, -20, 58, 42),
  playerSpawn: { x: -12, y: 6 },
  startRegions: [0],
  playBounds: [
    wall(-20, -14, 52, 14), // rim + pit
    wall(16, 12.6, 52, 36), // crusher house, overlapping the pit at its doorway
  ],

  walls: [
    // --- Rim yard (region 0) perimeter ---
    wall(-20.6, -14.6, -6, -14), wall(-2, -14.6, 16.3, -14), // north, gap x[-6,-2]
    wall(-20.6, 14, -6, 14.6), wall(-2, 14, 16.3, 14.6), // south, gap x[-6,-2]
    wall(-20.6, -14.6, -20, -2), wall(-20.6, 2, -20, 14.6), // west, gap y[-2,2]

    // --- Rim/pit wall (x=16), gap = pit door y[-3,3] ---
    wall(15.7, -14.6, 16.3, -3), wall(15.7, 3, 16.3, 14.6),

    // --- Pit (region 1) perimeter ---
    wall(15.7, -14.6, 30, -14), wall(34, -14.6, 52.6, -14), // north, gap x[30,34]
    wall(52, -14.6, 52.6, -2), wall(52, 2, 52.6, 14.6), // east, gap y[-2,2]
    wall(15.7, 14, 30, 14.6), wall(36, 14, 52.6, 14.6), // south, gap = crusher door x[30,36]

    // --- Crusher house (region 2) perimeter ---
    wall(15.7, 14, 16.3, 24), wall(15.7, 28, 16.3, 36.6), // west, gap x-barrier y[24,28]
    wall(52, 14, 52.6, 36.6), // east solid
    wall(15.7, 36, 32, 36.6), wall(36, 36, 52.6, 36.6), // south, gap x[32,36]

    // Spoil heaps and conveyor piers.
    wall(-14, -6, -6, -5),
    wall(4, 4, 5, 12),
    wall(24, -8, 25, -1),
    wall(0, -10, 8, -9),
    wall(22, 22, 30, 23),
  ],

  barriers: [
    { pos: { x: -4, y: -14 }, inward: { x: 0, y: 1 }, region: 0 }, // rim north
    { pos: { x: -4, y: 14 }, inward: { x: 0, y: -1 }, region: 0 }, // rim south
    { pos: { x: -20, y: 0 }, inward: { x: 1, y: 0 }, region: 0 }, // rim west
    { pos: { x: 32, y: -14 }, inward: { x: 0, y: 1 }, region: 1 }, // pit north
    { pos: { x: 52, y: 0 }, inward: { x: -1, y: 0 }, region: 1 }, // pit east
    { pos: { x: 34, y: 36 }, inward: { x: 0, y: -1 }, region: 2 }, // crusher south
    { pos: { x: 16, y: 26 }, inward: { x: 1, y: 0 }, region: 2 }, // crusher west
  ],

  wallBuys: [
    { pos: { x: -18, y: -11 }, weaponId: "pdw", region: 0 },
    { pos: { x: 50, y: -11 }, weaponId: "breacher", region: 1 },
    { pos: { x: 50, y: 11 }, weaponId: "lancer", region: 1 },
    { pos: { x: 50, y: 33 }, weaponId: "kr12", region: 2 },
  ],

  doors: [
    {
      id: "pit-door",
      pos: { x: 16, y: 0 },
      name: "Open Pit",
      cost: 950,
      blocks: wall(15.7, -3, 16.3, 3),
      opensRegion: 1,
    },
    {
      id: "crusher-door",
      pos: { x: 33, y: 14.3 },
      name: "Open Crusher",
      cost: 1300,
      blocks: wall(30, 14, 36, 14.6),
      opensRegion: 2,
    },
  ],

  // Stepped benches cut into the rock, a level rim yard, and the pit floor four
  // units down with a long ramp in.
  terrain: {
    baseHeight: 0,
    layers: [
      { kind: "terraces", amplitude: 1.6, wavelength: 26, seed: 4242, steps: 5 },
      { kind: "noise", amplitude: 0.18, wavelength: 7, seed: 8 },
    ],
    flatZones: [
      { rect: wall(-18, -12, 14, 12), height: 0.8, blend: 2.0 }, // rim yard
      { rect: wall(20, -10, 48, 10), height: -4.0, blend: 3.5 }, // the pit floor
      { rect: wall(18, 16, 50, 34), height: 0.2, blend: 2.0 }, // crusher floor
      { rect: wall(-18.6, 5.6, -13.4, 10.4), height: 0.8, blend: 1.2 }, // shelter pads
      { rect: wall(41.4, 3.6, 46.6, 8.4), height: -4.0, blend: 1.2 },
      { rect: wall(17.4, 27.6, 22.6, 32.4), height: 0.2, blend: 1.2 },
    ],
  },

  theme: {
    ground: "quarry",
    fog: 0x241f18,
    fogNear: 42,
    fogFar: 120,
    sky: 0x2e2a22,
    hemiSky: 0xc0b090,
    hemiGround: 0x40382c,
    dir: 0xffcf9a,
    dirIntensity: 1.35,
  },

  props: [
    // --- Rim yard ---
    { kind: "lamp", pos: { x: -18, y: -12 } },
    { kind: "lamp", pos: { x: 14, y: -12 } },
    { kind: "lamp", pos: { x: -18, y: 12 } },
    { kind: "lamp", pos: { x: 14, y: 12 } },
    { kind: "blockhouse", pos: { x: -16, y: 8 } }, // weighbridge office, door east
    { kind: "rock", pos: { x: -10, y: -10 }, scale: 1.3 },
    { kind: "rock", pos: { x: -8.4, y: -9 }, scale: 0.9 },
    { kind: "rock", pos: { x: 8, y: 8 }, scale: 1.2 },
    { kind: "rubble", pos: { x: -12, y: -2 } },
    { kind: "rubble", pos: { x: 2, y: -11 } },
    { kind: "container", pos: { x: 6, y: -8 }, color: 0x8a4a2a },
    { kind: "container", pos: { x: 6, y: -5 }, color: 0x3a6a8a },
    { kind: "tank", pos: { x: 12, y: -4 } },
    { kind: "tank", pos: { x: 12, y: -1.4 } },
    { kind: "pipe", pos: { x: -8, y: 10 } },
    { kind: "pipe", pos: { x: -8, y: 8.6 } },
    { kind: "firebarrel", pos: { x: -8, y: 3 } },
    { kind: "floodlight", pos: { x: 10, y: 4 }, rot: 2.7 },
    { kind: "generator", pos: { x: -18, y: -6 } },
    { kind: "crate", pos: { x: 10, y: -11 } },
    { kind: "crate", pos: { x: 10.9, y: -10.4 }, scale: 0.9 },
    { kind: "sign", pos: { x: 14.4, y: -6 }, rot: 3.1416 },
    { kind: "cone", pos: { x: 14.6, y: 4.4 } },
    { kind: "cone", pos: { x: 14.6, y: -4.4 } },

    // --- The pit ---
    { kind: "lamp", pos: { x: 18, y: -12 } },
    { kind: "lamp", pos: { x: 50, y: -12 } },
    { kind: "lamp", pos: { x: 18, y: 12 } },
    { kind: "tower", pos: { x: 20, y: 8 }, rot: -0.7 },
    { kind: "rock", pos: { x: 28, y: 4 }, scale: 1.4 },
    { kind: "rock", pos: { x: 30, y: 5.4 }, scale: 1.0 },
    { kind: "rock", pos: { x: 40, y: -8 }, scale: 1.2 },
    { kind: "rubble", pos: { x: 34, y: -4 } },
    { kind: "rubble", pos: { x: 44, y: -2 } },
    { kind: "blockhouse", pos: { x: 44, y: 6 }, rot: 3.1416 }, // crib hut, door west
    { kind: "pipe", pos: { x: 26, y: -10 } },
    { kind: "pipe", pos: { x: 26, y: -11.4 } },
    { kind: "wreck", pos: { x: 36, y: 9 }, rot: 1.9 },
    { kind: "tank", pos: { x: 48, y: -6 } },
    { kind: "tank", pos: { x: 48, y: -3.4 } },
    { kind: "firebarrel", pos: { x: 26, y: -6 } },
    { kind: "floodlight", pos: { x: 38, y: -12 }, rot: 1.5 },
    { kind: "container", pos: { x: 22, y: 2 }, rot: 1.57, color: 0x2f7a3a },
    { kind: "concreteBarrier", pos: { x: 50, y: 4 }, rot: 1.57 },
    { kind: "concreteBarrier", pos: { x: 50, y: 6.2 }, rot: 1.57 },

    // --- Crusher house ---
    { kind: "lamp", pos: { x: 18, y: 34 } },
    { kind: "lamp", pos: { x: 50, y: 18 } },
    { kind: "lamp", pos: { x: 50, y: 34 } },
    { kind: "blockhouse", pos: { x: 20, y: 30 } }, // door east
    { kind: "antenna", pos: { x: 26, y: 18 } },
    { kind: "tank", pos: { x: 46, y: 20 } },
    { kind: "tank", pos: { x: 46, y: 22.6 } },
    { kind: "container", pos: { x: 32, y: 20 }, color: 0xb0902a },
    { kind: "container", pos: { x: 36.5, y: 20 }, color: 0x6a4a8a },
    { kind: "pipe", pos: { x: 40, y: 28 }, rot: 1.57 },
    { kind: "pipe", pos: { x: 41.4, y: 28 }, rot: 1.57 },
    { kind: "rock", pos: { x: 28, y: 32 }, scale: 1.3 },
    { kind: "rubble", pos: { x: 24, y: 34 } },
    { kind: "wreck", pos: { x: 46, y: 30 }, rot: 2.9 },
    { kind: "firebarrel", pos: { x: 33, y: 26 } },
    { kind: "floodlight", pos: { x: 22, y: 20 }, rot: 0.8 },
    { kind: "generator", pos: { x: 28, y: 34 } },
    { kind: "sandbag", pos: { x: 19, y: 22 }, rot: 1.57 },
    { kind: "sandbag", pos: { x: 19, y: 23.1 }, rot: 1.57 },
    { kind: "crate", pos: { x: 44, y: 34 } },
    { kind: "crate", pos: { x: 44.9, y: 34.6 }, scale: 0.9 },
    { kind: "cone", pos: { x: 31.4, y: 15.4 } },
    { kind: "cone", pos: { x: 34.6, y: 15.4 } },

    // --- Outside the wire: scrub on the spoil ---
    { kind: "deadTree", pos: { x: -24, y: -8 } },
    { kind: "deadTree", pos: { x: -24, y: 10 } },
    { kind: "deadTree", pos: { x: 6, y: -18 } },
    { kind: "deadTree", pos: { x: 55, y: -6 } },
    { kind: "deadTree", pos: { x: 55, y: 26 } },
    { kind: "deadTree", pos: { x: 22, y: 40 } },
  ],

  decals: [
    { kind: "stencil", pos: { x: -12, y: -13.85 }, rot: 1.5708, height: 1.75, text: "BENCH 5" },
    { kind: "tag", pos: { x: 8, y: -13.85 }, rot: 1.5708, height: 1.6, text: "DIG DEEPER\nTHEY SAID", color: 0xf0c033 },
    { kind: "tally", pos: { x: -12, y: 13.85 }, rot: -1.5708, height: 1.5, scale: 1.1 },
    { kind: "biohazard", pos: { x: -19.85, y: -8 }, rot: 0, height: 1.7 },
    { kind: "stencil", pos: { x: 15.55, y: -8 }, rot: 3.1416, height: 1.75, text: "THE PIT" },
    { kind: "arrow", pos: { x: 15.55, y: 8 }, rot: 3.1416, height: 1.55 },
    { kind: "stencil", pos: { x: 27, y: 14.85 }, rot: 1.5708, height: 1.75, text: "CRUSHER" },
    { kind: "tag", pos: { x: 44, y: -13.85 }, rot: 1.5708, height: 1.6, text: "NOTHING\nDOWN HERE" },
    { kind: "tag", pos: { x: 24, y: 35.85 }, rot: -1.5708, height: 1.6, text: "SEALED IT", color: 0xd8452c },
    { kind: "stencil", pos: { x: 16.55, y: 32 }, rot: 0, height: 1.75, text: "HARD HAT AREA" },
    { kind: "blood", pos: { x: -4, y: -11 }, height: 0, scale: 1.2 },
    { kind: "blood", pos: { x: -17, y: 0 }, height: 0 },
    { kind: "blood", pos: { x: 32, y: -11 }, height: 0, scale: 1.1 },
    { kind: "blood", pos: { x: 34, y: 33 }, height: 0 },
    { kind: "scorch", pos: { x: 36, y: 10 }, height: 0, scale: 1.4 },
    { kind: "scorch", pos: { x: 46, y: 31 }, height: 0, scale: 1.3 },
  ],
};
