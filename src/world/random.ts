/** Reproducible integer PRNG; no Math.random is used in world generation. */
export function seededRandom(seed: number): () => number {
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function coordinateSeed(seed: number, x: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ seed;
  h = Math.imul(h ^ h >>> 13, 1274126177); return (h ^ h >>> 16) >>> 0;
}
export function smoothstep(a: number, b: number, n: number): number { const t = Math.max(0, Math.min(1, (n - a) / (b - a))); return t * t * (3 - 2 * t); }
export function latticeNoise(seed: number, x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), tx = smoothstep(0, 1, x - ix), tz = smoothstep(0, 1, z - iz);
  const v = (px: number, pz: number) => coordinateSeed(seed, px, pz) / 4294967295 * 2 - 1;
  const a = v(ix, iz) * (1 - tx) + v(ix + 1, iz) * tx, b = v(ix, iz + 1) * (1 - tx) + v(ix + 1, iz + 1) * tx;
  return a * (1 - tz) + b * tz;
}
