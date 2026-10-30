import { describe, expect, it } from 'vitest';
import { dayOfWeek } from '../src/dates.ts';
import { blockedRangesForSeason, roundRobin, scheduleRoundDates } from '../src/fixtures.ts';
import { createRng } from '../src/rng.ts';
import { EUROPEAN_INTERNATIONAL_BREAKS } from '../src/rules.ts';

const clubs = Array.from({ length: 20 }, (_, i) => `c${i + 1}`);

describe('roundRobin', () => {
  const schedule = roundRobin(createRng('fixtures'), clubs, 2);

  it('has 38 rounds of 10 matches', () => {
    expect(schedule).toHaveLength(38);
    for (const round of schedule) expect(round).toHaveLength(10);
  });

  it('has every club play exactly once per round', () => {
    for (const round of schedule) {
      const seen = round.flatMap(([h, a]) => [h, a]);
      expect(new Set(seen).size).toBe(20);
    }
  });

  it('has every pair meet once at each ground', () => {
    const meetings = new Map<string, number>();
    for (const round of schedule) {
      for (const [h, a] of round) meetings.set(`${h}>${a}`, (meetings.get(`${h}>${a}`) ?? 0) + 1);
    }
    expect(meetings.size).toBe(20 * 19);
    for (const count of meetings.values()) expect(count).toBe(1);
  });

  it('avoids long runs of home or away games', () => {
    for (const club of clubs) {
      let run = 0;
      let last = '';
      let longest = 0;
      for (const round of schedule) {
        const match = round.find(([h, a]) => h === club || a === club);
        const venue = match?.[0] === club ? 'H' : 'A';
        run = venue === last ? run + 1 : 1;
        last = venue;
        longest = Math.max(longest, run);
      }
      expect(longest).toBeLessThanOrEqual(3);
    }
  });

  it('handles an odd number of clubs with byes', () => {
    const odd = roundRobin(createRng(1), clubs.slice(0, 5), 2);
    const games = odd.flat();
    expect(games).toHaveLength(5 * 4);
  });
});

describe('scheduleRoundDates', () => {
  const blocked = blockedRangesForSeason(EUROPEAN_INTERNATIONAL_BREAKS, 2026, 'aug-may');
  const dates = scheduleRoundDates('2026-08-15', '2027-05-22', 38, blocked);

  it('returns one date per round, in order, inside the season', () => {
    expect(dates).toHaveLength(38);
    expect([...dates].sort()).toEqual(dates);
    expect(dates[0]).toBe('2026-08-15');
    expect(dates[37]! <= '2027-05-22').toBe(true);
  });

  it('keeps international breaks free', () => {
    for (const d of dates) {
      for (const [from, to] of blocked) expect(d >= from && d <= to).toBe(false);
    }
  });

  it('uses weekends, adding midweek rounds only when needed', () => {
    for (const d of dates) expect([3, 6]).toContain(dayOfWeek(d));
    const crowded = scheduleRoundDates('2026-08-15', '2026-12-31', 30, blocked);
    expect(crowded).toHaveLength(30);
    expect(crowded.some((d) => dayOfWeek(d) === 3)).toBe(true);
  });
});
