/** A small seeded random source (mulberry32), so a worksheet seed always reproduces the same problems. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Integer from min to max, inclusive. */
  int(min: number, max: number): number;
  /** Integer from min to max, inclusive, never zero. */
  nonZero(min: number, max: number): number;
  /** Random sign: 1 or -1. */
  sign(): 1 | -1;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

export const MAX_SEED = 0xffffffff;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    nonZero(min, max) {
      for (;;) {
        const value = int(min, max);
        if (value !== 0) return value;
      }
    },
    sign: () => (next() < 0.5 ? -1 : 1),
    pick: (items) => items[Math.floor(next() * items.length)],
    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** Derive a stable per-problem seed from a worksheet seed and the problem's position. */
export function deriveSeed(seed: number, ...parts: Array<string | number>): number {
  let hash = (seed ^ 0x811c9dc5) >>> 0;
  for (const char of parts.join('|')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
