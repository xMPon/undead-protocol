// A coarse grid flow-field: BFS out from the player over walkable cells, then
// each cell stores a unit vector toward its lowest-distance neighbour. Zombies
// sample it to steer around walls and funnel through doorways, without every
// zombie running its own pathfind. Pure and DOM-free.

import type { Vec2 } from "../core/math";
import { norm, sub } from "../core/math";
import type { WallRect } from "./types";

const NEIGH: Array<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export class FlowField {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly ox: number;
  readonly oy: number;
  private blocked: Uint8Array;
  private dist: Float32Array;
  private fx: Float32Array;
  private fy: Float32Array;
  private goal: Vec2 = { x: 0, y: 0 };

  constructor(bounds: WallRect, cell = 1) {
    this.cell = cell;
    this.ox = bounds.minX;
    this.oy = bounds.minY;
    this.cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
    this.rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / cell));
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.dist = new Float32Array(n);
    this.fx = new Float32Array(n);
    this.fy = new Float32Array(n);
  }

  private idx(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }
  private cellOf(p: Vec2): [number, number] {
    const cx = Math.floor((p.x - this.ox) / this.cell);
    const cy = Math.floor((p.y - this.oy) / this.cell);
    return [cx, cy];
  }
  private inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows;
  }
  private centre(cx: number, cy: number): Vec2 {
    return { x: this.ox + (cx + 0.5) * this.cell, y: this.oy + (cy + 0.5) * this.cell };
  }

  /** Recompute walkability. `inflate` widens walls so zombies keep clear. */
  rebuild(rects: WallRect[], inflate = 0.45): void {
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const c = this.centre(cx, cy);
        let solid = false;
        for (const r of rects) {
          if (c.x > r.minX - inflate && c.x < r.maxX + inflate && c.y > r.minY - inflate && c.y < r.maxY + inflate) {
            solid = true;
            break;
          }
        }
        this.blocked[this.idx(cx, cy)] = solid ? 1 : 0;
      }
    }
  }

  /** BFS from the goal cell, then derive a flow vector for every reachable cell. */
  compute(goal: Vec2): void {
    this.goal = goal;
    this.dist.fill(Infinity);
    let [gx, gy] = this.cellOf(goal);
    gx = Math.min(this.cols - 1, Math.max(0, gx));
    gy = Math.min(this.rows - 1, Math.max(0, gy));
    // If the player is standing on an inflated wall cell, snap to a free one.
    if (this.blocked[this.idx(gx, gy)]) {
      const found = this.nearestFree(gx, gy);
      if (found) [gx, gy] = found;
    }

    const queue: number[] = [];
    const start = this.idx(gx, gy);
    this.dist[start] = 0;
    queue.push(start);
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      const cx = cur % this.cols;
      const cy = (cur - cx) / this.cols;
      const nd = this.dist[cur] + 1;
      for (const [ox, oy] of NEIGH) {
        const nx = cx + ox;
        const ny = cy + oy;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (this.blocked[ni] || this.dist[ni] <= nd) continue;
        this.dist[ni] = nd;
        queue.push(ni);
      }
    }

    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const i = this.idx(cx, cy);
        this.fx[i] = 0;
        this.fy[i] = 0;
        if (this.blocked[i] || !isFinite(this.dist[i])) continue;
        let best = this.dist[i];
        let bx = 0;
        let by = 0;
        for (const [ox, oy] of NEIGH) {
          const nx = cx + ox;
          const ny = cy + oy;
          if (!this.inBounds(nx, ny)) continue;
          const nd = this.dist[this.idx(nx, ny)];
          if (nd < best) {
            best = nd;
            bx = ox;
            by = oy;
          }
        }
        const n = norm({ x: bx, y: by });
        this.fx[i] = n.x;
        this.fy[i] = n.y;
      }
    }
  }

  private nearestFree(cx: number, cy: number): [number, number] | null {
    for (let radius = 1; radius < 6; radius++) {
      for (let oy = -radius; oy <= radius; oy++) {
        for (let ox = -radius; ox <= radius; ox++) {
          const nx = cx + ox;
          const ny = cy + oy;
          if (this.inBounds(nx, ny) && !this.blocked[this.idx(nx, ny)]) return [nx, ny];
        }
      }
    }
    return null;
  }

  /** Steering direction toward the player from a world position. */
  sample(p: Vec2): Vec2 {
    const [cx, cy] = this.cellOf(p);
    if (this.inBounds(cx, cy)) {
      const i = this.idx(cx, cy);
      if (this.fx[i] !== 0 || this.fy[i] !== 0) return { x: this.fx[i], y: this.fy[i] };
    }
    // Off-grid or in an unreachable pocket: head straight at the goal.
    return norm(sub(this.goal, p));
  }
}
