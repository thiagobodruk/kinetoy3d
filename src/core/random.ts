// Shared random source for animation layers. By default it's seeded randomly; setting a
// seed (e.g. `?seed=1` in the URL) makes every random choice repeatable, which the
// render tool relies on for pixel-identical captures.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let next = mulberry32((Math.random() * 2 ** 32) >>> 0);

/** Uniform random number in [0, 1). */
export const random = (): number => next();

/** Restarts the sequence from a fixed seed. */
export function setSeed(seed: number): void { next = mulberry32(seed); }
