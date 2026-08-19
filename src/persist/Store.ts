// Tiny persistence: the best round reached, in localStorage. Phase 1 only needs
// a high score; later phases can extend this to settings/loadouts.

const KEY = "undead-protocol:best-round";

export const Store = {
  getBest(): number {
    const raw = localStorage.getItem(KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  },
  /** Record `round` if it beats the stored best; returns the current best. */
  submit(round: number): number {
    const best = Store.getBest();
    if (round > best) {
      localStorage.setItem(KEY, String(round));
      return round;
    }
    return best;
  },
};
