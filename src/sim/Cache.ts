// "The Cache" — the mystery box. Pay in, watch it cycle, and take whatever it
// lands on before the lid closes again. It moves on after a few uses, so a run
// cannot settle into farming one corner of the map.
//
// A pure state machine over an injected random source: no DOM, no timers of its
// own, and seedable, so a test can roll a box a thousand times and know what it
// should have produced.

export const CACHE_COST = 950;
/** Seconds the lid cycles through weapons before it settles. */
export const SPIN_TIME = 2.6;
/** Seconds the settled weapon hangs there waiting to be taken. */
export const OFFER_TIME = 7;
/** Seconds the lid takes to shut once the offer lapses or is taken. */
export const CLOSE_TIME = 1.1;
/** Seconds between the weapon on show changing while it spins. */
export const CYCLE_INTERVAL = 0.14;

export type CacheState = "idle" | "spinning" | "offering" | "closing";
/** What just happened, for audio and the HUD. */
export type CacheEvent = "reveal" | "withdraw" | "relocate" | null;

export class Cache {
  /** Index into the map's `cacheSites` — which one the box is sitting on. */
  site = 0;
  state: CacheState = "idle";
  /** Seconds left in the current state. */
  timer = 0;
  /** Weapon id currently displayed above the box (spinning or settled). */
  display: string;
  /** Uses left before the box packs up and moves. */
  usesLeft: number;

  private readonly pool: string[];
  private readonly rng: () => number;
  private cycleTimer = 0;
  /** Set when the box should move; World picks the destination it can reach. */
  wantsRelocate = false;

  constructor(pool: string[], rng: () => number) {
    if (pool.length === 0) throw new Error("The Cache needs at least one weapon in its pool");
    this.pool = pool;
    this.rng = rng;
    this.display = pool[0];
    this.usesLeft = this.rollUses();
  }

  /** 4–7 draws before it moves on. */
  private rollUses(): number {
    return 4 + Math.floor(this.rng() * 4);
  }

  private draw(): string {
    return this.pool[Math.floor(this.rng() * this.pool.length) % this.pool.length];
  }

  /** Whether a player standing here could pay to open it right now. */
  get isIdle(): boolean {
    return this.state === "idle";
  }
  /** Whether the settled weapon is there for the taking. */
  get isOffering(): boolean {
    return this.state === "offering";
  }

  /** Pay-in. Returns false when the box is already busy. */
  open(): boolean {
    if (this.state !== "idle") return false;
    this.state = "spinning";
    this.timer = SPIN_TIME;
    this.cycleTimer = 0;
    return true;
  }

  /**
   * Take the settled weapon. Returns its id, or null when nothing is on offer.
   * Taking it spends one of the box's remaining uses.
   */
  take(): string | null {
    if (this.state !== "offering") return null;
    const id = this.display;
    this.state = "closing";
    this.timer = CLOSE_TIME;
    this.spendUse();
    return id;
  }

  private spendUse(): void {
    this.usesLeft--;
    if (this.usesLeft <= 0) this.wantsRelocate = true;
  }

  /** Advance the box's own clock. */
  tick(dt: number): CacheEvent {
    if (this.state === "idle") return null;
    this.timer -= dt;

    if (this.state === "spinning") {
      this.cycleTimer -= dt;
      if (this.cycleTimer <= 0) {
        this.display = this.draw();
        this.cycleTimer = CYCLE_INTERVAL;
      }
      if (this.timer <= 0) {
        this.display = this.draw();
        this.state = "offering";
        this.timer = OFFER_TIME;
        return "reveal";
      }
      return null;
    }

    if (this.state === "offering" && this.timer <= 0) {
      // Left too long: the lid shuts and the draw is spent anyway.
      this.state = "closing";
      this.timer = CLOSE_TIME;
      this.spendUse();
      return "withdraw";
    }

    if (this.state === "closing" && this.timer <= 0) {
      this.state = "idle";
      this.timer = 0;
      if (this.wantsRelocate) return "relocate";
    }
    return null;
  }

  /** Move to `site` and start a fresh run of uses. */
  relocate(site: number): void {
    this.site = site;
    this.wantsRelocate = false;
    this.usesLeft = this.rollUses();
    this.state = "idle";
    this.timer = 0;
  }
}
