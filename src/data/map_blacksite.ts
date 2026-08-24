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
  id: "blacksite",
  name: "Blacksite",
  blurb: "A research compound at dusk. Four yards, deep cover, and the lights still on.",
  bounds: wall(-30, -22, 71, 45),
  playerSpawn: { x: 0, y: 0 },
  startRegions: [0],
  // One cage rect per wing, on the *inner wall faces* so the walls do the
  // stopping and the cage only bites at the barrier gaps. The southern wings
  // reach 1.4 units back into the yards: connected rects have to overlap by more
  // than the player diameter, or the doorway between them is a dead band that
  // neither rect accepts and the player cannot walk through at all.
  playBounds: [
    wall(-26, -18, 66, 18), // spawn yard + vault yard
    wall(4, 16.6, 29.4, 40), // substation
    wall(30, 16.6, 58, 40), // cold store
  ],

  walls: [
    // --- Spawn yard (region 0) perimeter, gaps for N/S/W barriers ---
    wall(-26.6, -18.6, -2, -18), wall(2, -18.6, 26.6, -18), // north, gap x[-2,2]
    wall(-26.6, 18, -2, 18.6), wall(2, 18, 10, 18.6), wall(16, 18, 26.6, 18.6), // south: barrier gap x[-2,2], substation door x[10,16]
    wall(-26.6, -18.6, -26, -2), wall(-26.6, 2, -26, 18.6), // west, gap y[-2,2]

    // --- Shared wall (x=26), gap = door y[-3,3] ---
    wall(25.7, -18.6, 26.3, -3), wall(25.7, 3, 26.3, 18.6),

    // --- Vault yard (region 1) perimeter ---
    wall(25.7, -18.6, 44, -18), wall(48, -18.6, 66.6, -18), // north, gap for B-N barrier x[44,48]
    wall(25.7, 18, 41, 18.6), wall(47, 18, 66.6, 18.6), // south, gap = cold-store door x[41,47]
    wall(66, -18.6, 66.6, -2), wall(66, 2, 66.6, 18.6), // east, gap for B-E barrier y[-2,2]

    // --- Substation (region 2): interior x[4,29.4] y[18,40], south of the spawn yard ---
    wall(3.4, 18, 4, 26), wall(3.4, 30, 4, 40.6), // west, gap for the S-W barrier y[26,30]
    wall(3.4, 40, 14, 40.6), wall(20, 40, 30, 40.6), // south, gap for the S-S barrier x[14,20]
    wall(29.4, 18, 30, 40.6), // party wall shared with the cold store (solid)

    // --- Cold store (region 3): interior x[30,58] y[18,40], south of the vault yard ---
    wall(58, 18, 58.6, 26), wall(58, 30, 58.6, 40.6), // east, gap for the C-E barrier y[26,30]
    wall(30, 40, 42, 40.6), wall(46, 40, 58.6, 40.6), // south, gap for the C-S barrier x[42,46]

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
    { pos: { x: 4, y: 28 }, inward: { x: 1, y: 0 }, region: 2 }, // substation west
    { pos: { x: 17, y: 40 }, inward: { x: 0, y: -1 }, region: 2 }, // substation south
    { pos: { x: 58, y: 28 }, inward: { x: -1, y: 0 }, region: 3 }, // cold store east
    { pos: { x: 44, y: 40 }, inward: { x: 0, y: -1 }, region: 3 }, // cold store south
  ],

  wallBuys: [
    { pos: { x: -24, y: -15 }, weaponId: "pdw", region: 0 },
    { pos: { x: 64, y: -15 }, weaponId: "kr12", region: 1 },
    { pos: { x: 64, y: 15 }, weaponId: "breacher", region: 1 },
    { pos: { x: 6, y: 36 }, weaponId: "lancer", region: 2 },
    { pos: { x: 56, y: 22 }, weaponId: "havoc", region: 3 },
  ],

  // Progression: the vault opens off spawn, the substation is the other cheap
  // branch, and the cold store sits behind the vault — so the deepest room costs
  // two doors to reach.
  doors: [
    {
      id: "vault-door",
      pos: { x: 26, y: 0 },
      name: "Open Vault",
      cost: 750,
      blocks: wall(25.7, -3, 26.3, 3),
      opensRegion: 1,
    },
    {
      id: "substation-door",
      pos: { x: 13, y: 18.3 },
      name: "Open Substation",
      cost: 1000,
      blocks: wall(10, 18, 16, 18.6),
      opensRegion: 2,
    },
    {
      id: "coldstore-door",
      pos: { x: 44, y: 18.3 },
      name: "Open Cold Store",
      cost: 1250,
      blocks: wall(41, 18, 47, 18.6),
      opensRegion: 3,
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
      // Southern wings. Nested zones must come after their parent: the trench and
      // the internal dock are cut into the pads above them.
      { rect: wall(6, 20, 28, 38), height: 0.4, blend: 2.0 }, // substation apron
      { rect: wall(10, 26, 18, 33), height: -1.8, blend: 1.2 }, // cable trench
      { rect: wall(32, 20, 56, 38), height: 0.8, blend: 2.5 }, // cold-store floor
      { rect: wall(44, 30, 55, 38), height: 2.6, blend: 1.2 }, // internal loading dock
      // Level pads under the blockhouses. These come last so they win over the
      // zones beneath them — a building on a slope shows daylight under a wall.
      { rect: wall(-12.6, 6.6, -7.4, 11.4), height: 0.1, blend: 1.2 },
      { rect: wall(49.6, 5.9, 54.4, 11.1), height: 0.4, blend: 1.4 },
      { rect: wall(29.9, 27.6, 34.9, 32.4), height: 0.8, blend: 1.0 },
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
    { kind: "container", pos: { x: 59, y: 10.5 }, rot: 0.3, color: 0xb0902a },
    { kind: "crate", pos: { x: 32, y: -14 } },
    { kind: "crate", pos: { x: 33, y: -13.4 } },
    { kind: "crate", pos: { x: 59.6, y: -16.2 } },
    { kind: "barrel", pos: { x: 46, y: 14 }, color: 0x3a6ac8 },

    // --- Extra spawn-yard clutter (CoD-style cover) ---
    { kind: "sandbag", pos: { x: -22, y: -16 }, rot: 0.1 },
    { kind: "sandbag", pos: { x: -20.9, y: -15.3 }, rot: 0.1 },
    { kind: "sandbag", pos: { x: -19.8, y: -14.6 }, rot: 0.1 },
    { kind: "crate", pos: { x: 16, y: -15 } },
    { kind: "crate", pos: { x: 17.1, y: -14.3 }, scale: 0.8 },
    { kind: "crate", pos: { x: 14.9, y: -14.6 }, scale: 0.9 },
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
    { kind: "crate", pos: { x: 31.1, y: -10.4 }, scale: 0.8 },
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
    { kind: "pallet", pos: { x: 17.6, y: -6.5 }, rot: 0.1 },
    { kind: "pallet", pos: { x: 16.5, y: 5.5 }, rot: -0.2 },
    { kind: "crate", pos: { x: 18, y: 3 } },
    { kind: "crate", pos: { x: 19, y: 3.8 }, scale: 0.9 },
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
    { kind: "pallet", pos: { x: 43.4, y: 7.2 } },
    { kind: "pipe", pos: { x: 30, y: 8 }, rot: 1.57 },
    { kind: "pipe", pos: { x: 31.4, y: 8 }, rot: 1.57 },
    { kind: "dumpster", pos: { x: 34, y: -2 }, rot: 1.57 },

    // --- Vault yard: south-east yard clutter ---
    { kind: "wreck", pos: { x: 52, y: 14 }, rot: 0.4 },
    { kind: "concreteBarrier", pos: { x: 61, y: 6 }, rot: 1.57 },
    { kind: "concreteBarrier", pos: { x: 61, y: 8.2 }, rot: 1.57 },
    { kind: "rubble", pos: { x: 54, y: 1 } },
    { kind: "firebarrel", pos: { x: 49, y: 8 } },
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
    // --- Substation (region 2): transformers, a fenced cable trench, and the
    //     Lancer-7 on the back wall ---
    { kind: "lamp", pos: { x: 6, y: 20.5 } },
    { kind: "lamp", pos: { x: 27.5, y: 20.5 } },
    { kind: "lamp", pos: { x: 27.5, y: 38 } },
    { kind: "generator", pos: { x: 22, y: 21 } },
    { kind: "generator", pos: { x: 22, y: 24 } },
    { kind: "tank", pos: { x: 26.5, y: 27 } },
    { kind: "tank", pos: { x: 26.5, y: 30 } },
    { kind: "antenna", pos: { x: 28, y: 34 } },
    { kind: "fence", pos: { x: 13, y: 24.4 } }, // trench guard rail — walk around either end
    { kind: "fence", pos: { x: 16.4, y: 24.4 } },
    { kind: "sign", pos: { x: 13, y: 25.2 }, rot: -1.57 },
    { kind: "cone", pos: { x: 10.6, y: 24.4 } },
    { kind: "cone", pos: { x: 18.4, y: 24.4 } },
    { kind: "pipe", pos: { x: 13.5, y: 29 }, rot: 1.57 }, // down in the trench
    { kind: "pipe", pos: { x: 15, y: 29 }, rot: 1.57 },
    { kind: "puddle", pos: { x: 12, y: 31 }, scale: 1.3 },
    { kind: "firebarrel", pos: { x: 8, y: 22.5 } },
    { kind: "floodlight", pos: { x: 24, y: 34 }, rot: 3.0 },
    { kind: "wreck", pos: { x: 23, y: 37 }, rot: 2.6 },
    { kind: "concreteBarrier", pos: { x: 21, y: 31 }, rot: 1.57 },
    { kind: "concreteBarrier", pos: { x: 21, y: 33.2 }, rot: 1.57 },
    { kind: "sandbag", pos: { x: 9, y: 33 } },
    { kind: "sandbag", pos: { x: 9, y: 34.1 } },
    { kind: "sandbag", pos: { x: 9, y: 35.2 } },
    { kind: "crate", pos: { x: 10, y: 37.5 } },
    { kind: "crate", pos: { x: 10.9, y: 38 }, scale: 0.9 },
    { kind: "pallet", pos: { x: 26, y: 36 }, rot: 0.3 },
    { kind: "dumpster", pos: { x: 5.8, y: 34 }, rot: 1.57 },
    { kind: "rubble", pos: { x: 20, y: 22 } },
    { kind: "sign", pos: { x: 5.2, y: 21 } },

    // --- Cold store (region 3): container rows, an internal dock, a second
    //     guard tower, and the Havoc-9 ---
    { kind: "lamp", pos: { x: 32, y: 20.5 } },
    { kind: "lamp", pos: { x: 32, y: 38 } },
    { kind: "lamp", pos: { x: 56, y: 38 } },
    { kind: "container", pos: { x: 36, y: 23 }, color: 0x2a6a8a },
    { kind: "container", pos: { x: 36, y: 26 }, color: 0x8a4a2a },
    { kind: "container", pos: { x: 36, y: 29 }, color: 0x2f7a3a },
    { kind: "container", pos: { x: 51, y: 34 }, rot: 1.57, color: 0x6a4a8a },
    { kind: "crate", pos: { x: 49, y: 22 } },
    { kind: "crate", pos: { x: 49.9, y: 22.6 }, scale: 0.9 },
    { kind: "crate", pos: { x: 48.6, y: 23.4 } },
    { kind: "pallet", pos: { x: 41, y: 24 }, rot: 0.2 },
    { kind: "pallet", pos: { x: 42.5, y: 24.6 } },
    { kind: "tower", pos: { x: 33, y: 34 }, rot: 0.5 },
    { kind: "floodlight", pos: { x: 48, y: 20.5 }, rot: 1.9 },
    { kind: "firebarrel", pos: { x: 40, y: 36 } },
    { kind: "firebarrel", pos: { x: 54, y: 24.5 } },
    { kind: "wreck", pos: { x: 53, y: 30 }, rot: 1.2 },
    { kind: "dumpster", pos: { x: 31.5, y: 24 }, rot: 1.57 },
    { kind: "concreteBarrier", pos: { x: 48, y: 37 } },
    { kind: "concreteBarrier", pos: { x: 50.2, y: 37 } },
    { kind: "tank", pos: { x: 56.5, y: 35 } },
    { kind: "rubble", pos: { x: 38, y: 33 } },
    { kind: "rubble", pos: { x: 56, y: 33 } },
    { kind: "sandbag", pos: { x: 39, y: 20.5 } },
    { kind: "sandbag", pos: { x: 40.1, y: 20.5 } },
    { kind: "puddle", pos: { x: 44, y: 28 }, scale: 1.4 },
    { kind: "puddle", pos: { x: 34, y: 21 } },
    { kind: "cone", pos: { x: 42.4, y: 20 } },
    { kind: "cone", pos: { x: 45.6, y: 20 } },
    { kind: "sign", pos: { x: 30.9, y: 31 } },

    // --- Shelters you can actually walk into ---
    { kind: "blockhouse", pos: { x: -10, y: 9 } }, // spawn yard: pump house, door east
    { kind: "blockhouse", pos: { x: 52, y: 8.5 }, rot: -1.57 }, // vault yard: door north
    { kind: "blockhouse", pos: { x: 32.4, y: 30 } }, // cold store: door east

    // --- Outside the wire: the southern approach ---
    { kind: "deadTree", pos: { x: -6, y: 26 } },
    { kind: "deadTree", pos: { x: -12, y: 36 } },
    { kind: "deadTree", pos: { x: 24, y: 43.5 } },
    { kind: "deadTree", pos: { x: 63, y: 24 } },
    { kind: "deadTree", pos: { x: 66, y: 38 } },
    { kind: "wreck", pos: { x: -3, y: 33 }, rot: 0.8 },
    { kind: "rubble", pos: { x: 34, y: 43 } },
  ],

  lights: [
    // Vault-door status lamp — the one non-diegetic accent on the map.
    { pos: { x: 26.9, y: 3.6 }, color: 0xff3b30, intensity: 6, range: 10, height: 2.2 },
  ],

  // What the last people here left behind. `rot` is the direction a wall decal
  // faces, so it must point *away* from the wall and into the room; `height: 0`
  // lays a stain flat on the ground instead.
  decals: [
    // --- Spawn yard ---
    { kind: "tag", pos: { x: -8, y: -17.85 }, rot: 1.5708, height: 1.6, text: "NO EVAC" },
    { kind: "tally", pos: { x: 9, y: -17.85 }, rot: 1.5708, height: 1.5, scale: 1.1 },
    { kind: "tag", pos: { x: -18, y: 17.85 }, rot: -1.5708, height: 1.65, text: "DAY 41\nSTILL HERE", color: 0xe0d8c0 },
    { kind: "stencil", pos: { x: 20, y: 17.85 }, rot: -1.5708, height: 1.75, text: "SECTOR 7" },
    { kind: "biohazard", pos: { x: -25.85, y: -6 }, rot: 0, height: 1.7, scale: 1.15 },
    { kind: "arrow", pos: { x: -25.85, y: 7 }, rot: 0, height: 1.5 },
    { kind: "stencil", pos: { x: 25.55, y: -8 }, rot: 3.1416, height: 1.75, text: "VAULT" },
    { kind: "tag", pos: { x: 25.55, y: 8 }, rot: 3.1416, height: 1.6, text: "DO NOT\nOPEN", color: 0xd8452c },

    // --- Vault yard ---
    { kind: "tag", pos: { x: 36, y: -17.85 }, rot: 1.5708, height: 1.6, text: "IT SEES", scale: 0.95 },
    { kind: "stencil", pos: { x: 56, y: 17.85 }, rot: -1.5708, height: 1.75, text: "COLD STORE" },
    { kind: "arrow", pos: { x: 65.55, y: -8 }, rot: 3.1416, height: 1.55 },

    // --- Southern wings ---
    { kind: "stencil", pos: { x: 4.15, y: 34 }, rot: 0, height: 1.75, text: "HIGH VOLTAGE" },
    { kind: "tag", pos: { x: 24, y: 39.85 }, rot: -1.5708, height: 1.6, text: "WE TRIED" },
    { kind: "biohazard", pos: { x: 57.85, y: 34 }, rot: 3.1416, height: 1.7 },
    { kind: "stencil", pos: { x: 36, y: 39.85 }, rot: -1.5708, height: 1.75, text: "QUARANTINE" },

    // --- Stains on the ground, where it already happened ---
    { kind: "blood", pos: { x: 0, y: -15 }, height: 0, scale: 1.2 },
    { kind: "blood", pos: { x: -23, y: 0 }, height: 0 },
    { kind: "blood", pos: { x: 46, y: -15 }, height: 0, scale: 1.1 },
    { kind: "blood", pos: { x: 13, y: 20 }, height: 0, scale: 0.9 },
    { kind: "scorch", pos: { x: -14, y: 3.2 }, height: 0, scale: 1.4 },
    { kind: "scorch", pos: { x: 52, y: 15 }, height: 0, scale: 1.3 },
    { kind: "scorch", pos: { x: 23, y: 37.6 }, height: 0, scale: 1.2 },
  ],
};
