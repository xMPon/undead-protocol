// Deterministic randomness helpers, mirroring blockcraft's rng contract.
// Anything that should be reproducible (spread patterns in tests, mystery-box
// draws later) flows through these rather than Math.random().

/** mulberry32 PRNG — returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless integer hash to [0, 1). */
export function hash01(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A small default random source for gameplay jitter (non-reproducible). */
export const rand = Math.random;

/** Random float in [min, max). */
export function randRange(min: number, max: number, r: () => number = rand): number {
  return min + (max - min) * r();
}

/** Random integer in [min, max] inclusive. */
export function randInt(min: number, max: number, r: () => number = rand): number {
  return Math.floor(min + (max - min + 1) * r());
}
