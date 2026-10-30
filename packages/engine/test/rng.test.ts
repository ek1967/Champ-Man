import { describe, expect, it } from 'vitest';
import { createRng, poisson, random, randInt, shuffle } from '../src/rng.ts';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng('seed');
    const b = createRng('seed');
    for (let i = 0; i < 100; i++) expect(random(a)).toBe(random(b));
  });

  it('differs between seeds', () => {
    expect(random(createRng('one'))).not.toBe(random(createRng('two')));
  });

  it('resumes exactly from a copied state (save/load)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 10; i++) random(rng);
    const copy = JSON.parse(JSON.stringify(rng));
    for (let i = 0; i < 50; i++) expect(random(copy)).toBe(random(rng));
  });

  it('stays in range', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const f = random(rng);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = randInt(rng, 3, 5);
      expect(n === 3 || n === 4 || n === 5).toBe(true);
    }
  });

  it('produces Poisson counts with the right mean', () => {
    const rng = createRng(1);
    let total = 0;
    for (let i = 0; i < 20_000; i++) total += poisson(rng, 1.4);
    expect(total / 20_000).toBeCloseTo(1.4, 1);
  });

  it('shuffles without losing items', () => {
    const items = shuffle(createRng(3), [1, 2, 3, 4, 5, 6]);
    expect([...items].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
