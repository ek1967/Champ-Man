import { describe, expect, it } from 'vitest';
import { ALL_ATTRIBUTES } from '@moc/engine';
import { percentiles, potentialHeadroom, type RatingInput, ratePlayer } from '../src/ratings.ts';

function input(overrides: Partial<RatingInput> & { id: string }): RatingInput {
  return {
    group: 'MID',
    price: 6,
    age: 26,
    clubTier: 3,
    minutesNow: 0.5,
    minutesLast: 0.5,
    per90Minutes: 1500,
    per90: { xg: 0.2, xa: 0.15, threat: 30, creativity: 30, tackles: 1.5, cbi: 1.5, recoveries: 5, bps: 18 },
    setPieces: { corners: null, freeKicks: null, penalties: null },
    ...overrides,
  };
}

// A small league of made-up players: the model compares players with each other.
const pool = [
  input({ id: 'star', price: 11, minutesNow: 1, minutesLast: 0.95, clubTier: 5, per90: { xg: 0.5, xa: 0.35, threat: 70, creativity: 60, tackles: 1, cbi: 0.5, recoveries: 4, bps: 26 } }),
  input({ id: 'regular', price: 6.5 }),
  input({ id: 'fringe', price: 4.5, minutesNow: 0.05, minutesLast: 0.1 }),
  input({ id: 'prospect', price: 4.5, age: 18, minutesNow: 0, minutesLast: null, per90: null, per90Minutes: 0 }),
  input({ id: 'cb', group: 'DEF', price: 5.5, per90: { xg: 0.05, xa: 0.02, threat: 5, creativity: 5, tackles: 2, cbi: 9, recoveries: 6, bps: 22 } }),
  input({ id: 'fb', group: 'DEF', price: 5, per90: { xg: 0.05, xa: 0.2, threat: 15, creativity: 35, tackles: 2.5, cbi: 2, recoveries: 6, bps: 20 } }),
  input({ id: 'gk', group: 'GK', price: 5, minutesNow: 1, minutesLast: 1 }),
];
const pct = percentiles(pool);
const rate = (id: string) => ratePlayer(pool.find((p) => p.id === id)!, pct.get(id));

describe('rating model', () => {
  it('ranks an elite regular above a squad player above a fringe player', () => {
    expect(rate('star').ca).toBeGreaterThan(rate('regular').ca);
    expect(rate('regular').ca).toBeGreaterThan(rate('fringe').ca);
  });

  it('marks unproven teenagers as prospects with room to grow', () => {
    const prospect = rate('prospect');
    expect(prospect.ca).toBeLessThan(rate('regular').ca);
    expect(prospect.potentialHeadroom).toBeGreaterThan(30);
  });

  it('tells centre-backs from full-backs by playing style', () => {
    expect(rate('cb').positions.DC).toBe(20);
    const fb = rate('fb').positions;
    expect(fb.DL === 20 || fb.DR === 20).toBe(true);
  });

  it('gives goalkeepers the goalkeeper position only', () => {
    expect(rate('gk').positions).toEqual({ GK: 20 });
  });

  it('keeps every attribute within 1–20 and is deterministic', () => {
    const a = rate('star');
    for (const key of ALL_ATTRIBUTES) {
      expect(a.attributes[key]).toBeGreaterThanOrEqual(1);
      expect(a.attributes[key]).toBeLessThanOrEqual(20);
    }
    expect(rate('star')).toEqual(a);
  });

  it('shrinks potential headroom with age and never passes 200', () => {
    expect(potentialHeadroom(18, 120)).toBeGreaterThan(potentialHeadroom(24, 120));
    expect(potentialHeadroom(30, 150)).toBe(0);
    expect(potentialHeadroom(17, 190)).toBeLessThanOrEqual(10);
  });
});
