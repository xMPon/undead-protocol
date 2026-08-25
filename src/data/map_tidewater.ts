// "Tidewater" — a container jetty standing out over a dead harbour at night.
//
// The shape is an OPEN PIER, and the thing that makes it different is what it
// does not have: walls. There is no perimeter. The deck simply ends, four and a
// half units above the water, and the drop is the boundary — the player cage is
// the decking itself. That means the whole map is edges, and the barriers sit
// along BOTH long sides of the pier, so they come up out of the water on your
// flanks rather than through a door at the end of a yard.
//
// The only masonry on the map is the security gate across the pier and the shell
// of the landward warehouse, which is why both paid rooms still gate properly:
// their barriers face the water and the shore, never the deck you are stood on.
//
// Coordinate note: +x is east, +y is south (screen-down in the 2D view).

import type { MapDef, WallRect } from "../sim/types";

const wall = (minX: number, minY: number, maxX: number, maxY: number): WallRect => ({ minX, minY, maxX, maxY });

// Pier x[-24,20] y[-7,7] · head x[20,40] y[-16,16] · warehouse x[-38,-24] y[-9,9].
export const TIDEWATER: MapDef = {
  id: "tidewater",
  name: "Tidewater",
  blurb: "A jetty over black water. No walls, no perimeter — just deck, and they climb up on both sides of you.",
  bounds: wall(-44, -24, 46, 24),
  playerSpawn: { x: 0, y: 0 },
  startRegions: [0],
  // The cage is the decking. Every rect stops exactly at a deck edge, so nothing
  // lets the player out over the water; the overlaps are only at the two doorways.
  playBounds: [
    wall(-25.4, -7, 21.4, 7), // the pier, stretched into both doorways
    wall(20, -16, 40, 16), // the pier head
    wall(-38, -9, -23.7, 9), // the warehouse
  ],

  walls: [
    // --- The security gate across the pier: door gap y[-3,3] ---
    wall(19.7, -7.6, 20.3, -3), wall(19.7, 3, 20.3, 7.6),

    // --- The warehouse shell (region 2), the only building on the map ---
    wall(-24.3, -9.6, -23.7, -2), wall(-24.3, 2, -23.7, 9.6), // east, door gap y[-2,2]
    wall(-38.6, -9.6, -30, -9), wall(-26, -9.6, -23.7, -9), // north, gap x[-30,-26]
    wall(-38.6, 9, -30, 9.6), wall(-26, 9, -23.7, 9.6), // south, gap x[-30,-26]
    wall(-38.6, -9.6, -38, 9.6), // west solid
  ],

  barriers: [
    // Both long edges of the pier. There is no front here — there are two.
    { pos: { x: -16, y: -7 }, inward: { x: 0, y: 1 }, region: 0 },
    { pos: { x: -16, y: 7 }, inward: { x: 0, y: -1 }, region: 0 },
    { pos: { x: 2, y: -7 }, inward: { x: 0, y: 1 }, region: 0 },
    { pos: { x: 2, y: 7 }, inward: { x: 0, y: -1 }, region: 0 },
    // The head is surrounded on three sides by open water.
    { pos: { x: 30, y: -16 }, inward: { x: 0, y: 1 }, region: 1 },
    { pos: { x: 30, y: 16 }, inward: { x: 0, y: -1 }, region: 1 },
    { pos: { x: 40, y: 0 }, inward: { x: -1, y: 0 }, region: 1 },
    // The warehouse is breached from the shore.
    { pos: { x: -28, y: -9 }, inward: { x: 0, y: 1 }, region: 2 },
    { pos: { x: -28, y: 9 }, inward: { x: 0, y: -1 }, region: 2 },
  ],

  wallBuys: [
    { pos: { x: -22, y: -5 }, weaponId: "pdw", region: 0 },
    { pos: { x: 38, y: -12 }, weaponId: "kr12", region: 1 },
    { pos: { x: 38, y: 12 }, weaponId: "havoc", region: 1 },
    { pos: { x: -36, y: 0 }, weaponId: "breacher", region: 2 },
  ],

  // Nothing here has a back wall, so every machine is exposed on both sides —
  // buying a perk on the pier means turning your back on one of the two edges.
  perkMachines: [
    { pos: { x: -9, y: 0 }, rot: 0, perkId: "secondwind", region: 0 },
    { pos: { x: 14, y: 2 }, rot: 3.1416, perkId: "rapidrounds", region: 0 },
    { pos: { x: 33, y: 7.5 }, rot: 3.1416, perkId: "ironhide", region: 1 },
    { pos: { x: -29, y: 6.5 }, rot: 1.5708, perkId: "fasthands", region: 2 },
  ],

  cacheSites: [
    { pos: { x: -2, y: 0 }, region: 0 },
    { pos: { x: 28, y: 10 }, region: 1 },
  ],

  supplies: [
    { pos: { x: 10, y: 2 }, region: 0 },
    { pos: { x: 24, y: -4 }, region: 1 },
  ],

  doors: [
    {
      id: "gate-door",
      pos: { x: 20, y: 0 },
      name: "Open Gate",
      cost: 1000,
      blocks: wall(19.7, -3, 20.3, 3),
      opensRegion: 1,
    },
    {
      id: "warehouse-door",
      pos: { x: -24, y: 0 },
      name: "Open Warehouse",
      cost: 1200,
      blocks: wall(-24.3, -2, -23.7, 2),
      opensRegion: 2,
    },
  ],

  // The terrain IS the level design here: one enormous flat at water height, with
  // the decks laid on top of it at a hard zero-blend edge. That step is what makes
  // the pier a pier — and what makes walking off it impossible.
  terrain: {
    baseHeight: 0,
    layers: [{ kind: "hills", amplitude: 0.15, wavelength: 40, seed: 5 }],
    flatZones: [
      { rect: wall(-44, -24, 46, 24), height: -3.6, blend: 0 }, // the harbour
      { rect: wall(-38, -9, 20, 9), height: 0.8, blend: 0 }, // warehouse floor + root
      { rect: wall(-24, -7, 21, 7), height: 0.8, blend: 0 }, // the pier proper
      { rect: wall(20, -16, 40, 16), height: 0.8, blend: 0 }, // the head
      { rect: wall(28, -9, 38, -1), height: 2.2, blend: 1.2 }, // loading platform
    ],
  },

  theme: {
    ground: "dock",
    fog: 0x0a1018,
    fogNear: 18,
    fogFar: 95,
    sky: 0x0d1522,
    hemiSky: 0x6f89a8,
    hemiGround: 0x101820,
    dir: 0x9fb8d8,
    dirIntensity: 0.7,
  },

  props: [
    // --- The pier: everything is near an edge, because everything is ---
    { kind: "lamp", pos: { x: -18, y: -5.5 } },
    { kind: "lamp", pos: { x: -18, y: 5.5 } },
    { kind: "lamp", pos: { x: -4, y: -5.5 } },
    { kind: "lamp", pos: { x: -4, y: 5.5 } },
    { kind: "lamp", pos: { x: 12, y: -5.5 } },
    { kind: "lamp", pos: { x: 12, y: 5.5 } },
    { kind: "container", pos: { x: -12, y: -4 }, color: 0x2a6a8a },
    { kind: "container", pos: { x: -12, y: 4 }, color: 0x8a4a2a },
    { kind: "container", pos: { x: 6, y: -4 }, color: 0x2f7a3a },
    { kind: "container", pos: { x: 6, y: 4 }, color: 0xb0902a },
    { kind: "barrel", pos: { x: -8, y: -6.2 }, color: 0x3a3f42 }, // bollards
    { kind: "barrel", pos: { x: -2, y: -6.2 }, color: 0x3a3f42 },
    { kind: "barrel", pos: { x: -8, y: 6.2 }, color: 0x3a3f42 },
    { kind: "barrel", pos: { x: -2, y: 6.2 }, color: 0x3a3f42 },
    { kind: "barrel", pos: { x: 16, y: -6.2 }, color: 0x3a3f42 },
    { kind: "barrel", pos: { x: 16, y: 6.2 }, color: 0x3a3f42 },
    { kind: "firebarrel", pos: { x: -20, y: 2 } },
    { kind: "firebarrel", pos: { x: 10, y: -2 } },
    { kind: "crate", pos: { x: 0, y: 3 } },
    { kind: "crate", pos: { x: 0.9, y: 3.6 }, scale: 0.9 },
    { kind: "rubble", pos: { x: -6, y: 1 } },
    { kind: "cone", pos: { x: 18.6, y: 4 } },
    { kind: "cone", pos: { x: 18.6, y: -4 } },
    { kind: "sign", pos: { x: 17, y: -6.4 } },

    // --- The head: cranes, and the only room to manoeuvre on the map ---
    { kind: "lamp", pos: { x: 23, y: -14 } },
    { kind: "lamp", pos: { x: 23, y: 14 } },
    { kind: "lamp", pos: { x: 38, y: -3 } },
    { kind: "tower", pos: { x: 25, y: 8 }, rot: -0.8 }, // gantry leg
    { kind: "tower", pos: { x: 35, y: 12 }, rot: 0.6 },
    { kind: "antenna", pos: { x: 22, y: -6 } },
    { kind: "container", pos: { x: 26, y: -13 }, color: 0x3a6a8a },
    { kind: "container", pos: { x: 34.5, y: -13 }, color: 0x6a4a8a },
    { kind: "container", pos: { x: 30, y: 4 }, rot: 1.57, color: 0x8a4a2a },
    { kind: "tank", pos: { x: 24, y: -11 } },
    { kind: "tank", pos: { x: 24, y: -8.4 } },
    { kind: "blockhouse", pos: { x: 36, y: 3 }, rot: 3.1416 }, // dock office, door west
    { kind: "wreck", pos: { x: 27, y: 14 }, rot: 1.4 },
    { kind: "firebarrel", pos: { x: 33, y: -3 } },
    { kind: "floodlight", pos: { x: 28, y: -6 }, rot: 1.7 },
    { kind: "concreteBarrier", pos: { x: 22, y: 2 }, rot: 1.57 },
    { kind: "concreteBarrier", pos: { x: 22, y: 4.2 }, rot: 1.57 },
    { kind: "rubble", pos: { x: 38, y: 8 } },
    { kind: "pallet", pos: { x: 31, y: 9 }, rot: 0.3 },

    // --- The warehouse ---
    { kind: "lamp", pos: { x: -35, y: -7 } },
    { kind: "lamp", pos: { x: -27, y: 7 } },
    { kind: "container", pos: { x: -32, y: -6 }, color: 0x2f7a3a },
    { kind: "container", pos: { x: -32, y: 5 }, color: 0xb0902a },
    { kind: "crate", pos: { x: -28, y: -3 } },
    { kind: "crate", pos: { x: -27.1, y: -2.4 }, scale: 0.9 },
    { kind: "pipe", pos: { x: -33, y: 1 } },
    { kind: "pipe", pos: { x: -33, y: 2.4 } },
    { kind: "generator", pos: { x: -27, y: 3 } },
    { kind: "firebarrel", pos: { x: -30, y: -1 } },
    { kind: "dumpster", pos: { x: -36, y: 6 }, rot: 1.57 },

    // --- In the water: what did not make it off the berth ---
    { kind: "wreck", pos: { x: -14, y: -11 }, rot: 0.5 },
    { kind: "wreck", pos: { x: 8, y: 12 }, rot: 2.6 },
    { kind: "rock", pos: { x: -30, y: -14 }, scale: 1.4 },
    { kind: "rock", pos: { x: 24, y: 20 }, scale: 1.3 },
    { kind: "rock", pos: { x: 43, y: -8 }, scale: 1.2 },
    { kind: "deadTree", pos: { x: -41, y: -14 } },
    { kind: "deadTree", pos: { x: -41, y: 14 } },
  ],

  decals: [
    // Almost every wall on this map is warehouse wall, so that is where the paint is.
    { kind: "stencil", pos: { x: -30, y: -8.85 }, rot: 1.5708, height: 1.75, text: "BERTH 4" },
    { kind: "tag", pos: { x: -34, y: 8.85 }, rot: -1.5708, height: 1.6, text: "TIDE TOOK\nTHE REST", color: 0x6fd0ff },
    { kind: "tally", pos: { x: -37.85, y: -4 }, rot: 0, height: 1.5, scale: 1.1 },
    { kind: "biohazard", pos: { x: -23.55, y: -6 }, rot: 3.1416, height: 1.7 },
    { kind: "stencil", pos: { x: -23.55, y: 6 }, rot: 3.1416, height: 1.75, text: "WAREHOUSE" },
    { kind: "stencil", pos: { x: 19.55, y: -5 }, rot: 3.1416, height: 1.75, text: "GATE 1" },
    { kind: "tag", pos: { x: 19.55, y: 5 }, rot: 3.1416, height: 1.6, text: "SHIP LEFT\nWITHOUT US", color: 0xd8452c },
    { kind: "arrow", pos: { x: 20.45, y: 5 }, rot: 0, height: 1.55 },
    // Deck stains: the pier has no walls to write on, so the story is underfoot.
    { kind: "blood", pos: { x: -16, y: -5 }, height: 0, scale: 1.2 },
    { kind: "blood", pos: { x: -16, y: 5 }, height: 0 },
    { kind: "blood", pos: { x: 2, y: -5 }, height: 0, scale: 1.1 },
    { kind: "blood", pos: { x: 2, y: 5 }, height: 0 },
    { kind: "blood", pos: { x: 30, y: -13 }, height: 0 },
    { kind: "blood", pos: { x: -28, y: -7 }, height: 0 },
    { kind: "scorch", pos: { x: 27, y: 15 }, height: 0, scale: 1.3 },
    { kind: "scorch", pos: { x: -6, y: 0 }, height: 0, scale: 1.2 },
  ],
};
