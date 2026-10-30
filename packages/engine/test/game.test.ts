import { describe, expect, it } from 'vitest';
import { advanceDay, continueGame, createGame, humanFixtureOn, takeJob } from '../src/game.ts';
import { currentSeasonOf, seasonFixtures, seasonsOf } from '../src/queries.ts';
import { deserializeGame, serializeGame } from '../src/save.ts';
import { DEMO_SECOND_DIVISION, DEMO_TOP_DIVISION } from '../src/worldgen.ts';

function playUntil(state: ReturnType<typeof createGame>, date: string): void {
  while (state.date < date) advanceDay(state);
}

describe('a full season', () => {
  const state = createGame({ seed: 'season-test', managerName: 'Test' });
  const firstTop = currentSeasonOf(state, DEMO_TOP_DIVISION)!;
  const firstSecond = currentSeasonOf(state, DEMO_SECOND_DIVISION)!;
  playUntil(state, '2027-06-25');

  it('plays every fixture and records a final table', () => {
    for (const season of [firstTop, firstSecond]) {
      expect(seasonFixtures(state, season).every((f) => f.result !== null)).toBe(true);
      expect(season.status).toBe('finished');
      expect(season.final?.order).toHaveLength(20);
    }
  });

  it('starts the next season with three clubs swapped each way', () => {
    const nextTop = currentSeasonOf(state, DEMO_TOP_DIVISION)!;
    const nextSecond = currentSeasonOf(state, DEMO_SECOND_DIVISION)!;
    expect(nextTop.label).toBe('2027-28');
    expect(nextSecond.label).toBe('2027-28');
    const relegated = firstTop.final!.order.slice(-3);
    const promoted = firstSecond.final!.order.slice(0, 3);
    expect(nextTop.clubIds).toHaveLength(20);
    expect(nextSecond.clubIds).toHaveLength(20);
    for (const id of promoted) {
      expect(nextTop.clubIds).toContain(id);
      expect(state.world.clubs[id]!.leagueId).toBe(DEMO_TOP_DIVISION);
    }
    for (const id of relegated) {
      expect(nextSecond.clubIds).toContain(id);
      expect(state.world.clubs[id]!.leagueId).toBe(DEMO_SECOND_DIVISION);
    }
  });

  it('keeps old seasons for history', () => {
    expect(seasonsOf(state, DEMO_TOP_DIVISION).map((s) => s.label)).toEqual(['2027-28', '2026-27']);
  });
});

describe('continueGame', () => {
  it('stops on match day, then plays the match', () => {
    const state = createGame({ seed: 'continue-test', managerName: 'Test' });
    const clubId = currentSeasonOf(state, DEMO_TOP_DIVISION)!.clubIds[0]!;
    takeJob(state, clubId);
    let reason = continueGame(state);
    let guard = 0;
    while (reason !== 'matchDay' && guard++ < 50) reason = continueGame(state);
    expect(reason).toBe('matchDay');
    const fixture = humanFixtureOn(state, state.date)!;
    expect(fixture.result).toBeNull();
    expect(continueGame(state)).toBe('matchPlayed');
    expect(fixture.result).not.toBeNull();
    expect(state.news[0]!.category).toBe('result');
  });
});

describe('saves', () => {
  it('round-trip and continue identically', () => {
    const original = createGame({ seed: 'save-test', managerName: 'Test' });
    playUntil(original, '2026-10-01');
    const loaded = deserializeGame(serializeGame(original));
    playUntil(original, '2026-12-01');
    playUntil(loaded, '2026-12-01');
    expect(serializeGame(loaded)).toBe(serializeGame(original));
  });

  it('rejects files that are not saves', () => {
    expect(() => deserializeGame('{"hello":1}')).toThrow();
  });
});
