// Round state machine + difficulty scaling. The World ticks it each frame and
// reacts to the "start"/"end" transitions; the scaling formulas are exported
// pure functions so the curve is unit-testable.

export const INTERMISSION = 6.5; // seconds of calm between rounds
export const FIRST_ROUND_DELAY = 3; // countdown before round 1
export const ON_MAP_CAP = 24; // simultaneous live zombies

/**
 * Per-zombie health. Black-Ops-style: linear +100/round through round 9, then
 * compounding +10%/round thereafter.
 */
export function zombieHealth(round: number): number {
  if (round <= 1) return 150;
  if (round <= 9) return 150 + (round - 1) * 100;
  let h = 950; // round 9
  for (let r = 10; r <= round; r++) h = Math.round(h * 1.1);
  return h;
}

/** Zombies spawned in a round (solo curve), capped. */
export function zombieCount(round: number, cap = 24): number {
  return Math.min(cap, 6 + Math.max(0, round - 1) * 3);
}

export type RoundEvent = "start" | "end" | null;
export type RoundPhase = "intermission" | "active";

export class RoundManager {
  round = 0;
  phase: RoundPhase = "intermission";
  timer = FIRST_ROUND_DELAY;
  toSpawn = 0;
  spawnHealth = 0;
  totalThisRound = 0;
  private cap: number;

  constructor(cap = ON_MAP_CAP) {
    this.cap = cap;
  }

  /** Advance the clock. `aliveCount` is the current live-zombie count. */
  tick(dt: number, aliveCount: number): RoundEvent {
    if (this.phase === "intermission") {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.beginRound(this.round + 1);
        return "start";
      }
      return null;
    }
    // active: round ends once everything is spawned and cleared
    if (this.toSpawn <= 0 && aliveCount <= 0) {
      this.phase = "intermission";
      this.timer = INTERMISSION;
      return "end";
    }
    return null;
  }

  private beginRound(n: number): void {
    this.round = n;
    this.phase = "active";
    this.toSpawn = zombieCount(n, this.cap);
    this.totalThisRound = this.toSpawn;
    this.spawnHealth = zombieHealth(n);
  }

  /** The spawner calls this when it actually creates a zombie. */
  markSpawned(): void {
    if (this.toSpawn > 0) this.toSpawn--;
  }
}
