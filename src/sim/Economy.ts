// Points economy — pure rules so they can be unit-tested in isolation.
// The player earns points for landing hits and (more) for kills, and spends
// them on wall-buys and doors.

export const POINTS_HIT = 10;
export const POINTS_KILL = 60;
export const START_POINTS = 500;

export function canAfford(points: number, cost: number): boolean {
  return points >= cost;
}

export interface SpendResult {
  ok: boolean;
  points: number;
}

/** Attempt to spend `cost`. Never goes negative; reports success. */
export function spend(points: number, cost: number): SpendResult {
  if (points < cost) return { ok: false, points };
  return { ok: true, points: points - cost };
}
