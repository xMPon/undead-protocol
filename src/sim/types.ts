// Shared shapes for the headless simulation. No behaviour here — just data
// contracts that sim/, data/, and render/ all agree on.

import type { Vec2 } from "../core/math";

/**
 * View-independent per-frame command produced by whichever renderer/input
 * adapter is active. The simulation only ever reads Intent — never the raw
 * keyboard or mouse — so 3D and 2D drive identical game logic.
 */
export interface Intent {
  /** Desired movement direction in world space, magnitude 0..1. */
  move: Vec2;
  /** Aim heading in radians (world space). */
  aim: number;
  firing: boolean;
  reload: boolean;
  interact: boolean;
  sprint: boolean;
  jump: boolean;
  /** Weapon slot the player wants to switch to, or null. */
  switchTo: number | null;
}

export function emptyIntent(): Intent {
  return { move: { x: 0, y: 0 }, aim: 0, firing: false, reload: false, interact: false, sprint: false, jump: false, switchTo: null };
}

// ---- Weapons ----

export interface WeaponDef {
  id: string;
  name: string;
  /** Damage per pellet. */
  damage: number;
  /** Rounds per minute (fire cadence). */
  rpm: number;
  magSize: number;
  reserveMax: number;
  /** Seconds to reload. */
  reloadTime: number;
  /** Projectiles per trigger pull (>1 = shotgun). */
  pellets: number;
  /** Half-angle spread in radians. */
  spread: number;
  /** Full-auto (hold) vs semi (per click). */
  auto: boolean;
  /** Hitscan range in world units. */
  range: number;
  /** Cost to buy off the wall the first time. */
  wallCost: number;
  /** Cost to refill ammo when already owned. */
  ammoCost: number;
}

/** A weapon the player actually carries: def id + live ammo counters. */
export interface WeaponInstance {
  defId: string;
  mag: number;
  reserve: number;
}

// ---- Map ----

/** Axis-aligned solid rectangle used for both movement and bullet blocking. */
export interface WallRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * A solid the world collides against, with a top height (absolute) so entities
 * can jump onto low obstacles but not through tall ones.
 *
 * `rect` is always the world AABB — broadphase and the collider itself for the
 * common axis-aligned case. A rotated prop additionally carries `rot`/`half` so
 * it collides as the box you can actually see rather than its bounding box, and
 * a round one carries `radius`. Getting this wrong is what an invisible wall
 * feels like, so props build these through `propColliders`.
 */
export interface Obstacle {
  rect: WallRect;
  top: number;
  /** Yaw of the true oriented box about the centre of `rect`. */
  rot?: number;
  /** Unrotated half extents of that oriented box. Required whenever `rot` is set. */
  half?: Vec2;
  /** Disc collider centred on `rect`, used instead of the box. */
  radius?: number;
}

/** A boarded window where zombies breach into a room. */
export interface BarrierDef {
  pos: Vec2;
  /** Unit direction pointing into the playable room. */
  inward: Vec2;
  /** Region this barrier belongs to; only active regions spawn zombies. */
  region: number;
}

export interface WallBuyDef {
  pos: Vec2;
  weaponId: string;
  region: number;
}

export interface DoorDef {
  id: string;
  /** Prompt anchor / interaction point. */
  pos: Vec2;
  /** What the prompt calls it, e.g. "Open Vault". Defaults to "Open Door". */
  name?: string;
  cost: number;
  /** Wall rectangle removed from collision when the door opens. */
  blocks: WallRect;
  /** Region unlocked (its barriers + wall-buys go live) when opened. */
  opensRegion: number;
}

export interface MapDef {
  /** Stable key. Referenced by the map-select menu and saved settings — append,
   *  never rename, the same rule weapon ids follow. */
  id: string;
  name: string;
  /** One line for the map-select card. */
  blurb?: string;
  bounds: WallRect;
  walls: WallRect[];
  barriers: BarrierDef[];
  wallBuys: WallBuyDef[];
  doors: DoorDef[];
  playerSpawn: Vec2;
  /** Regions live from the start (region 0 = spawn room). */
  startRegions: number[];
  /** Rectangles the player is confined to — the cage that stops them walking out
   *  through a barrier gap. The player may stand anywhere in the **union**, so a
   *  compound of several wings lists one rect per wing; make connected rects
   *  overlap across their shared doorway. Zombies ignore this entirely. */
  playBounds?: WallRect[];
  /** Ground elevation. Omit for flat. */
  terrain?: TerrainDef;
  /** Environment look (fog/lights/sky/ground). Omit for the default. */
  theme?: ThemeDef;
  /** Scenery / cover objects. Solid ones also block movement + bullets. */
  props?: PropDef[];
  /** Coloured point lights for atmosphere. */
  lights?: PointLightDef[];
  /** Graffiti, stencils and stains sprayed on walls and floors. */
  decals?: DecalDef[];
}

// ---- Terrain ----

export type TerrainLayerKind = "hills" | "drifts" | "dunes" | "terraces" | "noise";

export interface TerrainLayer {
  kind: TerrainLayerKind;
  /** Peak vertical displacement in world units. */
  amplitude: number;
  /** World units per feature cycle. */
  wavelength: number;
  seed: number;
  /** Ridge direction for `dunes` (radians). */
  angle?: number;
  /** Step count for `terraces`. */
  steps?: number;
}

/** Forces the ground flat inside `rect`, ramping over `blend` units at the edges. */
export interface FlatZone {
  rect: WallRect;
  height: number;
  /** World units of ramp blending at the edges (0 = a hard step). */
  blend?: number;
}

export interface TerrainDef {
  baseHeight: number;
  layers: TerrainLayer[];
  flatZones?: FlatZone[];
}

// ---- Theme ----

export type GroundKind = "concrete" | "snow" | "sand" | "dock" | "quarry" | "grass";

export interface ThemeDef {
  ground: GroundKind;
  fog: number;
  fogNear: number;
  fogFar: number;
  sky: number;
  hemiSky: number;
  hemiGround: number;
  dir: number;
  dirIntensity: number;
}

// ---- Props ----

export type PropKind =
  // Cover and clutter.
  | "crate"
  | "barrel"
  | "rock"
  | "sandbag"
  | "container"
  | "pallet"
  | "pipe"
  | "dumpster"
  | "concreteBarrier"
  | "rubble"
  | "deadTree"
  | "wreck"
  // Compound structure and machinery.
  | "blockhouse"
  | "fence"
  | "generator"
  | "tank"
  | "tower"
  | "antenna"
  // Light sources (see `PropSpec.emits`).
  | "lamp"
  | "car"
  | "floodlight"
  | "firebarrel"
  // Non-blocking dressing (see `PropSpec.decor`).
  | "cone"
  | "sign"
  | "puddle";

export interface PropDef {
  kind: PropKind;
  pos: Vec2;
  /** Yaw in radians. */
  rot?: number;
  scale?: number;
  /** Whether it blocks movement/bullets. Defaults to the kind's spec (`decor`
   *  kinds are pass-through, everything else is solid). */
  solid?: boolean;
  /** Optional colour override (hex) — used for crates and containers. */
  color?: number;
}

// ---- Decals ----

/** What is sprayed, scratched or spilled. */
export type DecalKind = "tag" | "stencil" | "arrow" | "tally" | "biohazard" | "blood" | "scorch";

/**
 * A flat mark on a wall or the floor. Purely cosmetic — decals have no collider
 * and the simulation never sees them — but they are what turns a grey wall into
 * somewhere people were, so place them where the story happened: beside doors,
 * over barriers, around the bodies.
 */
export interface DecalDef {
  kind: DecalKind;
  pos: Vec2;
  /** Which way it faces, in radians. Ignored when it lies flat on the floor. */
  rot?: number;
  /** Centre height above the ground; `0` lays it flat. Default 1.5. */
  height?: number;
  scale?: number;
  /** Text for `tag` and `stencil`. A newline splits it over two lines. */
  text?: string;
  color?: number;
}

// ---- Lights ----

/** A coloured point light placed in the map for atmosphere. */
export interface PointLightDef {
  pos: Vec2;
  color: number;
  intensity: number;
  range: number;
  /** Height above the ground (world units). Default 3. */
  height?: number;
}

// ---- Transient render-facing events ----

export interface Tracer {
  from: Vec2;
  to: Vec2;
  /** Seconds remaining before it fades. */
  ttl: number;
  hit: boolean;
}

export type ZombieState = "rising" | "chasing" | "attacking" | "dead";
