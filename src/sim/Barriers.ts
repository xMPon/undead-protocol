// Board-up barriers. Every barrier in an active region carries a plank count:
// zombies tear planks off to get in, the player nails them back on for points.
// Pure state + rules, indexed by position in `MapDef.barriers`, so both the
// simulation and the two renderers read the same numbers.

/** Planks on an intact barrier. */
export const MAX_BOARDS = 4;
/** Seconds a zombie spends on each plank it rips away. */
export const BOARD_TEAR_TIME = 0.9;
/** Seconds the player holds the interact key per plank rebuilt. */
export const BOARD_REPAIR_TIME = 0.55;

export class Boards {
  private counts: number[];

  constructor(count: number, start = MAX_BOARDS) {
    this.counts = new Array<number>(count).fill(start);
  }

  get length(): number {
    return this.counts.length;
  }

  /** Planks still on barrier `i` (0 when it has been torn open). */
  at(i: number): number {
    return this.counts[i] ?? 0;
  }

  /** Nothing left to climb through — a zombie can walk straight in. */
  isOpen(i: number): boolean {
    return this.at(i) <= 0;
  }

  /** Rip one plank off. Returns false when there was nothing left to tear. */
  tear(i: number): boolean {
    if (this.at(i) <= 0) return false;
    this.counts[i]--;
    return true;
  }

  /** Nail one plank back on. Returns false when the barrier is already whole. */
  repair(i: number): boolean {
    if (i < 0 || i >= this.counts.length) return false;
    if (this.counts[i] >= MAX_BOARDS) return false;
    this.counts[i]++;
    return true;
  }

  /** Whether barrier `i` has room for another plank. */
  needsRepair(i: number): boolean {
    return i >= 0 && i < this.counts.length && this.counts[i] < MAX_BOARDS;
  }
}
