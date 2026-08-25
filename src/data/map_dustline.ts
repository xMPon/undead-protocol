// "Dustline" — a buried ammunition bunker under a desert airstrip.
//
// The shape is a TIGHT CHAIN: four small rooms in an L, joined by four-unit
// doorways. There is nowhere to kite and nothing is far away — every barrier is
// within a few strides of wherever you are standing, and a room you have not
// cleared is a room you are already fighting in. Where Coldstep is a bare lap in
// daylight, this is wall-to-wall clutter in near-darkness: the sun is turned
// almost off and the fire barrels do the work.
//
// The floor drops 1.2 units at every doorway, so each room is deeper than the
// last and the sump at the end sits nearly four units under the entrance.
//
// Coordinate note: +x is east, +y is south (screen-down in the 2D view).

import type { MapDef, WallRect } from "../sim/types";

const wall = (minX: number, minY: number, maxX: number, maxY: number): WallRect => ({ minX, minY, maxX, maxY });

// R0 x[-26,-10] · R1 x[-10,6] · R2 x[6,22], all y[-6,6] · R3 x[6,22] y[6,20].
export const DUSTLINE: MapDef = {
  id: "dustline",
  name: "Dustline",
  blurb: "A buried bunker of small rooms, each deeper and darker than the last. Nowhere to run to.",
  bounds: wall(-34, -14, 30, 28),
  playerSpawn: { x: -18, y: 2 },
  startRegions: [0],
  playBounds: [
    wall(-26, -6, 22, 6), // the three rooms in the line
    wall(6, 4.6, 22, 20), // the sump, overlapping the line at its doorway
  ],

  walls: [
    // --- Entry room (region 0) ---
    wall(-26.6, -6.6, -26, -2), wall(-26.6, 2, -26, 6.6), // west, gap y[-2,2]
    wall(-26.6, -6.6, -22, -6), wall(-18, -6.6, -9.7, -6), // north, gap x[-22,-18]
    wall(-26.6, 6, -9.7, 6.6), // south solid

    // --- Entry/corridor wall, door gap y[-2,2] ---
    wall(-10.3, -6.6, -9.7, -2), wall(-10.3, 2, -9.7, 6.6),

    // --- Corridor room (region 1): breached from both long walls ---
    wall(-10.3, -6.6, -4, -6), wall(0, -6.6, 6.3, -6), // north, gap x[-4,0]
    wall(-10.3, 6, -4, 6.6), wall(0, 6, 6.3, 6.6), // south, gap x[-4,0]

    // --- Corridor/pump wall, door gap y[-2,2] ---
    wall(5.7, -6.6, 6.3, -2), wall(5.7, 2, 6.3, 6.6),

    // --- Pump room (region 2) ---
    wall(5.7, -6.6, 12, -6), wall(16, -6.6, 22.3, -6), // north, gap x[12,16]
    wall(22, -6.6, 22.6, -2), wall(22, 2, 22.6, 6.6), // east, gap y[-2,2]

    // --- Pump/sump wall, door gap x[12,16] ---
    wall(5.7, 6, 12, 6.6), wall(16, 6, 22.6, 6.6),

    // --- Sump (region 3): the bottom of the bunker ---
    wall(5.7, 6, 6.3, 20.6), // west
    wall(22, 6, 22.6, 14), wall(22, 17, 22.6, 20.6), // east, gap y[14,17]
    wall(5.7, 20, 12, 20.6), wall(16, 20, 22.6, 20.6), // south, gap x[12,16]
  ],

  barriers: [
    // Two per room, and the rooms are small — they are never far off.
    { pos: { x: -26, y: 0 }, inward: { x: 1, y: 0 }, region: 0 },
    { pos: { x: -20, y: -6 }, inward: { x: 0, y: 1 }, region: 0 },
    { pos: { x: -2, y: -6 }, inward: { x: 0, y: 1 }, region: 1 },
    { pos: { x: -2, y: 6 }, inward: { x: 0, y: -1 }, region: 1 },
    { pos: { x: 14, y: -6 }, inward: { x: 0, y: 1 }, region: 2 },
    { pos: { x: 22, y: 0 }, inward: { x: -1, y: 0 }, region: 2 },
    { pos: { x: 22, y: 15.5 }, inward: { x: -1, y: 0 }, region: 3 },
    { pos: { x: 14, y: 20 }, inward: { x: 0, y: -1 }, region: 3 },
  ],

  wallBuys: [
    { pos: { x: -24, y: 4 }, weaponId: "pdw", region: 0 },
    { pos: { x: -8, y: -4 }, weaponId: "breacher", region: 1 },
    { pos: { x: 20, y: -4 }, weaponId: "kr12", region: 2 },
    { pos: { x: 8, y: 18 }, weaponId: "havoc", region: 3 },
  ],

  // One perk per room. The rooms are tiny, so every cabinet is also cover you
  // have to fight around — which is the point of putting them here.
  perkMachines: [
    { pos: { x: -16.5, y: -4.6 }, rot: 1.5708, perkId: "secondwind", region: 0 },
    { pos: { x: -4.5, y: 4.6 }, rot: -1.5708, perkId: "rapidrounds", region: 1 },
    { pos: { x: 7, y: 3 }, rot: -1.5708, perkId: "fasthands", region: 2 },
    { pos: { x: 17.5, y: 18 }, rot: 3.1416, perkId: "ironhide", region: 3 },
  ],

  cacheSites: [
    { pos: { x: -16, y: 3.5 }, region: 0 },
    { pos: { x: 13.5, y: 10.5 }, region: 3 },
  ],

  supplies: [
    { pos: { x: -22, y: 4 }, region: 0 },
    { pos: { x: 10, y: 4 }, region: 2 },
  ],

// Cheap doors, because the rooms are small and you will want out of each one.
  doors: [
    {
      id: "corridor-door",
      pos: { x: -10, y: 0 },
      name: "Open Corridor",
      cost: 700,
      blocks: wall(-10.3, -2, -9.7, 2),
      opensRegion: 1,
    },
    {
      id: "pump-door",
      pos: { x: 6, y: 0 },
      name: "Open Pump Room",
      cost: 1000,
      blocks: wall(5.7, -2, 6.3, 2),
      opensRegion: 2,
    },
    {
      id: "sump-door",
      pos: { x: 14, y: 6.3 },
      name: "Open Sump",
      cost: 1400,
      blocks: wall(12, 6, 16, 6.6),
      opensRegion: 3,
    },
  ],

  // Every room sits 1.2 lower than the one before it, with the step falling right
  // at the doorway — you feel yourself going underground.
  terrain: {
    baseHeight: 0,
    layers: [
      { kind: "dunes", amplitude: 0.4, wavelength: 14, seed: 909, angle: 1.1 },
      { kind: "noise", amplitude: 0.15, wavelength: 5, seed: 71 },
    ],
    flatZones: [
      { rect: wall(-26, -6, -10, 6), height: 0, blend: 0.8 },
      { rect: wall(-10, -6, 6, 6), height: -1.2, blend: 0.8 },
      { rect: wall(6, -6, 22, 6), height: -2.4, blend: 0.8 },
      { rect: wall(6, 6, 22, 20), height: -3.6, blend: 0.8 },
    ],
  },

  // The sun is all but switched off. Light comes from burning drums, and the fog
  // closes to eight units — you fight what is already in the room with you.
  theme: {
    ground: "sand",
    fog: 0x120e08,
    fogNear: 8,
    fogFar: 34,
    sky: 0x1a1409,
    hemiSky: 0x6a5a3a,
    hemiGround: 0x1c160e,
    dir: 0xffb060,
    dirIntensity: 0.35,
  },

  props: [
    // --- Entry room: small clutter, packed in ---
    { kind: "firebarrel", pos: { x: -24, y: -4 } },
    { kind: "firebarrel", pos: { x: -12, y: 4 } },
    { kind: "lamp", pos: { x: -18, y: 4.6 } },
    { kind: "crate", pos: { x: -14, y: -3 } },
    { kind: "crate", pos: { x: -13.1, y: -2.4 }, scale: 0.9 },
    { kind: "crate", pos: { x: -14.9, y: -1.9 } },
    { kind: "barrel", pos: { x: -21, y: 2 }, color: 0xc0a03a },
    { kind: "barrel", pos: { x: -20.1, y: 2.6 }, color: 0x8a7a2a },
    { kind: "sandbag", pos: { x: -24, y: -1.5 } },
    { kind: "sandbag", pos: { x: -22.9, y: -1.5 } },
    { kind: "pallet", pos: { x: -12, y: -4.5 }, rot: 0.3 },
    { kind: "rubble", pos: { x: -17, y: 0.5 } },
    { kind: "cone", pos: { x: -11, y: 2.6 } },
    { kind: "cone", pos: { x: -11, y: -2.6 } },
    { kind: "sign", pos: { x: -25.4, y: -4 } },

    // --- Corridor room: breached from both sides at once ---
    { kind: "firebarrel", pos: { x: -8, y: 4 } },
    { kind: "firebarrel", pos: { x: 4, y: -4 } },
    { kind: "crate", pos: { x: -6, y: -3 } },
    { kind: "crate", pos: { x: -5.1, y: -2.4 }, scale: 0.9 },
    { kind: "crate", pos: { x: -6.9, y: -1.8 } },
    { kind: "pipe", pos: { x: 2, y: 2 } },
    { kind: "barrel", pos: { x: 3, y: 4 }, color: 0xc23b3b },
    { kind: "barrel", pos: { x: 3.9, y: 4.6 }, color: 0x3a8a4a },
    { kind: "rubble", pos: { x: 0, y: -3 } },
    { kind: "dumpster", pos: { x: -5, y: -4.6 }, rot: 1.57 },
    { kind: "sandbag", pos: { x: 1, y: -4.5 } },
    { kind: "sandbag", pos: { x: 2.1, y: -4.5 } },
    { kind: "pallet", pos: { x: -6, y: 3.5 } },

    // --- Pump room ---
    { kind: "firebarrel", pos: { x: 8, y: 4 } },
    { kind: "firebarrel", pos: { x: 18, y: 4 } },
    { kind: "lamp", pos: { x: 12, y: -4.6 } },
    { kind: "crate", pos: { x: 10, y: -3 } },
    { kind: "crate", pos: { x: 10.9, y: -2.4 }, scale: 0.9 },
    { kind: "pipe", pos: { x: 12, y: 2 } },
    { kind: "barrel", pos: { x: 16, y: 2 }, color: 0x3a6ac8 },
    { kind: "barrel", pos: { x: 16.9, y: 2.6 }, color: 0x8a2a2a },
    { kind: "rubble", pos: { x: 20, y: 4 } },
    { kind: "pallet", pos: { x: 9, y: -4.5 }, rot: 0.2 },
    { kind: "generator", pos: { x: 18, y: -3.5 } },
    { kind: "cone", pos: { x: 12.6, y: 5 } },
    { kind: "cone", pos: { x: 15.4, y: 5 } },

    // --- Sump: the deepest, darkest room ---
    { kind: "firebarrel", pos: { x: 9, y: 9 } },
    { kind: "firebarrel", pos: { x: 19, y: 17 } },
    { kind: "lamp", pos: { x: 12, y: 18.6 } },
    { kind: "tank", pos: { x: 20, y: 9 } },
    { kind: "tank", pos: { x: 20, y: 11.6 } },
    { kind: "pipe", pos: { x: 10, y: 14 }, rot: 1.57 },
    { kind: "pipe", pos: { x: 11.4, y: 14 }, rot: 1.57 },
    { kind: "crate", pos: { x: 16, y: 10 } },
    { kind: "crate", pos: { x: 16.9, y: 10.6 }, scale: 0.9 },
    { kind: "rubble", pos: { x: 10, y: 17.5 } },
    { kind: "generator", pos: { x: 16, y: 13 } },
    { kind: "puddle", pos: { x: 13, y: 12 }, scale: 1.2 },
    { kind: "sign", pos: { x: 6.9, y: 12 } },

    // --- Above ground: nothing but scrub and wrecks over the roof line ---
    { kind: "deadTree", pos: { x: -30, y: -10 } },
    { kind: "deadTree", pos: { x: -14, y: -11 } },
    { kind: "deadTree", pos: { x: 4, y: -11 } },
    { kind: "deadTree", pos: { x: 26, y: -9 } },
    { kind: "deadTree", pos: { x: 26, y: 12 } },
    { kind: "deadTree", pos: { x: 10, y: 25 } },
    { kind: "wreck", pos: { x: -30, y: 3 }, rot: 0.9 },
    { kind: "wreck", pos: { x: 26, y: 22 }, rot: 2.3 },
    { kind: "rock", pos: { x: -20, y: -10 }, scale: 1.3 },
    { kind: "rock", pos: { x: 18, y: 24 }, scale: 1.2 },
  ],

  decals: [
    { kind: "stencil", pos: { x: -20, y: 5.85 }, rot: -1.5708, height: 1.6, text: "MAG 1" },
    { kind: "tally", pos: { x: -25.85, y: -4 }, rot: 0, height: 1.4, scale: 1.0 },
    { kind: "tag", pos: { x: -14, y: -5.85 }, rot: 1.5708, height: 1.5, text: "AIR IS BAD", color: 0xf0c033 },
    { kind: "arrow", pos: { x: -9.55, y: 4 }, rot: 3.1416, height: 1.45 },
    { kind: "stencil", pos: { x: 2, y: 5.85 }, rot: -1.5708, height: 1.6, text: "PUMP ROOM" },
    { kind: "tag", pos: { x: 9, y: -5.85 }, rot: 1.5708, height: 1.5, text: "IT CAME\nUP THE PIPE", color: 0xd8452c },
    { kind: "biohazard", pos: { x: 21.85, y: 4 }, rot: 3.1416, height: 1.6 },
    { kind: "stencil", pos: { x: 18, y: 6.75 }, rot: 1.5708, height: 1.6, text: "SUMP" },
    { kind: "tag", pos: { x: 10, y: 19.85 }, rot: -1.5708, height: 1.5, text: "NO DEEPER" },
    { kind: "tally", pos: { x: 6.75, y: 16 }, rot: 0, height: 1.4, scale: 1.1 },
    { kind: "blood", pos: { x: -24, y: 0 }, height: 0, scale: 1.1 },
    { kind: "blood", pos: { x: -2, y: -4 }, height: 0 },
    { kind: "blood", pos: { x: 20, y: 0 }, height: 0 },
    { kind: "blood", pos: { x: 14, y: 18 }, height: 0, scale: 1.2 },
    { kind: "scorch", pos: { x: -12, y: -4 }, height: 0, scale: 1.1 },
    { kind: "scorch", pos: { x: 13, y: 13 }, height: 0, scale: 1.3 },
  ],
};
