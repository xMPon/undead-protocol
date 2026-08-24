// "Deepcut" — an open-cast quarry worked until the day it wasn't.
//
// The shape is a HUB AND SPOKES, and you start at the bottom of it. The pit is a
// bowl four units below everything, you spawn dead centre, and three galleries
// radiate off it — north, east and south — each behind its own door and each cut
// at a different height. There is no "deeper into the map" here: there are three
// directions and you have to choose, and whichever you buy is the side you have
// left your back to.
//
// The east gallery sits six units above the pit floor and the south one three,
// so the same fight reads completely differently depending on which way you ran.
//
// Coordinate note: +x is east, +y is south (screen-down in the 2D view).

import type { MapDef, WallRect } from "../sim/types";

const wall = (minX: number, minY: number, maxX: number, maxY: number): WallRect => ({ minX, minY, maxX, maxY });

// Pit x[-12,12] y[-12,12] (−4) · north x[-6,6] y[-30,-12] (0)
// · east x[12,32] y[-6,6] (+2) · south x[-6,6] y[12,28] (−1).
export const DEEPCUT: MapDef = {
  id: "deepcut",
  name: "Deepcut",
  blurb: "You start at the bottom of the bowl. Three galleries, three heights, three directions — pick one.",
  bounds: wall(-40, -38, 42, 36),
  playerSpawn: { x: 0, y: 0 },
  startRegions: [0],
  playBounds: [
    wall(-12, -12, 12, 12), // the pit
    wall(-6, -30, 6, -10.6), // north gallery, overlapping the pit at its doorway
    wall(10.6, -6, 32, 6), // east gallery
    wall(-6, 10.6, 6, 28), // south gallery
  ],

  walls: [
    // --- The pit (region 0). Its west side is the only one that faces open
    //     ground, so both of its own barriers live there. ---
    wall(-12.6, -12.6, -10, -12), wall(-7, -12.6, -2, -12), wall(2, -12.6, 12.6, -12),
    wall(-12.6, 12, -2, 12.6), wall(2, 12, 7, 12.6), wall(10, 12, 12.6, 12.6),
    wall(12, -12.6, 12.6, -2), wall(12, 2, 12.6, 12.6),
    wall(-12.6, -12.6, -12, -4), wall(-12.6, -1, -12, 4), wall(-12.6, 7, -12, 12.6),

    // --- North gallery (region 1): the old haul road out of the pit ---
    wall(-6.6, -30.6, -6, -12), // west
    wall(6, -30.6, 6.6, -24), wall(6, -21, 6.6, -12), // east, gap y[-24,-21]
    wall(-6.6, -30.6, -3, -30), wall(1, -30.6, 6.6, -30), // north, gap x[-3,1]

    // --- East gallery (region 2): the screen house, highest ground on the map ---
    wall(11.4, -6.6, 20, -6), wall(23, -6.6, 32.6, -6), // north, gap x[20,23]
    wall(11.4, 6, 32.6, 6.6), // south solid
    wall(32, -6.6, 32.6, -2), wall(32, 2, 32.6, 6.6), // east, gap y[-2,2]

    // --- South gallery (region 3): the settling sump ---
    wall(-6.6, 12, -6, 18), wall(-6.6, 21, -6, 28.6), // west, gap y[18,21]
    wall(6, 12, 6.6, 28.6), // east
    wall(-6.6, 28, -3, 28.6), wall(1, 28, 6.6, 28.6), // south, gap x[-3,1]
  ],

  barriers: [
    // The bowl is breached from the west face and both open corners.
    { pos: { x: -8.5, y: -12 }, inward: { x: 0, y: 1 }, region: 0 },
    { pos: { x: 8.5, y: 12 }, inward: { x: 0, y: -1 }, region: 0 },
    { pos: { x: -12, y: -2.5 }, inward: { x: 1, y: 0 }, region: 0 },
    { pos: { x: -12, y: 5.5 }, inward: { x: 1, y: 0 }, region: 0 },
    { pos: { x: -1, y: -30 }, inward: { x: 0, y: 1 }, region: 1 },
    { pos: { x: 6, y: -22.5 }, inward: { x: -1, y: 0 }, region: 1 },
    { pos: { x: 21.5, y: -6 }, inward: { x: 0, y: 1 }, region: 2 },
    { pos: { x: 32, y: 0 }, inward: { x: -1, y: 0 }, region: 2 },
    { pos: { x: -1, y: 28 }, inward: { x: 0, y: -1 }, region: 3 },
    { pos: { x: -6, y: 19.5 }, inward: { x: 1, y: 0 }, region: 3 },
  ],

  wallBuys: [
    { pos: { x: -10, y: 10 }, weaponId: "pdw", region: 0 },
    { pos: { x: 4, y: -28 }, weaponId: "breacher", region: 1 },
    { pos: { x: 30, y: 4 }, weaponId: "kr12", region: 2 },
    { pos: { x: 4, y: 26 }, weaponId: "lancer", region: 3 },
  ],

  // Three doors off one room. Nothing is "next"; everything is a choice.
  doors: [
    {
      id: "north-door",
      pos: { x: 0, y: -12.3 },
      name: "Open Haul Road",
      cost: 900,
      blocks: wall(-2, -12.6, 2, -12),
      opensRegion: 1,
    },
    {
      id: "east-door",
      pos: { x: 12.3, y: 0 },
      name: "Open Screen House",
      cost: 1100,
      blocks: wall(12, -2, 12.6, 2),
      opensRegion: 2,
    },
    {
      id: "south-door",
      pos: { x: 0, y: 12.3 },
      name: "Open Settling Sump",
      cost: 1300,
      blocks: wall(-2, 12, 2, 12.6),
      opensRegion: 3,
    },
  ],

  // Stepped benches cut into the rock, and four working levels: the bowl at −4,
  // the haul road at grade, the screen house up at +2, the sump at −1.
  terrain: {
    baseHeight: 0,
    layers: [
      { kind: "terraces", amplitude: 2.2, wavelength: 24, seed: 4242, steps: 4 },
      { kind: "noise", amplitude: 0.2, wavelength: 6, seed: 8 },
    ],
    flatZones: [
      { rect: wall(-12, -12, 12, 12), height: -4.0, blend: 2.0 }, // the bowl
      { rect: wall(-6, -30, 6, -12), height: 0.0, blend: 2.0 }, // haul road
      { rect: wall(12, -6, 32, 6), height: 2.0, blend: 2.0 }, // screen house
      { rect: wall(-6, 12, 6, 28), height: -1.0, blend: 2.0 }, // settling sump
    ],
  },

  // Warm, low, dusty light — the opposite end of the day from Coldstep's whiteout.
  theme: {
    ground: "quarry",
    fog: 0x3a2c1e,
    fogNear: 30,
    fogFar: 105,
    sky: 0x4a3826,
    hemiSky: 0xd8b88a,
    hemiGround: 0x4a3a28,
    dir: 0xffb367,
    dirIntensity: 1.9,
  },

  props: [
    // --- The bowl: broken rock, and cover you have to commit to ---
    { kind: "lamp", pos: { x: -10, y: -10 } },
    { kind: "lamp", pos: { x: 10, y: -10 } },
    { kind: "lamp", pos: { x: 10, y: 10 } },
    { kind: "rock", pos: { x: -5, y: -6 }, scale: 1.5 },
    { kind: "rock", pos: { x: -3, y: -4.6 }, scale: 1.1 },
    { kind: "rock", pos: { x: 6, y: 6 }, scale: 1.4 },
    { kind: "rock", pos: { x: -7, y: 5 }, scale: 1.2 },
    { kind: "rock", pos: { x: 4, y: -9 }, scale: 1.0 },
    { kind: "rubble", pos: { x: 0, y: 6 } },
    { kind: "rubble", pos: { x: -9, y: 0 } },
    { kind: "wreck", pos: { x: 7, y: -3 }, rot: 2.4 }, // a dumper that never got out
    { kind: "firebarrel", pos: { x: -4, y: 9 } },
    { kind: "firebarrel", pos: { x: 9, y: 2 } },
    { kind: "pipe", pos: { x: 3, y: 4 }, rot: 0.4 },
    { kind: "cone", pos: { x: 0, y: -10.6 } },
    { kind: "cone", pos: { x: 10.8, y: 0 } },
    { kind: "cone", pos: { x: 0, y: 10.6 } },
    { kind: "sign", pos: { x: -11.4, y: -8 } },

    // --- North gallery: the haul road, long and straight ---
    { kind: "lamp", pos: { x: -4.6, y: -15 } },
    { kind: "lamp", pos: { x: 4.6, y: -26 } },
    { kind: "lamp", pos: { x: -5.4, y: -28 } },
    { kind: "tower", pos: { x: 2.5, y: -17 }, rot: 1.6 },
    { kind: "container", pos: { x: -3, y: -20 }, rot: 1.57, color: 0xb0902a },
    { kind: "rock", pos: { x: 3, y: -25 }, scale: 1.3 },
    { kind: "pipe", pos: { x: -4, y: -26 }, rot: 1.57 },
    { kind: "pipe", pos: { x: -2.6, y: -26 }, rot: 1.57 },
    { kind: "firebarrel", pos: { x: -4, y: -19 } },
    { kind: "floodlight", pos: { x: 4, y: -13.5 }, rot: -1.9 },
    { kind: "wreck", pos: { x: -3.5, y: -13.5 }, rot: 0.3 },

    // --- East gallery: the screen house, plant and tanks up on the high bench ---
    { kind: "lamp", pos: { x: 15, y: -4.6 } },
    { kind: "lamp", pos: { x: 29, y: -4.6 } },
    { kind: "lamp", pos: { x: 22, y: 4.6 } },
    { kind: "blockhouse", pos: { x: 26, y: -3 }, rot: 3.1416 }, // control room, door west
    { kind: "tank", pos: { x: 16, y: 3 } },
    { kind: "tank", pos: { x: 16, y: 0.4 } },
    { kind: "generator", pos: { x: 20, y: 4 } },
    { kind: "antenna", pos: { x: 31, y: -4 } },
    { kind: "pipe", pos: { x: 25, y: 4.5 } },
    { kind: "pipe", pos: { x: 25, y: 3.1 } },
    { kind: "crate", pos: { x: 14, y: -3 } },
    { kind: "crate", pos: { x: 14.9, y: -2.4 }, scale: 0.9 },
    { kind: "firebarrel", pos: { x: 19, y: -4 } },
    { kind: "rubble", pos: { x: 14, y: 4 } },

    // --- South gallery: the sump, wet and low ---
    { kind: "lamp", pos: { x: -4.6, y: 15 } },
    { kind: "lamp", pos: { x: 4.6, y: 24 } },
    { kind: "tank", pos: { x: 4, y: 15 } },
    { kind: "tank", pos: { x: 1.4, y: 15 } },
    { kind: "pipe", pos: { x: -4.5, y: 23 }, rot: 1.57 },
    { kind: "pipe", pos: { x: -3.1, y: 23 }, rot: 1.57 },
    { kind: "puddle", pos: { x: 2, y: 21 }, scale: 1.4 },
    { kind: "puddle", pos: { x: -4, y: 26 } },
    { kind: "rubble", pos: { x: 4, y: 19 } },
    { kind: "rock", pos: { x: -4, y: 17.5 }, scale: 1.2 },
    { kind: "firebarrel", pos: { x: 3.5, y: 27 } },
    { kind: "generator", pos: { x: -3.5, y: 13.5 } },
    { kind: "floodlight", pos: { x: 5, y: 17 }, rot: 2.2 },

    // --- Up on the benches, out of reach ---
    { kind: "deadTree", pos: { x: -20, y: -20 } },
    { kind: "deadTree", pos: { x: -22, y: 6 } },
    { kind: "deadTree", pos: { x: -18, y: 24 } },
    { kind: "deadTree", pos: { x: 16, y: -24 } },
    { kind: "deadTree", pos: { x: 20, y: 20 } },
    { kind: "deadTree", pos: { x: 36, y: -14 } },
    { kind: "rock", pos: { x: -17, y: -8 }, scale: 1.6 },
    { kind: "rock", pos: { x: -16, y: 14 }, scale: 1.4 },
    { kind: "rock", pos: { x: 18, y: 12 }, scale: 1.5 },
    { kind: "rock", pos: { x: 12, y: -20 }, scale: 1.3 },
    { kind: "wreck", pos: { x: -18, y: 0 }, rot: 1.1 },
  ],

  decals: [
    { kind: "stencil", pos: { x: -6, y: -11.75 }, rot: 1.5708, height: 1.75, text: "HAUL ROAD" },
    { kind: "stencil", pos: { x: 11.75, y: -5 }, rot: 3.1416, height: 1.75, text: "SCREEN HOUSE" },
    { kind: "stencil", pos: { x: -6, y: 11.75 }, rot: -1.5708, height: 1.75, text: "SUMP" },
    { kind: "tag", pos: { x: 6, y: -11.75 }, rot: 1.5708, height: 1.6, text: "BOTTOM\nOF THE HOLE", color: 0xf0c033 },
    { kind: "tally", pos: { x: -11.75, y: 9 }, rot: 0, height: 1.5, scale: 1.1 },
    { kind: "biohazard", pos: { x: -11.75, y: -8 }, rot: 0, height: 1.7 },
    { kind: "arrow", pos: { x: 6, y: 8 }, rot: 1.5708, height: 1.55 },
    { kind: "tag", pos: { x: 2, y: -29.85 }, rot: 1.5708, height: 1.6, text: "DIG DEEPER\nTHEY SAID" },
    { kind: "tag", pos: { x: 26, y: -5.85 }, rot: 1.5708, height: 1.6, text: "IT WAS\nIN THE ROCK", color: 0xd8452c },
    { kind: "stencil", pos: { x: -3, y: 27.85 }, rot: -1.5708, height: 1.75, text: "NO ENTRY" },
    { kind: "blood", pos: { x: -8.5, y: -9 }, height: 0, scale: 1.2 },
    { kind: "blood", pos: { x: -9, y: 5.5 }, height: 0 },
    { kind: "blood", pos: { x: -1, y: -27 }, height: 0 },
    { kind: "blood", pos: { x: 29, y: 0 }, height: 0, scale: 1.1 },
    { kind: "scorch", pos: { x: 7, y: -2 }, height: 0, scale: 1.4 },
    { kind: "scorch", pos: { x: -18, y: 1 }, height: 0, scale: 1.3 },
  ],
};
