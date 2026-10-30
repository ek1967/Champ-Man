import { describe, expect, it } from 'vitest';
import { ENGLISH_STYLE_TIEBREAKERS, HEAD_TO_HEAD_FIRST_TIEBREAKERS, type LeagueRules } from '../src/rules.ts';
import { computeTable } from '../src/standings.ts';
import type { Fixture } from '../src/types.ts';

function rules(tieBreakers: LeagueRules['tieBreakers']): LeagueRules {
  return {
    format: 'league', rounds: 2, points: { win: 3, draw: 1, loss: 0 }, tieBreakers,
    season: { calendar: 'aug-may', start: '08-01', end: '05-31', rollover: '06-20', blocked: [] },
    zones: [],
  };
}

let n = 0;
function match(homeId: string, awayId: string, homeGoals: number, awayGoals: number): Fixture {
  n++;
  return {
    id: `f${n}`, competitionId: 'x', seasonId: 'x', round: n, date: `2026-09-${String(n).padStart(2, '0')}`,
    homeId, awayId, result: { homeGoals, awayGoals, goals: [] },
  };
}

// C wins the league. A and B finish level on 4 points: A has the better goal difference,
// B won the head-to-head.
const fixtures = [
  match('A', 'C', 5, 0),
  match('B', 'A', 1, 0),
  match('C', 'B', 1, 0),
  match('A', 'B', 0, 0),
  match('C', 'A', 2, 1),
  match('B', 'C', 1, 2),
];

describe('computeTable', () => {
  it('counts played, points and goals', () => {
    const table = computeTable(['A', 'B', 'C'], fixtures, rules(ENGLISH_STYLE_TIEBREAKERS));
    const a = table.find((r) => r.clubId === 'A')!;
    expect(a).toMatchObject({ played: 4, won: 1, drawn: 1, lost: 2, goalsFor: 6, goalsAgainst: 3, points: 4 });
    expect(a.form).toEqual(['W', 'L', 'D', 'L']);
  });

  it('uses goal difference first in English-style leagues', () => {
    const table = computeTable(['A', 'B', 'C'], fixtures, rules(ENGLISH_STYLE_TIEBREAKERS));
    expect(table.map((r) => r.clubId)).toEqual(['C', 'A', 'B']);
  });

  it('uses head-to-head first in Spanish/Italian-style leagues', () => {
    const table = computeTable(['A', 'B', 'C'], fixtures, rules(HEAD_TO_HEAD_FIRST_TIEBREAKERS));
    expect(table.map((r) => r.clubId)).toEqual(['C', 'B', 'A']);
  });

  it('falls back to name order when everything is level', () => {
    const table = computeTable(['Z', 'Y'], [], rules(ENGLISH_STYLE_TIEBREAKERS), (id) => (id === 'Z' ? 'Alpha' : 'Beta'));
    expect(table.map((r) => r.clubId)).toEqual(['Z', 'Y']);
  });
});
