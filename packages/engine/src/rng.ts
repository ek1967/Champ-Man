/**
 * Seeded pseudo-random number generator (sfc32).
 * The state is plain data so it can be saved and restored exactly,
 * which makes every match and season reproducible from a save.
 */
export interface Rng {
  s: [number, number, number, number];
}

/** FNV-1a hash, used to turn string seeds into numbers. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRng(seed: number | string): Rng {
  let h = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  const splitmix = (): number => {
    h = (h + 0x9e3779b9) | 0;
    let t = h ^ (h >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
  const rng: Rng = { s: [splitmix(), splitmix(), splitmix(), splitmix()] };
  for (let i = 0; i < 12; i++) nextU32(rng);
  return rng;
}

export function nextU32(rng: Rng): number {
  let [a, b, c, d] = rng.s;
  const t = (((a + b) | 0) + d + 1) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  rng.s[0] = a;
  rng.s[1] = b;
  rng.s[2] = c;
  rng.s[3] = d;
  return t >>> 0;
}

/** Uniform float in [0, 1). */
export function random(rng: Rng): number {
  return nextU32(rng) / 4294967296;
}

/** Uniform integer in [min, max] inclusive. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(random(rng) * (max - min + 1));
}

export function chance(rng: Rng, probability: number): boolean {
  return random(rng) < probability;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() from empty list');
  return items[Math.floor(random(rng) * items.length)] as T;
}

export function weightedPick<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  let total = 0;
  for (const item of items) total += Math.max(0, weight(item));
  if (total <= 0) return pick(rng, items);
  let roll = random(rng) * total;
  for (const item of items) {
    roll -= Math.max(0, weight(item));
    if (roll < 0) return item;
  }
  return items[items.length - 1] as T;
}

/** Normally distributed value (Box–Muller). */
export function normal(rng: Rng, mean = 0, sd = 1): number {
  const u = 1 - random(rng);
  const v = random(rng);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Poisson-distributed count (Knuth); fine for the small means used in football. */
export function poisson(rng: Rng, lambda: number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = random(rng);
  while (p > limit) {
    k++;
    p *= random(rng);
  }
  return k;
}

/** Shuffles in place and returns the same array. */
export function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random(rng) * (i + 1));
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
  return items;
}

/** Derives an independent generator, so sub-systems don't disturb each other's sequences. */
export function forkRng(rng: Rng): Rng {
  return createRng(nextU32(rng) ^ nextU32(rng));
}
