// Spawn pacing. The gate is a pure predicate (easy to test); the World owns the
// rng and the barrier list, and calls the gate each frame to decide whether to
// breach another zombie.

import type { RoundPhase } from "./Round";
import { ON_MAP_CAP } from "./Round";

/** Base seconds between breaches; tightens as rounds climb. */
export function spawnInterval(round: number): number {
  return Math.max(0.35, 2.2 - round * 0.12);
}

/**
 * May the spawner breach a zombie this frame?
 * Requires: round active, budget remaining, under the on-map cap, cadence ready.
 */
export function spawnGate(
  phase: RoundPhase,
  toSpawn: number,
  aliveCount: number,
  spawnCooldown: number,
  cap = ON_MAP_CAP,
): boolean {
  return phase === "active" && toSpawn > 0 && aliveCount < cap && spawnCooldown <= 0;
}
