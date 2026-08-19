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
  /** Weapon slot the player wants to switch to, or null. */
  switchTo: number | null;
}

export function emptyIntent(): Intent {
  return { move: { x: 0, y: 0 }, aim: 0, firing: false, reload: false, interact: false, sprint: false, switchTo: null };
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
  cost: number;
  /** Wall rectangle removed from collision when the door opens. */
  blocks: WallRect;
  /** Region unlocked (its barriers + wall-buys go live) when opened. */
  opensRegion: number;
}

export interface MapDef {
  name: string;
  bounds: WallRect;
  walls: WallRect[];
  barriers: BarrierDef[];
  wallBuys: WallBuyDef[];
  doors: DoorDef[];
  playerSpawn: Vec2;
  /** Regions live from the start (region 0 = spawn room). */
  startRegions: number[];
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
