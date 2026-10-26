// Runtime wrapper over a static MapDef. Tracks which doors are open, which
// regions are live, and how many planks are left on each barrier, and exposes
// the *current* collision walls (perimeter plus any still-closed door). DOM-free.

import type { Vec2 } from "../core/math";
import { distSq } from "../core/math";
import type { MapDef, WallRect, BarrierDef, WallBuyDef, DoorDef, PerkMachineDef, CacheSiteDef, SupplyDef } from "./types";
import { propColliders, colliderAabb, isSolidProp } from "./props";
import { Boards } from "./Barriers";
import { PERK_MACHINE, SUPPLY_CRATE, CACHE_BOX, fixtureAabb } from "./fixtures";

export const INTERACT_RANGE = 2.4;

/** A barrier plus where it sits in `def.barriers`, which is its board index. */
export interface IndexedBarrier {
  index: number;
  def: BarrierDef;
}

export class GameMap {
  readonly def: MapDef;
  readonly openedDoors = new Set<string>();
  readonly activeRegions = new Set<number>();
  /** Plank counts, indexed to match `def.barriers`. */
  readonly boards: Boards;
  walls: WallRect[] = [];
  /** Where The Cache is standing right now. World keeps this in step with
   *  `Cache.site`, because the box moves and the flow field has to follow it. */
  private cacheWall: WallRect | null = null;

  constructor(def: MapDef) {
    this.def = def;
    this.boards = new Boards(def.barriers.length);
    for (const r of def.startRegions) this.activeRegions.add(r);
    this.rebuildWalls();
  }

  private rebuildWalls(): void {
    const walls = [...this.def.walls];
    for (const door of this.def.doors) {
      if (!this.openedDoors.has(door.id)) walls.push(door.blocks);
    }
    // Solid props are obstacles too. These flat AABBs feed the flow-field and
    // bullets; height-aware movement uses the shaped colliders in World.obstacles.
    // Multi-part props contribute one rect per part, so zombies path between the
    // legs of a tower rather than around a phantom block.
    for (const p of this.def.props ?? []) {
      if (!isSolidProp(p)) continue;
      for (const c of propColliders(p)) walls.push(colliderAabb(c));
    }
    // Fixtures are solid whatever region they are in — a machine or a crate you
    // can walk through is scenery, and the horde would path straight through it
    // too. The Cache is carried separately because it moves; see `setCacheSite`.
    if (PERK_MACHINE.solid) {
      for (const m of this.def.perkMachines ?? []) walls.push(fixtureAabb(PERK_MACHINE, m.pos, m.rot ?? 0));
    }
    if (SUPPLY_CRATE.solid) {
      for (const s of this.def.supplies ?? []) walls.push(fixtureAabb(SUPPLY_CRATE, s.pos, s.rot ?? 0));
    }
    if (this.cacheWall) walls.push(this.cacheWall);
    this.walls = walls;
  }

  /** Point the Cache's collision footprint at `site` (null on a map without one). */
  setCacheSite(site: CacheSiteDef | null): void {
    this.cacheWall = site && CACHE_BOX.solid ? fixtureAabb(CACHE_BOX, site.pos, site.rot ?? 0) : null;
    this.rebuildWalls();
  }

  isRegionActive(region: number): boolean {
    return this.activeRegions.has(region);
  }

  activeBarriers(): BarrierDef[] {
    return this.def.barriers.filter((b) => this.activeRegions.has(b.region));
  }

  /** Live barriers with their board index — what the spawner and repairs need. */
  activeBarrierEntries(): IndexedBarrier[] {
    const out: IndexedBarrier[] = [];
    this.def.barriers.forEach((def, index) => {
      if (this.activeRegions.has(def.region)) out.push({ index, def });
    });
    return out;
  }

  activeWallBuys(): WallBuyDef[] {
    return this.def.wallBuys.filter((w) => this.activeRegions.has(w.region));
  }

  activePerkMachines(): PerkMachineDef[] {
    return (this.def.perkMachines ?? []).filter((m) => this.activeRegions.has(m.region));
  }

  activeSupplies(): SupplyDef[] {
    return (this.def.supplies ?? []).filter((s) => this.activeRegions.has(s.region));
  }

  /** Indices into `def.cacheSites` whose region is live — where the box may go. */
  liveCacheSites(): number[] {
    const out: number[] = [];
    (this.def.cacheSites ?? []).forEach((site: CacheSiteDef, i: number) => {
      if (this.activeRegions.has(site.region)) out.push(i);
    });
    return out;
  }

  /** Open a door by id; returns the newly-unlocked region (or null). */
  openDoor(id: string): number | null {
    const door = this.def.doors.find((d) => d.id === id);
    if (!door || this.openedDoors.has(id)) return null;
    this.openedDoors.add(id);
    this.activeRegions.add(door.opensRegion);
    this.rebuildWalls();
    return door.opensRegion;
  }

  nearestClosedDoor(pos: Vec2, range = INTERACT_RANGE): DoorDef | null {
    let best: DoorDef | null = null;
    let bestD = range * range;
    for (const d of this.def.doors) {
      if (this.openedDoors.has(d.id)) continue;
      const dd = distSq(pos, d.pos);
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    return best;
  }

  nearestWallBuy(pos: Vec2, range = INTERACT_RANGE): WallBuyDef | null {
    return nearest(this.activeWallBuys(), pos, range);
  }

  nearestPerkMachine(pos: Vec2, range = INTERACT_RANGE): PerkMachineDef | null {
    return nearest(this.activePerkMachines(), pos, range);
  }

  nearestSupply(pos: Vec2, range = INTERACT_RANGE): SupplyDef | null {
    return nearest(this.activeSupplies(), pos, range);
  }

  /**
   * The live barrier nearest `pos` that is missing planks. Barriers sit in wall
   * gaps, so the reach is a little longer than a wall-buy's — you rebuild from
   * inside the room, not by standing in the hole.
   */
  nearestRepairableBarrier(pos: Vec2, range = INTERACT_RANGE + 0.6): IndexedBarrier | null {
    let best: IndexedBarrier | null = null;
    let bestD = range * range;
    for (const entry of this.activeBarrierEntries()) {
      if (!this.boards.needsRepair(entry.index)) continue;
      const dd = distSq(pos, entry.def.pos);
      if (dd < bestD) {
        bestD = dd;
        best = entry;
      }
    }
    return best;
  }
}

/** Nearest of a list of positioned things within `range`, or null. */
function nearest<T extends { pos: Vec2 }>(items: T[], pos: Vec2, range: number): T | null {
  let best: T | null = null;
  let bestD = range * range;
  for (const item of items) {
    const dd = distSq(pos, item.pos);
    if (dd < bestD) {
      bestD = dd;
      best = item;
    }
  }
  return best;
}
