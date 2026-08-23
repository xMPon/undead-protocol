// Runtime wrapper over a static MapDef. Tracks which doors are open and which
// regions are live, and exposes the *current* collision walls (perimeter plus
// any still-closed door). DOM-free.

import type { Vec2 } from "../core/math";
import { distSq } from "../core/math";
import type { MapDef, WallRect, BarrierDef, WallBuyDef, DoorDef } from "./types";
import { propColliders, colliderAabb, isSolidProp } from "./props";

export const INTERACT_RANGE = 2.4;

export class GameMap {
  readonly def: MapDef;
  readonly openedDoors = new Set<string>();
  readonly activeRegions = new Set<number>();
  walls: WallRect[] = [];

  constructor(def: MapDef) {
    this.def = def;
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
    this.walls = walls;
  }

  isRegionActive(region: number): boolean {
    return this.activeRegions.has(region);
  }

  activeBarriers(): BarrierDef[] {
    return this.def.barriers.filter((b) => this.activeRegions.has(b.region));
  }

  activeWallBuys(): WallBuyDef[] {
    return this.def.wallBuys.filter((w) => this.activeRegions.has(w.region));
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
    let best: WallBuyDef | null = null;
    let bestD = range * range;
    for (const w of this.activeWallBuys()) {
      const dd = distSq(pos, w.pos);
      if (dd < bestD) {
        bestD = dd;
        best = w;
      }
    }
    return best;
  }
}
