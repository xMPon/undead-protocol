// "Tidewater" — a container terminal on a dead harbour, at night. Three yards
// in a line, each behind the last: the quay (region 0), the dry dock (region 1,
// 800 points) and the terminal shed (region 2, 1250). Fighting runs east down
// the wharf, so every door you buy is a door you can be pushed back through.
//
// Coordinate note: +x is east, +y is south (screen-down in the 2D view).

import type { MapDef, WallRect } from "../sim/types";

const wall = (minX: number, minY: number, maxX: number, maxY: number): WallRect => ({ minX, minY, maxX, maxY });

// Quay: x[-26,-2].  Dry dock: x[-2,26].  Terminal: x[26,54].  All y[-12,12].
export const TIDEWATER: MapDef = {
  id: "tidewater",
  name: "Tidewater",
  blurb: "A container terminal on a dead harbour. Three yards in a line — every door is a door you can be pushed back through.",
  bounds: wall(-31, -17, 59, 17),
  playerSpawn: { x: -20, y: 4 },
  startRegions: [0],
  playBounds: [wall(-26, -12, 54, 12)],

  walls: [
    // --- Quay (region 0) perimeter ---
    wall(-26.6, -12.6, -16, -12), wall(-12, -12.6, -1.7, -12), // north, gap x[-16,-12]
    wall(-26.6, 12, -16, 12.6), wall(-12, 12, -1.7, 12.6), // south, gap x[-16,-12]
    wall(-26.6, -12.6, -26, -2), wall(-26.6, 2, -26, 12.6), // west, gap y[-2,2]

    // --- Quay/dry-dock wall (x=-2), gap = dry-dock door y[-3,3] ---
    wall(-2.3, -12.6, -1.7, -3), wall(-2.3, 3, -1.7, 12.6),

    // --- Dry dock (region 1) perimeter ---
    wall(-2.3, -12.6, 8, -12), wall(12, -12.6, 26.3, -12), // north, gap x[8,12]
    wall(-2.3, 12, 8, 12.6), wall(12, 12, 26.3, 12.6), // south, gap x[8,12]

    // --- Dry-dock/terminal wall (x=26), gap = terminal door y[-3,3] ---
    wall(25.7, -12.6, 26.3, -3), wall(25.7, 3, 26.3, 12.6),

    // --- Terminal (region 2) perimeter ---
    wall(25.7, -12.6, 38, -12), wall(42, -12.6, 54.6, -12), // north, gap x[38,42]
    wall(25.7, 12, 54.6, 12.6), // south solid
    wall(54, -12.6, 54.6, -2), wall(54, 2, 54.6, 12.6), // east, gap y[-2,2]

    // Stacked-container walls and a crane rail, breaking the long wharf.
    wall(-22, -6, -14, -5),
    wall(-8, 4, -7, 11),
    wall(16, -10, 17, -3),
    wall(32, 3, 40, 4),
    wall(46, -8, 47, -1),
  ],

  barriers: [
    { pos: { x: -14, y: -12 }, inward: { x: 0, y: 1 }, region: 0 }, // quay north
    { pos: { x: -14, y: 12 }, inward: { x: 0, y: -1 }, region: 0 }, // quay south
    { pos: { x: -26, y: 0 }, inward: { x: 1, y: 0 }, region: 0 }, // quay west
    { pos: { x: 10, y: -12 }, inward: { x: 0, y: 1 }, region: 1 }, // dock north
    { pos: { x: 10, y: 12 }, inward: { x: 0, y: -1 }, region: 1 }, // dock south
    { pos: { x: 40, y: -12 }, inward: { x: 0, y: 1 }, region: 2 }, // terminal north
    { pos: { x: 54, y: 0 }, inward: { x: -1, y: 0 }, region: 2 }, // terminal east
  ],

  wallBuys: [
    { pos: { x: -24, y: -8 }, weaponId: "pdw", region: 0 },
    { pos: { x: 24, y: -9 }, weaponId: "kr12", region: 1 },
    { pos: { x: 52, y: -9 }, weaponId: "lancer", region: 2 },
    { pos: { x: 52, y: 9 }, weaponId: "havoc", region: 2 },
  ],

  doors: [
    {
      id: "drydock-door",
      pos: { x: -2, y: 0 },
      name: "Open Dry Dock",
      cost: 800,
      blocks: wall(-2.3, -3, -1.7, 3),
      opensRegion: 1,
    },
    {
      id: "terminal-door",
      pos: { x: 26, y: 0 },
      name: "Open Terminal",
      cost: 1250,
      blocks: wall(25.7, -3, 26.3, 3),
      opensRegion: 2,
    },
  ],

  // Near-flat wharf concrete, a drained dry dock in the middle yard, and a
  // raised loading pier in the terminal.
  terrain: {
    baseHeight: 0,
    layers: [
      { kind: "hills", amplitude: 0.25, wavelength: 30, seed: 12 },
      { kind: "noise", amplitude: 0.12, wavelength: 7, seed: 555 },
    ],
    flatZones: [
      { rect: wall(2, -8, 20, 8), height: -2.4, blend: 2.6 }, // drained dry dock
      { rect: wall(32, -9, 50, -1), height: 1.2, blend: 2.0 }, // loading pier
      { rect: wall(-22, 2, -12, 10), height: 0.5, blend: 1.5 }, // quay apron
      { rect: wall(-24.6, 4.6, -19.4, 9.4), height: 0.5, blend: 1.2 }, // shelter pads
      { rect: wall(19.4, 4.6, 24.6, 9.4), height: 0, blend: 1.2 },
      { rect: wall(41.4, 3.6, 46.6, 8.4), height: 0, blend: 1.2 },
    ],
  },

  theme: {
    ground: "dock",
    fog: 0x141b20,
    fogNear: 38,
    fogFar: 110,
    sky: 0x1a2430,
    hemiSky: 0x8fa8bc,
    hemiGround: 0x232a2e,
    dir: 0xa8c0d8,
    dirIntensity: 0.9,
  },

  props: [
    // --- Quay ---
    { kind: "lamp", pos: { x: -24, y: -10 } },
    { kind: "lamp", pos: { x: -4, y: -10 } },
    { kind: "lamp", pos: { x: -24, y: 10 } },
    { kind: "lamp", pos: { x: -4, y: 10 } },
    { kind: "blockhouse", pos: { x: -22, y: 7 } }, // harbour office, door east
    { kind: "container", pos: { x: -20, y: -9 }, color: 0x2a6a8a },
    { kind: "container", pos: { x: -16, y: -9 }, color: 0x8a4a2a },
    { kind: "container", pos: { x: -20, y: -2 }, rot: 1.57, color: 0x2f7a3a },
    { kind: "tank", pos: { x: -6, y: -6 } },
    { kind: "tank", pos: { x: -6, y: -3.4 } },
    { kind: "pipe", pos: { x: -12, y: 2 } },
    { kind: "pipe", pos: { x: -12, y: 0.6 } },
    { kind: "dumpster", pos: { x: -10, y: -11 } },
    { kind: "firebarrel", pos: { x: -16, y: 4 } },
    { kind: "floodlight", pos: { x: -12, y: 8 }, rot: -0.9 },
    { kind: "crate", pos: { x: -5, y: 5 } },
    { kind: "crate", pos: { x: -5.9, y: 5.6 }, scale: 0.9 },
    { kind: "sandbag", pos: { x: -24, y: -5 }, rot: 1.57 },
    { kind: "sandbag", pos: { x: -24, y: -3.9 }, rot: 1.57 },
    { kind: "sign", pos: { x: -24, y: -11.4 } },
    { kind: "cone", pos: { x: -3, y: 4.4 } },
    { kind: "cone", pos: { x: -3, y: -4.4 } },

    // --- Dry dock ---
    { kind: "lamp", pos: { x: 0, y: -10 } },
    { kind: "lamp", pos: { x: 24, y: -10 } },
    { kind: "lamp", pos: { x: 0, y: 10 } },
    { kind: "lamp", pos: { x: 24, y: 10 } },
    { kind: "tower", pos: { x: 4, y: -10 }, rot: 1.1 },
    { kind: "pipe", pos: { x: 8, y: -2 } },
    { kind: "pipe", pos: { x: 8, y: -0.6 } },
    { kind: "pipe", pos: { x: 13, y: 4 }, rot: 0.4 },
    { kind: "wreck", pos: { x: 6, y: 5 }, rot: 2.7 },
    { kind: "rubble", pos: { x: 17, y: 6 } },
    { kind: "blockhouse", pos: { x: 22, y: 7 }, rot: 3.1416 }, // door west
    { kind: "container", pos: { x: 20, y: -6 }, color: 0xb0902a },
    { kind: "container", pos: { x: 20, y: -9 }, color: 0x6a4a8a },
    { kind: "firebarrel", pos: { x: 2, y: 8 } },
    { kind: "floodlight", pos: { x: 18, y: 2 }, rot: 2.6 },
    { kind: "generator", pos: { x: 4, y: -6 } },
    { kind: "barrel", pos: { x: 11, y: -8 }, color: 0xc23b3b },
    { kind: "barrel", pos: { x: 12, y: -7.5 }, color: 0x3a8a4a },

    // --- Terminal ---
    { kind: "lamp", pos: { x: 28, y: -10 } },
    { kind: "lamp", pos: { x: 52, y: -10 } },
    { kind: "lamp", pos: { x: 28, y: 10 } },
    { kind: "antenna", pos: { x: 30, y: 8 } },
    { kind: "blockhouse", pos: { x: 44, y: 6 }, rot: 3.1416 }, // door west
    { kind: "container", pos: { x: 34, y: -6 }, color: 0x3a6a8a },
    { kind: "container", pos: { x: 34, y: -9 }, color: 0x2f7a3a },
    { kind: "container", pos: { x: 38.5, y: -6 }, color: 0x8a4a2a },
    { kind: "container", pos: { x: 43, y: -9 }, color: 0xb0902a },
    { kind: "tank", pos: { x: 50, y: 2 } },
    { kind: "tank", pos: { x: 50, y: 4.6 } },
    { kind: "wreck", pos: { x: 30, y: -3 }, rot: 1.3 },
    { kind: "firebarrel", pos: { x: 40, y: 8 } },
    { kind: "floodlight", pos: { x: 36, y: -11 }, rot: 1.4 },
    { kind: "concreteBarrier", pos: { x: 29, y: 4 }, rot: 1.57 },
    { kind: "concreteBarrier", pos: { x: 29, y: 6.2 }, rot: 1.57 },
    { kind: "rubble", pos: { x: 48, y: 10 } },
    { kind: "sandbag", pos: { x: 52, y: 4 }, rot: 1.57 },
    { kind: "sandbag", pos: { x: 52, y: 5.1 }, rot: 1.57 },

    // --- Outside the wire ---
    { kind: "deadTree", pos: { x: -29, y: 8 } },
    { kind: "deadTree", pos: { x: 20, y: -15 } },
    { kind: "deadTree", pos: { x: 57, y: -8 } },
    { kind: "deadTree", pos: { x: 44, y: 15 } },
  ],

  decals: [
    { kind: "stencil", pos: { x: -20, y: -11.85 }, rot: 1.5708, height: 1.75, text: "BERTH 4" },
    { kind: "tag", pos: { x: -6, y: -11.85 }, rot: 1.5708, height: 1.6, text: "TIDE TOOK\nTHE REST", color: 0x6fd0ff },
    { kind: "tally", pos: { x: -20, y: 11.85 }, rot: -1.5708, height: 1.5, scale: 1.1 },
    { kind: "biohazard", pos: { x: -25.85, y: -8 }, rot: 0, height: 1.7 },
    { kind: "stencil", pos: { x: -2.55, y: -8 }, rot: 3.1416, height: 1.75, text: "DRY DOCK" },
    { kind: "arrow", pos: { x: -2.55, y: 8 }, rot: 3.1416, height: 1.55 },
    { kind: "stencil", pos: { x: 25.55, y: -8 }, rot: 3.1416, height: 1.75, text: "TERMINAL" },
    { kind: "tag", pos: { x: 16, y: 11.85 }, rot: -1.5708, height: 1.6, text: "SHIP LEFT\nWITHOUT US" },
    { kind: "tag", pos: { x: 46, y: -11.85 }, rot: 1.5708, height: 1.6, text: "LOCK IT", color: 0xd8452c },
    { kind: "stencil", pos: { x: 44, y: 11.85 }, rot: -1.5708, height: 1.75, text: "QUARANTINE" },
    { kind: "blood", pos: { x: -14, y: -9 }, height: 0, scale: 1.2 },
    { kind: "blood", pos: { x: -23, y: 0 }, height: 0 },
    { kind: "blood", pos: { x: 10, y: -9 }, height: 0, scale: 1.1 },
    { kind: "blood", pos: { x: 40, y: -9 }, height: 0 },
    { kind: "scorch", pos: { x: 6, y: 6 }, height: 0, scale: 1.4 },
    { kind: "scorch", pos: { x: 30, y: -2 }, height: 0, scale: 1.3 },
  ],
};
