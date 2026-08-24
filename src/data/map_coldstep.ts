// "Coldstep" — an arctic listening post being swallowed by the drifts. A wide
// open yard with a sunken vehicle bay and a radar platform (region 0), and a
// hangar apron behind a 900-point door (region 1). Snow flattens contrast and
// the sun is low and blue, so the readable light comes from lamps, floodlights
// and the drums people burned to stay warm.
//
// Coordinate note: +x is east, +y is south (screen-down in the 2D view).

import type { MapDef, WallRect } from "../sim/types";

const wall = (minX: number, minY: number, maxX: number, maxY: number): WallRect => ({ minX, minY, maxX, maxY });

// Yard interior: x[-24,20] y[-16,16].  Hangar apron: x[20,52] y[-16,16].
export const COLDSTEP: MapDef = {
  id: "coldstep",
  name: "Coldstep",
  blurb: "An arctic listening post going under the drifts. Open ground, long sightlines, nowhere warm.",
  bounds: wall(-28, -20, 56, 20),
  playerSpawn: { x: -6, y: 0 },
  startRegions: [0],
  // The compound is one plain rectangle, so the cage is too — it sits on the
  // inner wall faces and only bites where the barrier gaps are.
  playBounds: [wall(-24, -16, 52, 16)],

  walls: [
    // --- Yard (region 0) perimeter ---
    wall(-24.6, -16.6, -4, -16), wall(0, -16.6, 20.3, -16), // north, gap x[-4,0]
    wall(-24.6, 16, -4, 16.6), wall(0, 16, 20.3, 16.6), // south, gap x[-4,0]
    wall(-24.6, -16.6, -24, -2), wall(-24.6, 2, -24, 16.6), // west, gap y[-2,2]

    // --- Shared wall (x=20), gap = hangar door y[-3,3] ---
    wall(19.7, -16.6, 20.3, -3), wall(19.7, 3, 20.3, 16.6),

    // --- Hangar apron (region 1) perimeter ---
    wall(19.7, -16.6, 34, -16), wall(38, -16.6, 52.6, -16), // north, gap x[34,38]
    wall(19.7, 16, 52.6, 16.6), // south solid
    wall(52, -16.6, 52.6, -2), wall(52, 2, 52.6, 16.6), // east, gap y[-2,2]

    // Snow fencing and revetment walls, breaking the long sightlines.
    wall(-16, 2, -8, 3),
    wall(4, 4, 5, 12),
    wall(30, 2, 38, 3),
    wall(44, -10, 45, -2),
  ],

  barriers: [
    { pos: { x: -2, y: -16 }, inward: { x: 0, y: 1 }, region: 0 }, // north
    { pos: { x: -2, y: 16 }, inward: { x: 0, y: -1 }, region: 0 }, // south
    { pos: { x: -24, y: 0 }, inward: { x: 1, y: 0 }, region: 0 }, // west
    { pos: { x: 36, y: -16 }, inward: { x: 0, y: 1 }, region: 1 }, // apron north
    { pos: { x: 52, y: 0 }, inward: { x: -1, y: 0 }, region: 1 }, // apron east
  ],

  wallBuys: [
    { pos: { x: -22, y: -13 }, weaponId: "breacher", region: 0 },
    { pos: { x: 50, y: -13 }, weaponId: "kr12", region: 1 },
    { pos: { x: 50, y: 13 }, weaponId: "lancer", region: 1 },
  ],

  doors: [
    {
      id: "hangar-door",
      pos: { x: 20, y: 0 },
      name: "Open Hangar",
      cost: 900,
      blocks: wall(19.7, -3, 20.3, 3),
      opensRegion: 1,
    },
  ],

  // Wind-packed drifts running north-east, a sunken vehicle bay, a raised radar
  // platform, and the levelled apron the hangar sits on.
  terrain: {
    baseHeight: 0,
    layers: [
      { kind: "drifts", amplitude: 0.5, wavelength: 18, seed: 4021 },
      { kind: "dunes", amplitude: 0.3, wavelength: 9, seed: 77, angle: 0.6 },
    ],
    flatZones: [
      { rect: wall(-18, -12, -6, -2), height: -1.6, blend: 2.0 }, // vehicle bay
      { rect: wall(6, 6, 16, 14), height: 1.4, blend: 1.8 }, // radar platform
      { rect: wall(24, -12, 46, 8), height: 0.6, blend: 2.5 }, // hangar apron
      { rect: wall(-21.6, 2.6, -16.4, 7.4), height: 0, blend: 1.2 }, // shelter pads
      { rect: wall(41.4, -0.4, 46.6, 4.4), height: 0.6, blend: 1.2 },
    ],
  },

  theme: {
    ground: "snow",
    fog: 0x1e2733,
    fogNear: 40,
    fogFar: 120,
    sky: 0x223044,
    hemiSky: 0xb9cbe0,
    hemiGround: 0x3a4450,
    dir: 0xbfd4ec,
    dirIntensity: 1.15,
  },

  props: [
    // --- Yard: perimeter lighting and the warm spots ---
    { kind: "lamp", pos: { x: -22, y: -14 } },
    { kind: "lamp", pos: { x: 18, y: -14 } },
    { kind: "lamp", pos: { x: -22, y: 14 } },
    { kind: "lamp", pos: { x: 18, y: 14 } },
    { kind: "firebarrel", pos: { x: -12, y: 8 } },
    { kind: "firebarrel", pos: { x: 10, y: -10 } },
    { kind: "blockhouse", pos: { x: -19, y: 5 } }, // warm-up hut, door east

    // --- Yard: the sunken vehicle bay ---
    { kind: "wreck", pos: { x: -11, y: -7.5 }, rot: 0.7 },
    { kind: "pipe", pos: { x: -15, y: -4 } },
    { kind: "pipe", pos: { x: -15, y: -5.4 } },
    { kind: "rubble", pos: { x: -8.5, y: -9 } },

    // --- Yard: stores and cover ---
    { kind: "container", pos: { x: -10, y: -12 }, color: 0x3a6a8a },
    { kind: "container", pos: { x: -14.5, y: -12 }, color: 0x8a4a2a },
    { kind: "crate", pos: { x: 6, y: -13 } },
    { kind: "crate", pos: { x: 6.9, y: -12.6 }, scale: 0.9 },
    { kind: "sandbag", pos: { x: -20, y: -9 } },
    { kind: "sandbag", pos: { x: -18.9, y: -9 } },
    { kind: "sandbag", pos: { x: -17.8, y: -9 } },
    { kind: "tank", pos: { x: 14, y: -6 } },
    { kind: "tank", pos: { x: 14, y: -3.4 } },
    { kind: "dumpster", pos: { x: 16, y: 10 }, rot: 1.57 },
    { kind: "concreteBarrier", pos: { x: 12, y: 2 }, rot: 1.57 },
    { kind: "concreteBarrier", pos: { x: 12, y: 4.2 }, rot: 1.57 },

    // --- Yard: the radar platform ---
    { kind: "antenna", pos: { x: 11, y: 10 } },
    { kind: "generator", pos: { x: 8, y: 12 } },
    { kind: "floodlight", pos: { x: 14, y: 8 }, rot: 2.4 },
    { kind: "sign", pos: { x: 6.4, y: 9 }, rot: 3.1416 },

    // --- Hangar apron ---
    { kind: "lamp", pos: { x: 22, y: -14 } },
    { kind: "lamp", pos: { x: 50, y: -14 } },
    { kind: "lamp", pos: { x: 22, y: 14 } },
    { kind: "lamp", pos: { x: 50, y: 14 } },
    { kind: "tower", pos: { x: 24, y: 12 }, rot: -0.8 },
    { kind: "container", pos: { x: 30, y: -8 }, color: 0x2f7a3a },
    { kind: "container", pos: { x: 30, y: -5 }, color: 0xb0902a },
    { kind: "container", pos: { x: 34.5, y: -8 }, color: 0x6a4a8a },
    { kind: "blockhouse", pos: { x: 44, y: 2 }, rot: 3.1416 }, // door west
    { kind: "generator", pos: { x: 26, y: -13 } },
    { kind: "crate", pos: { x: 40, y: 6 } },
    { kind: "crate", pos: { x: 40.9, y: 6.6 }, scale: 0.9 },
    { kind: "pipe", pos: { x: 47, y: 10 }, rot: 1.57 },
    { kind: "pipe", pos: { x: 48.4, y: 10 }, rot: 1.57 },
    { kind: "tank", pos: { x: 48, y: -8 } },
    { kind: "tank", pos: { x: 48, y: -5.4 } },
    { kind: "wreck", pos: { x: 41, y: -12 }, rot: 2.2 },
    { kind: "firebarrel", pos: { x: 36, y: 6 } },
    { kind: "floodlight", pos: { x: 33, y: 12 }, rot: -1.6 },
    { kind: "sandbag", pos: { x: 50, y: 6 }, rot: 1.57 },
    { kind: "sandbag", pos: { x: 50, y: 7.1 }, rot: 1.57 },
    { kind: "sandbag", pos: { x: 50, y: 8.2 }, rot: 1.57 },
    { kind: "cone", pos: { x: 20, y: 4.5 } },
    { kind: "cone", pos: { x: 20, y: -4.5 } },

    // --- Outside the wire: half-buried scrub ---
    { kind: "deadTree", pos: { x: -26, y: -12 } },
    { kind: "deadTree", pos: { x: -26, y: 11 } },
    { kind: "deadTree", pos: { x: 8, y: -18.5 } },
    { kind: "deadTree", pos: { x: 54, y: -12 } },
    { kind: "deadTree", pos: { x: 54, y: 12 } },
  ],

  decals: [
    { kind: "stencil", pos: { x: -6, y: -15.85 }, rot: 1.5708, height: 1.75, text: "STATION 9" },
    { kind: "tag", pos: { x: 10, y: -15.85 }, rot: 1.5708, height: 1.6, text: "COLD KEEPS\nTHEM SLOW", color: 0x6fd0ff },
    { kind: "tally", pos: { x: -14, y: 15.85 }, rot: -1.5708, height: 1.5, scale: 1.1 },
    { kind: "tag", pos: { x: 8, y: 15.85 }, rot: -1.5708, height: 1.6, text: "NO RELIEF" },
    { kind: "biohazard", pos: { x: -23.85, y: -8 }, rot: 0, height: 1.7 },
    { kind: "stencil", pos: { x: 19.55, y: -8 }, rot: 3.1416, height: 1.75, text: "HANGAR" },
    { kind: "arrow", pos: { x: 19.55, y: 8 }, rot: 3.1416, height: 1.55 },
    { kind: "stencil", pos: { x: 44, y: 15.85 }, rot: -1.5708, height: 1.75, text: "FUEL — NO FLAME" },
    { kind: "tag", pos: { x: 30, y: -15.85 }, rot: 1.5708, height: 1.6, text: "IT WALKED IN" },
    { kind: "blood", pos: { x: -2, y: -13 }, height: 0, scale: 1.2 },
    { kind: "blood", pos: { x: -21, y: 0 }, height: 0 },
    { kind: "blood", pos: { x: 36, y: -13 }, height: 0, scale: 1.1 },
    { kind: "scorch", pos: { x: -11, y: -6.4 }, height: 0, scale: 1.4 },
    { kind: "scorch", pos: { x: 41, y: -11 }, height: 0, scale: 1.3 },
  ],
};
