// "Coldstep" — an arctic hangar in a whiteout.
//
// The shape is a RING. One enormous open yard wraps a sealed hangar in the
// middle, so there is a continuous lap you can run forever — this is the map you
// kite on. Nothing in the ring is close cover; it is bare on purpose. Four
// barriers on the outer wall mean the horde arrives from every side at once, and
// the fog closes to twelve units, so on open ground you hear them long before
// you see them.
//
// The two paid rooms are corner annexes bolted to the perimeter, not more yards:
// small, cluttered, and the opposite of the ring in every way. They hang off the
// outer wall so their own barriers open outward — a gated room whose barriers
// opened into the ring could simply be walked into.
//
// Coordinate note: +x is east, +y is south (screen-down in the 2D view).

import type { MapDef, WallRect } from "../sim/types";

const wall = (minX: number, minY: number, maxX: number, maxY: number): WallRect => ({ minX, minY, maxX, maxY });

// Ring yard: x[-30,30] y[-22,22], wrapped around a sealed hangar at x[-9,9] y[-7,7].
export const COLDSTEP: MapDef = {
  id: "coldstep",
  name: "Coldstep",
  blurb: "A whiteout around a sealed hangar. One endless lap, no cover, and they come through all four walls.",
  bounds: wall(-36, -28, 36, 28),
  playerSpawn: { x: 0, y: 15 },
  startRegions: [0],
  // Ring, annexes and hangar footprint are one rectangle: the hangar is sealed on
  // all four sides, so no cage rect is needed to keep the player out of it.
  playBounds: [wall(-30, -22, 30, 22)],

  walls: [
    // --- Outer perimeter: four barrier gaps for the ring, two for the annexes ---
    wall(-30.6, -22.6, -4, -22), wall(0, -22.6, 20, -22), wall(24, -22.6, 30.6, -22),
    wall(-30.6, 22, -26, 22.6), wall(-22, 22, -4, 22.6), wall(0, 22, 30.6, 22.6),
    wall(-30.6, -22.6, -30, -2), wall(-30.6, 2, -30, 16), wall(-30.6, 19, -30, 22.6),
    wall(30, -22.6, 30.6, -18), wall(30, -15, 30.6, -2), wall(30, 2, 30.6, 22.6),

    // --- The hangar: a solid mass with no way in. It exists to be run around. ---
    wall(-9.6, -7.6, 9.6, -7), wall(-9.6, 7, 9.6, 7.6),
    wall(-9.6, -7.6, -9, 7.6), wall(9, -7.6, 9.6, 7.6),

    // --- North-east annex (region 1): x[14,30] y[-22,-12] ---
    wall(13.4, -22.6, 14, -11.4), // west
    wall(13.4, -12, 20, -11.4), wall(24, -12, 30.6, -11.4), // south, door gap x[20,24]

    // --- South-west stores (region 2): x[-30,-16] y[12,22] ---
    wall(-16, 11.4, -15.4, 22.6), // east
    wall(-30.6, 11.4, -24, 12), wall(-20, 11.4, -15.4, 12), // north, door gap x[-24,-20]

    // Two snow revetments, and only two: the lap has to stay runnable.
    wall(-24, -16, -16, -15),
    wall(17, 4, 18, 12),
  ],

  barriers: [
    // The ring is attacked from all four sides at once.
    { pos: { x: -2, y: -22 }, inward: { x: 0, y: 1 }, region: 0 },
    { pos: { x: -2, y: 22 }, inward: { x: 0, y: -1 }, region: 0 },
    { pos: { x: -30, y: 0 }, inward: { x: 1, y: 0 }, region: 0 },
    { pos: { x: 30, y: 0 }, inward: { x: -1, y: 0 }, region: 0 },
    { pos: { x: 22, y: -22 }, inward: { x: 0, y: 1 }, region: 1 },
    { pos: { x: 30, y: -16.5 }, inward: { x: -1, y: 0 }, region: 1 },
    { pos: { x: -24, y: 22 }, inward: { x: 0, y: -1 }, region: 2 },
    { pos: { x: -30, y: 17.5 }, inward: { x: 1, y: 0 }, region: 2 },
  ],

  wallBuys: [
    { pos: { x: -28, y: -10 }, weaponId: "pdw", region: 0 },
    { pos: { x: 16, y: -20 }, weaponId: "breacher", region: 1 },
    { pos: { x: -28, y: 20 }, weaponId: "lancer", region: 2 },
  ],

  doors: [
    {
      id: "annex-door",
      pos: { x: 22, y: -11.7 },
      name: "Open Annex",
      cost: 900,
      blocks: wall(20, -12, 24, -11.4),
      opensRegion: 1,
    },
    {
      id: "stores-door",
      pos: { x: -22, y: 11.7 },
      name: "Open Stores",
      cost: 1300,
      blocks: wall(-24, 11.4, -20, 12),
      opensRegion: 2,
    },
  ],

  // Wind-packed drifts running across the yard, one piled high enough against the
  // north-west wall to climb, and a hollow the wind has scoured out to the south-east.
  terrain: {
    baseHeight: 0,
    layers: [
      { kind: "drifts", amplitude: 0.8, wavelength: 20, seed: 4021 },
      { kind: "dunes", amplitude: 0.5, wavelength: 11, seed: 77, angle: 0.6 },
    ],
    flatZones: [
      { rect: wall(-9, -7, 9, 7), height: 0.5, blend: 0 }, // hangar slab
      { rect: wall(14, -22, 30, -12), height: 0.3, blend: 1.5 }, // annex floor
      { rect: wall(-30, 12, -16, 22), height: 0.3, blend: 1.5 }, // stores floor
      { rect: wall(-26, -20, -14, -10), height: 1.6, blend: 4.0 }, // climbable drift
      { rect: wall(16, 8, 28, 20), height: -1.6, blend: 3.0 }, // scoured hollow
    ],
  },

  // A bright daylight whiteout rather than a dusk — the only daytime map. Twelve
  // units of visibility on the most open ground in the game is the whole idea.
  theme: {
    ground: "snow",
    fog: 0xb9c6d4,
    fogNear: 12,
    fogFar: 58,
    sky: 0x8fa2b4,
    hemiSky: 0xdfe9f4,
    hemiGround: 0x8d99a4,
    dir: 0xe8f0fa,
    dirIntensity: 1.7,
  },

  props: [
    // --- Against the hangar: the only landmark in the ring ---
    { kind: "lamp", pos: { x: -11, y: -9 } },
    { kind: "lamp", pos: { x: 11, y: -9 } },
    { kind: "lamp", pos: { x: -11, y: 9 } },
    { kind: "lamp", pos: { x: 11, y: 9 } },
    { kind: "container", pos: { x: -3, y: -9.4 }, color: 0x8a4a2a },
    { kind: "container", pos: { x: 1, y: -9.4 }, color: 0x2f7a3a },
    { kind: "antenna", pos: { x: -11.5, y: 0 } },
    { kind: "generator", pos: { x: 11.8, y: 2 }, rot: 1.57 },
    { kind: "firebarrel", pos: { x: 6, y: 9.5 } },
    { kind: "sign", pos: { x: -6, y: 8.6 }, rot: -1.5708 },

    // --- The ring: bare on purpose. Landmarks, not cover. ---
    { kind: "tower", pos: { x: -25, y: -19 }, rot: 0.7 },
    { kind: "wreck", pos: { x: -22, y: 4 }, rot: 0.4 },
    { kind: "wreck", pos: { x: 21, y: -6 }, rot: 2.1 },
    { kind: "wreck", pos: { x: -6, y: 18 }, rot: 1.2 },
    { kind: "firebarrel", pos: { x: -26, y: -6 } },
    { kind: "firebarrel", pos: { x: 25, y: 16 } },
    { kind: "firebarrel", pos: { x: 0, y: -18 } },
    { kind: "rock", pos: { x: -20, y: 8 }, scale: 1.4 },
    { kind: "rock", pos: { x: -18.2, y: 9.2 }, scale: 1.0 },
    { kind: "rock", pos: { x: 25, y: -3 }, scale: 1.3 },
    { kind: "rock", pos: { x: 12, y: 18 }, scale: 1.2 },
    { kind: "rubble", pos: { x: -14, y: -6 } },
    { kind: "rubble", pos: { x: 8, y: 14 } },
    { kind: "sandbag", pos: { x: -27, y: 3 }, rot: 1.57 },
    { kind: "sandbag", pos: { x: -27, y: 4.1 }, rot: 1.57 },
    { kind: "sandbag", pos: { x: -27, y: 5.2 }, rot: 1.57 },
    { kind: "tank", pos: { x: 27, y: -8 } },
    { kind: "tank", pos: { x: 27, y: -5.4 } },
    { kind: "cone", pos: { x: -2, y: -20 } },
    { kind: "cone", pos: { x: -0.5, y: -20.5 } },

    // --- North-east annex: small and cluttered, the ring's opposite ---
    { kind: "lamp", pos: { x: 15, y: -13.5 } },
    { kind: "lamp", pos: { x: 28, y: -20.5 } },
    { kind: "crate", pos: { x: 19, y: -19 } },
    { kind: "crate", pos: { x: 19.9, y: -18.4 }, scale: 0.9 },
    { kind: "crate", pos: { x: 18.1, y: -17.7 } },
    { kind: "generator", pos: { x: 26, y: -14 } },
    { kind: "pipe", pos: { x: 22, y: -15.5 } },
    { kind: "pipe", pos: { x: 22, y: -16.9 } },
    { kind: "dumpster", pos: { x: 28.6, y: -13.5 }, rot: 1.57 },
    { kind: "firebarrel", pos: { x: 15, y: -16 } },
    { kind: "floodlight", pos: { x: 25, y: -20.5 }, rot: 2.6 },

    // --- South-west stores ---
    { kind: "lamp", pos: { x: -28, y: 13.5 } },
    { kind: "lamp", pos: { x: -18, y: 20.5 } },
    { kind: "crate", pos: { x: -21, y: 15 } },
    { kind: "crate", pos: { x: -20.1, y: 15.6 }, scale: 0.9 },
    { kind: "tank", pos: { x: -17.5, y: 14.5 } },
    { kind: "pipe", pos: { x: -20.5, y: 19.5 }, rot: 1.57 },
    { kind: "pipe", pos: { x: -19.1, y: 19.5 }, rot: 1.57 },
    { kind: "firebarrel", pos: { x: -27, y: 16 } },
    { kind: "floodlight", pos: { x: -17, y: 20.5 }, rot: 3.1416 },

    // --- Beyond the wire: scrub half-buried in the drifts ---
    { kind: "deadTree", pos: { x: -34, y: -18 } },
    { kind: "deadTree", pos: { x: -34, y: 8 } },
    { kind: "deadTree", pos: { x: -12, y: -26 } },
    { kind: "deadTree", pos: { x: 10, y: -26 } },
    { kind: "deadTree", pos: { x: 34, y: -6 } },
    { kind: "deadTree", pos: { x: 34, y: 14 } },
    { kind: "deadTree", pos: { x: 12, y: 26 } },
    { kind: "deadTree", pos: { x: -14, y: 26 } },
  ],

  decals: [
    // The hangar's outer faces front the whole ring, so they are the most-read
    // surfaces on the map.
    { kind: "stencil", pos: { x: -4, y: -7.75 }, rot: -1.5708, height: 1.75, text: "HANGAR 2" },
    { kind: "tag", pos: { x: 5, y: 7.75 }, rot: 1.5708, height: 1.6, text: "SEALED\nFROM INSIDE", color: 0xd8452c },
    { kind: "tally", pos: { x: -9.75, y: 3 }, rot: 3.1416, height: 1.5, scale: 1.1 },
    { kind: "biohazard", pos: { x: 9.75, y: -4 }, rot: 0, height: 1.7 },
    { kind: "arrow", pos: { x: 12, y: -11.55 }, rot: -1.5708, height: 1.55 },
    { kind: "tag", pos: { x: -12, y: 21.85 }, rot: -1.5708, height: 1.6, text: "KEEP\nMOVING", color: 0x6fd0ff },
    { kind: "stencil", pos: { x: -29.85, y: -14 }, rot: 0, height: 1.75, text: "STATION 9" },
    { kind: "tag", pos: { x: 8, y: -21.85 }, rot: 1.5708, height: 1.6, text: "NO RELIEF" },
    { kind: "stencil", pos: { x: 17, y: -11.55 }, rot: -1.5708, height: 1.75, text: "ANNEX" },
    { kind: "stencil", pos: { x: -21.5, y: 11.55 }, rot: 1.5708, height: 1.75, text: "STORES" },
    { kind: "blood", pos: { x: -2, y: -19 }, height: 0, scale: 1.2 },
    { kind: "blood", pos: { x: -27, y: 0 }, height: 0 },
    { kind: "blood", pos: { x: 27, y: 0 }, height: 0, scale: 1.1 },
    { kind: "blood", pos: { x: -2, y: 19 }, height: 0 },
    { kind: "scorch", pos: { x: -22, y: 5 }, height: 0, scale: 1.4 },
    { kind: "scorch", pos: { x: 21, y: -5 }, height: 0, scale: 1.3 },
  ],
};
