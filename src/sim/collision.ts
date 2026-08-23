// Pure geometry: circle-vs-rectangle resolution (entity movement) and ray
// intersection (hitscan bullets, line-of-sight). No DOM, no three.js.

import type { Vec2 } from "../core/math";
import { clamp } from "../core/math";
import type { WallRect, Obstacle } from "./types";

/** True if the point lies strictly inside the rectangle. */
export function pointInRect(x: number, y: number, r: WallRect): boolean {
  return x > r.minX && x < r.maxX && y > r.minY && y < r.maxY;
}

/**
 * Push a circle (centre `pos`, `radius`) out of every rectangle it overlaps.
 * Returns a corrected position. Two passes handle wedging into corners.
 */
export function resolveCircleRects(pos: Vec2, radius: number, rects: WallRect[]): Vec2 {
  const p = { x: pos.x, y: pos.y };
  for (let pass = 0; pass < 2; pass++) {
    for (const r of rects) {
      const cx = clamp(p.x, r.minX, r.maxX);
      const cy = clamp(p.y, r.minY, r.maxY);
      if (pointInRect(p.x, p.y, r)) {
        // Centre buried inside the rect — eject along the shallowest face.
        const left = p.x - r.minX;
        const right = r.maxX - p.x;
        const top = p.y - r.minY;
        const bottom = r.maxY - p.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) p.x = r.minX - radius;
        else if (m === right) p.x = r.maxX + radius;
        else if (m === top) p.y = r.minY - radius;
        else p.y = r.maxY + radius;
        continue;
      }
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < radius * radius) {
        const d = Math.sqrt(d2);
        if (d > 1e-6) {
          const push = radius - d;
          p.x += (dx / d) * push;
          p.y += (dy / d) * push;
        } else {
          p.x = cx + radius; // degenerate: shove east
        }
      }
    }
  }
  return p;
}

/**
 * Height-aware circle resolution: an obstacle only blocks the circle when its
 * top rises above the circle's feet (footY). Obstacles the entity is standing on
 * or above are ignored, so a jumper can move across their tops.
 */
export function resolveCircleObstacles(pos: Vec2, radius: number, footY: number, obstacles: Obstacle[], clear = 0.05): Vec2 {
  const active: WallRect[] = [];
  for (const o of obstacles) if (o.top > footY + clear) active.push(o.rect);
  return resolveCircleRects(pos, radius, active);
}

/**
 * Highest support surface under a point: the ground, or the top of any obstacle
 * the point is over that is at/below the feet (within a small step tolerance).
 */
export function supportHeight(pos: Vec2, footY: number, groundY: number, obstacles: Obstacle[], step = 0.3): number {
  let s = groundY;
  for (const o of obstacles) {
    if (o.top <= footY + step && o.top > s && pointInRect(pos.x, pos.y, o.rect)) s = o.top;
  }
  return s;
}

/**
 * Ray (unit `dir`) vs AABB. Returns the entry distance t >= 0, or null.
 */
export function rayVsRect(ox: number, oy: number, dx: number, dy: number, r: WallRect): number | null {
  const invx = dx !== 0 ? 1 / dx : Infinity;
  const invy = dy !== 0 ? 1 / dy : Infinity;
  let t1 = (r.minX - ox) * invx;
  let t2 = (r.maxX - ox) * invx;
  let t3 = (r.minY - oy) * invy;
  let t4 = (r.maxY - oy) * invy;
  if (t1 > t2) [t1, t2] = [t2, t1];
  if (t3 > t4) [t3, t4] = [t4, t3];
  const tEnter = Math.max(t1, t3);
  const tExit = Math.min(t2, t4);
  if (tExit < 0 || tEnter > tExit) return null;
  return tEnter >= 0 ? tEnter : null;
}

/**
 * Ray (unit `dir`) vs circle. Returns distance t >= 0 to the first hit, or null.
 */
export function rayVsCircle(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  radius: number,
): number | null {
  const ocx = ox - cx;
  const ocy = oy - cy;
  const b = dx * ocx + dy * ocy;
  const c = ocx * ocx + ocy * ocy - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  return t >= 0 ? t : null;
}

/** Nearest wall distance along a ray, or Infinity if it hits nothing. */
export function nearestWallDist(ox: number, oy: number, dx: number, dy: number, rects: WallRect[]): number {
  let best = Infinity;
  for (const r of rects) {
    const t = rayVsRect(ox, oy, dx, dy, r);
    if (t !== null && t < best) best = t;
  }
  return best;
}

/**
 * Clamp a circle into the union of `zones`: free wherever it already fits in one,
 * otherwise pulled into the nearest. A single bounding rect cannot cage an
 * L-shaped compound without also covering the ground outside its barrier gaps,
 * so the cage is a list of overlapping wings instead.
 */
export function clampToZones(p: Vec2, radius: number, zones: WallRect[]): Vec2 {
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const z of zones) {
    const cx = clamp(p.x, z.minX + radius, z.maxX - radius);
    const cy = clamp(p.y, z.minY + radius, z.maxY - radius);
    const d = (cx - p.x) ** 2 + (cy - p.y) ** 2;
    if (d === 0) return p; // already legal somewhere — leave it alone
    if (d < bestD) {
      bestD = d;
      best = { x: cx, y: cy };
    }
  }
  return best ?? p;
}
