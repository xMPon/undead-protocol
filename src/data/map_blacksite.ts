// "Blacksite" — the Phase 1 map: the outdoor motor-pool / loading compound of a
// black-ops research facility, at dusk. A large spawn yard (region 0) and a
// vault yard (region 1) unlocked by a 750-point door. Walls are axis-aligned
// rectangles with gaps (barriers or the door). The ground has a deep sunken
// loading bay, a maintenance pit, and raised docks; lighting comes from a warm
// low sun plus lamp posts, vehicle headlights, floodlights, a guard-tower
// searchlight, and burning drums.
//
// The compound is dressed as a working site: a fuel point and generator
// compound behind chain-link, pipe and pallet stock in the loading bay, a
// jersey-barrier checkpoint at the vault door, a comms mast and guard tower
// over the vault yard, and wrecks/rubble/puddles where the fighting has
// already been. Kinds marked `decor` in PROP_SPECS (cones, signs, puddles) are
// pass-through, so the dressing never changes how the yard plays.
//
// Coordinate note: +x is east, +y is south (screen-down in the 2D view).

import type { MapDef, WallRect } from "../sim/types";

const wall = (minX: number, minY: number, maxX: number, maxY: number): WallRect => ({ minX, minY, maxX, maxY });

// Spawn yard interior: x[-26,26] y[-18,18].  Vault yard interior: x[26,66] y[-18,18].
export const BLACKSITE: MapDef = {
  name: "Blacksite",
  bounds: wall(-30, -22, 71, 22),
  playerSpawn: { x: 0, y: 0 },
  startRegions: [0],
  playBounds: wall(-25.6, -17.6, 65.6, 17.6),

  walls: [
    // --- Spawn yard (region 0) perimeter, gaps for N/S/W barriers ---
    wall(-26.6, -18.6, -2, -18), wall(2, -18.6, 26.6, -18), // north, gap x[-2,2]
    wall(-26.6, 18, -2, 18.6), wall(2, 18, 26.6, 18.6), // south, gap x[-2,2]
    wall(-26.6, -18.6, -26, -2), wall(-26.6, 2, -26, 18.6), // west, gap y[-2,2]

    // --- Shared wall (x=26), gap = door y[-3,3] ---
    wall(25.7, -18.6, 26.3, -3), wall(25.7, 3, 26.3, 18.6),

    // --- Vault yard (region 1) perimeter ---
    wall(25.7, -18.6, 44, -18), wall(48, -18.6, 66.6, -18), // north, gap for B-N barrier x[44,48]
    wall(25.7, 18, 66.6, 18.6), // south solid
    wall(66, -18.6, 66.6, -2), wall(66, 2, 66.6, 18.6), // east, gap for B-E barrier y[-2,2]

    // Freestanding blast-wall cover (full height) — breaks up sightlines.
    wall(-6, -5, -5, 3), // spawn: vertical slab west of the bay
    wall(-16, -2, -8, -1), // spawn: horizontal slab
    wall(11, 12, 19, 13), // spawn: slab south of the bay
    wall(30, -6, 38, -5), // vault: horizontal slab
    wall(56, 3, 57, 11), // vault: vertical slab
  ],

  barriers: [
    { pos: { x: 0, y: -18 }, inward: { x: 0, y: 1 }, region: 0 }, // north
    { pos: { x: 0, y: 18 }, inward: { x: 0, y: -1 }, region: 0 }, // south
    { pos: { x: -26, y: 0 }, inward: { x: 1, y: 0 }, region: 0 }, // west
    { pos: { x: 46, y: -18 }, inward: { x: 0, y: 1 }, region: 1 }, // vault north
    { pos: { x: 66, y: 0 }, inward: { x: -1, y: 0 }, region: 1 }, // vault east
  ],

  wallBuys: [
    { pos: { x: -24, y: -15 }, weaponId: "pdw", region: 0 },
    { pos: { x: 64, y: -15 }, weaponId: "kr12", region: 1 },
    { pos: { x: 64, y: 15 }, weaponId: "breacher", region: 1 },
  ],

  doors: [
    {
      id: "vault-door",
      pos: { x: 26, y: 0 },
      cost: 750,
      blocks: wall(25.7, -3, 26.3, 3),
      opensRegion: 1,
    },
  ],

  // Deep sunken loading bay + a corner maintenance pit in the spawn yard, and a
  // raised dock + platform in the vault yard, over faint asphalt relief.
  terrain: {
    baseHeight: 0,
    layers: [
      { kind: "hills", amplitude: 0.35, wavelength: 26, seed: 77 }, // settled ground
      { kind: "noise", amplitude: 0.15, wavelength: 8, seed: 1337 }, // asphalt grain
    ],
    flatZones: [
      { rect: wall(6, -9, 20, 9), height: -3.0, blend: 3.0 }, // sunken loading bay
      { rect: wall(-22, 6, -14, 14), height: -2.0, blend: 1.5 }, // maintenance pit
      { rect: wall(52, -14, 64, -3), height: 1.8, blend: 2.5 }, // raised vault dock
      { rect: wall(34, 3, 44, 13), height: 1.2, blend: 2.0 }, // vault platform
    ],
  },

  theme: {
    ground: "concrete",
    fog: 0x1a1e28,
    fogNear: 55,
    fogFar: 150,
    sky: 0x2a3346, // dusk
    hemiSky: 0x9fb0c8,
    hemiGround: 0x33302a,
    dir: 0xffcaa0, // warm low sun
    dirIntensity: 1.5,
  },

  props: [
    // --- Spawn yard ---
    { kind: "lamp", pos: { x: -24, y: -16 } },
    { kind: "lamp", pos: { x: 24, y: -16 } },
    { kind: "lamp", pos: { x: -24, y: 16 } },
    { kind: "lamp", pos: { x: 22, y: 16 } },
    { kind: "car", pos: { x: -8, y: 14 }, rot: -1.2, color: 0x2a5a8a }, // headlights sweep the yard
    { kind: "container", pos: { x: -18, y: 10 }, rot: 0.2, color: 0x2a6a8a },
    { kind: "container", pos: { x: -20, y: -9 }, rot: 0.5, color: 0x8a4a2a },
    { kind: "crate", pos: { x: -6, y: 13 }, color: 0xb08a3a },
    { kind: "crate", pos: { x: -7, y: 12 }, color: 0x7a5a2a },
    { kind: "barrel", pos: { x: -12, y: -14 }, color: 0x3a8a4a },
    { kind: "barrel", pos: { x: 3, y: -15 }, color: 0xc23b3b },
    { kind: "crate", pos: { x: 22, y: 10 } },
    { kind: "crate", pos: { x: 23, y: 7 } },
    { kind: "crate", pos: { x: 24, y: 7.8 } },
    // --- Vault yard ---
    { kind: "lamp", pos: { x: 30, y: -16 } },
    { kind: "lamp", pos: { x: 64, y: 16 } },
    { kind: "lamp", pos: { x: 64, y: -4 }, color: 0x9fd0ff }, // cool lamp over the dock
    { kind: "car", pos: { x: 40, y: 15 }, rot: -1.4, color: 0x6a6a2a },
    { kind: "container", pos: { x: 38, y: 12 }, color: 0x2f7a3a },
    { kind: "container", pos: { x: 58, y: 10 }, rot: 0.3, color: 0xb0902a },
    { kind: "crate", pos: { x: 32, y: -14 } },
    { kind: "crate", pos: { x: 33, y: -13.4 } },
    { kind: "crate", pos: { x: 60, y: -16 } },
    { kind: "barrel", pos: { x: 46, y: 14 }, color: 0x3a6ac8 },

    // --- Extra spawn-yard clutter (CoD-style cover) ---
    { kind: "sandbag", pos: { x: -22, y: -16 }, rot: 0.1 },
    { kind: "sandbag", pos: { x: -20.9, y: -15.3 }, rot: 0.1 },
    { kind: "sandbag", pos: { x: -19.8, y: -14.6 }, rot: 0.1 },
    { kind: "crate", pos: { x: 16, y: -15 } },
    { kind: "crate", pos: { x: 16.7, y: -14.6 }, scale: 0.8 },
    { kind: "crate", pos: { x: 15.4, y: -14.8 }, scale: 0.9 },
    { kind: "container", pos: { x: 6, y: -15 } },
    { kind: "container", pos: { x: 10, y: -15 }, color: 0x6a4a8a },
    { kind: "barrel", pos: { x: -4, y: -16 }, color: 0xc0a03a },
    { kind: "barrel", pos: { x: -3.3, y: -15.5 }, color: 0x8a7a2a },
    { kind: "barrel", pos: { x: -4.6, y: -15.4 }, color: 0x6e7a52 },
    { kind: "lamp", pos: { x: -3, y: -3 } },
    { kind: "car", pos: { x: 20, y: 15 }, rot: -1.7, color: 0x394a2a },

    // --- Extra vault-yard clutter ---
    { kind: "sandbag", pos: { x: 62, y: -16 }, rot: -0.1 },
    { kind: "sandbag", pos: { x: 60.9, y: -15.3 }, rot: -0.1 },
    { kind: "sandbag", pos: { x: 59.8, y: -14.6 }, rot: -0.1 },
    { kind: "sandbag", pos: { x: 62, y: 16 }, rot: 0.1 },
    { kind: "sandbag", pos: { x: 60.9, y: 15.3 }, rot: 0.1 },
    { kind: "container", pos: { x: 48, y: 4 } },
    { kind: "container", pos: { x: 52, y: 4 }, color: 0x6a6a2a },
    { kind: "crate", pos: { x: 30, y: -11 } },
    { kind: "crate", pos: { x: 30.7, y: -10.6 }, scale: 0.8 },
    { kind: "barrel", pos: { x: 56, y: 15 }, color: 0x3a6ac8 },
    { kind: "barrel", pos: { x: 56.6, y: 14.5 }, color: 0x8a2a2a },
    { kind: "lamp", pos: { x: 46, y: 4 } },
    { kind: "car", pos: { x: 58, y: -13 }, rot: 1.4, color: 0x2a3a5a },
    // --- Spawn yard: motor pool + fuel point (west) ---
    { kind: "wreck", pos: { x: -14, y: 2 }, rot: 0.5 }, // burnt-out saloon, still smoking
    { kind: "tank", pos: { x: -23.5, y: -7 } },
    { kind: "tank", pos: { x: -23.5, y: -4.5 } },
    { kind: "sign", pos: { x: -22.4, y: -5.8 }, rot: 0 },
    { kind: "puddle", pos: { x: -10, y: 6 }, scale: 1.3 },

    // --- Spawn yard: maintenance pit (sunken, north-west of the south wall) ---
    { kind: "pallet", pos: { x: -20, y: 12.5 }, rot: 0.4 },
    { kind: "rubble", pos: { x: -16.5, y: 12 } },
    { kind: "puddle", pos: { x: -19, y: 9 }, scale: 1.1 },

    // --- Spawn yard: generator compound (south) ---
    { kind: "generator", pos: { x: -13, y: 15 } },
    { kind: "fence", pos: { x: -13, y: 13.2 } },
    { kind: "fence", pos: { x: -15.4, y: 14.2 }, rot: 1.57 },
    { kind: "sign", pos: { x: -13, y: 12.4 }, rot: -1.57 },
    { kind: "dumpster", pos: { x: -6, y: 16.6 } },

    // --- Spawn yard: the sunken loading bay ---
    { kind: "pipe", pos: { x: 10, y: -4 } },
    { kind: "pipe", pos: { x: 10, y: -2.6 } },
    { kind: "pipe", pos: { x: 12.5, y: 2 }, rot: 0.35 },
    { kind: "pallet", pos: { x: 16, y: -6 }, rot: 0.3 },
    { kind: "pallet", pos: { x: 17.2, y: -6.4 }, rot: 0.1 },
    { kind: "pallet", pos: { x: 16.5, y: 5.5 }, rot: -0.2 },
    { kind: "crate", pos: { x: 18, y: 3 } },
    { kind: "crate", pos: { x: 18.7, y: 3.6 }, scale: 0.9 },
    { kind: "rubble", pos: { x: 8, y: 6 } },
    { kind: "puddle", pos: { x: 13, y: 0 }, scale: 1.2 },
    { kind: "puddle", pos: { x: 9, y: 4 }, scale: 0.8 },
    { kind: "cone", pos: { x: 4.5, y: -6 } },
    { kind: "cone", pos: { x: 4.5, y: -3 } },
    { kind: "cone", pos: { x: 4.5, y: 0 } },
    { kind: "floodlight", pos: { x: 4, y: 12.5 }, rot: -0.95 }, // rakes across the bay
    { kind: "firebarrel", pos: { x: 2.5, y: -10 } },
    { kind: "pallet", pos: { x: 8, y: -13 }, rot: 0.2 },

    // --- Spawn yard: vault-door checkpoint (east) ---
    { kind: "concreteBarrier", pos: { x: 24, y: 4 }, rot: 1.57 },
    { kind: "concreteBarrier", pos: { x: 24, y: -4 }, rot: 1.57 },
    { kind: "cone", pos: { x: 24.5, y: 1.2 } },
    { kind: "cone", pos: { x: 24.5, y: -1.2 } },
    { kind: "rubble", pos: { x: 24, y: -8 } },
    { kind: "sign", pos: { x: 21, y: -16.6 }, rot: 3.14 },
    { kind: "cone", pos: { x: -2.5, y: -12 } }, // marking the north breach
    { kind: "cone", pos: { x: -1, y: -12.5 } },

    // --- Vault yard: guard tower + comms mast ---
    { kind: "tower", pos: { x: 36.5, y: -14.5 }, rot: 0.99 }, // searchlight over the yard
    { kind: "antenna", pos: { x: 60, y: -6 } },
    { kind: "floodlight", pos: { x: 56, y: -3 }, rot: 2.5 },
    { kind: "tank", pos: { x: 63, y: -9 } },
    { kind: "tank", pos: { x: 63, y: -11.6 } },
    { kind: "sign", pos: { x: 54, y: -3.5 }, rot: -1.57 },

    // --- Vault yard: door plant + fenced platform ---
    { kind: "generator", pos: { x: 28.5, y: 5 } },
    { kind: "sign", pos: { x: 28.5, y: 6.6 }, rot: -1.57 },
    { kind: "fence", pos: { x: 39, y: 4 } },
    { kind: "fence", pos: { x: 42.4, y: 4 } },
    { kind: "pallet", pos: { x: 42, y: 6.5 }, rot: 0.3 },
    { kind: "pallet", pos: { x: 43, y: 7 } },
    { kind: "pipe", pos: { x: 30, y: 8 }, rot: 1.57 },
    { kind: "pipe", pos: { x: 31.4, y: 8 }, rot: 1.57 },
    { kind: "dumpster", pos: { x: 34, y: -2 }, rot: 1.57 },

    // --- Vault yard: south-east yard clutter ---
    { kind: "wreck", pos: { x: 52, y: 14 }, rot: 0.4 },
    { kind: "concreteBarrier", pos: { x: 61, y: 6 }, rot: 1.57 },
    { kind: "concreteBarrier", pos: { x: 61, y: 8.2 }, rot: 1.57 },
    { kind: "rubble", pos: { x: 54, y: 1 } },
    { kind: "firebarrel", pos: { x: 50, y: 8 } },
    { kind: "firebarrel", pos: { x: 44, y: -10 } },
    { kind: "puddle", pos: { x: 48, y: -8 }, scale: 1.2 },
    { kind: "puddle", pos: { x: 36, y: 16 } },
    { kind: "cone", pos: { x: 44.6, y: -16 } }, // flanking the vault-north breach
    { kind: "cone", pos: { x: 47.4, y: -16 } },
    { kind: "rubble", pos: { x: 41, y: -16.5 } },

    // --- Outside the wire: dead scrub on the approach roads ---
    { kind: "deadTree", pos: { x: -14, y: -21 } },
    { kind: "deadTree", pos: { x: 12, y: -21.5 } },
    { kind: "deadTree", pos: { x: -28.5, y: 9 } },
    { kind: "deadTree", pos: { x: 68.5, y: 12 } },
    { kind: "deadTree", pos: { x: 69, y: -14 } },
  ],

  lights: [
    // Vault-door status lamp — the one non-diegetic accent on the map.
    { pos: { x: 26.9, y: 3.6 }, color: 0xff3b30, intensity: 6, range: 10, height: 2.2 },
  ],
};
