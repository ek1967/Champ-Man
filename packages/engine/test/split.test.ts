import { describe, expect, it } from 'vitest';
import { advanceDay, boardExpectation, createGame } from '../src/game.ts';
import { mergePacks, type PackPlayer, validatePack, type WorldPack } from '../src/pack.ts';
import { currentSeasonOf, seasonFixtures, seasonTable } from '../src/queries.ts';
import { createRng } from '../src/rng.ts';
import { createDemoWorld, DEMO_SECOND_DIVISION, DEMO_TOP_DIVISION } from '../src/worldgen.ts';

/** The demo world cut down to Scottish shape: 12 clubs that split after 33 rounds, and 10 below. */
function scottishPack(): WorldPack {
  const world = createDemoWorld(createRng('split-test'), '2026-06-15');
  const competitions = Object.values(world.competitions).map((c) => structuredClone(c));
  const top = competitions.find((c) => c.id === DEMO_TOP_DIVISION)!;
  top.rules.rounds = 3;
  top.rules.split = { after: 33, groups: 2 };
  top.rules.relegation = { places: 1, to: DEMO_SECOND_DIVISION };
  top.rules.season.end = '05-16';
  const second = competitions.find((c) => c.id === DEMO_SECOND_DIVISION)!;
  second.rules.rounds = 4;
  second.rules.season.end = '04-30';
  second.rules.promotion = { places: 1, to: DEMO_TOP_DIVISION };
  second.rules.promotionPlayoff = { from: 2, to: 4, finalLegs: 2, versusPlace: 11 };
  delete second.rules.relegation;

  const keep = new Set([
    ...Object.values(world.clubs).filter((c) => c.leagueId === DEMO_TOP_DIVISION).slice(0, 12).map((c) => c.id),
    ...Object.values(world.clubs).filter((c) => c.leagueId === DEMO_SECOND_DIVISION).slice(0, 10).map((c) => c.id),
  ]);
  const players: PackPlayer[] = Object.values(world.players).filter((p) => keep.has(p.clubId!)).map((p) => ({
    id: p.id, firstName: p.firstName, lastName: p.lastName, nationId: p.nationId, dateOfBirth: p.dateOfBirth,
    clubId: p.clubId!, positions: p.positions, foot: p.foot, attributes: p.attributes, ca: p.ca,
    potentialHeadroom: p.pa - p.ca, squadNumber: p.squadNumber, contractExpires: '2028-06-30',
  }));
  return {
    format: 1, id: 'split', name: 'Split', notice: '', createdAt: '', sources: [],
    nations: Object.values(world.nations), competitions,
    clubs: Object.values(world.clubs).filter((c) => keep.has(c.id)), players, fixtures: [],
  };
}

describe('a league that splits', () => {
  const pack = scottishPack();

  it('schedules 33 rounds first and keeps dates back for the split', () => {
    expect(validatePack(pack)).toEqual([]);
    const state = createGame({ seed: 'split', managerName: 'Test', pack });
    const season = currentSeasonOf(state, DEMO_TOP_DIVISION)!;
    expect(seasonFixtures(state, season)).toHaveLength((12 * 33) / 2);
    expect(season.splitDates).toHaveLength(5);
    expect(season.endDate <= '2027-05-16').toBe(true);
    expect(seasonFixtures(state, currentSeasonOf(state, DEMO_SECOND_DIVISION)!)).toHaveLength(10 * 18);
    expect(boardExpectation(state, season.clubIds[0]!)).toMatch(/title|top 6|relegation/);
  });

  it('splits into halves, keeps clubs in their half, and settles the play-off with the league above', () => {
    const state = createGame({ seed: 'split', managerName: 'Test', pack });
    const top = currentSeasonOf(state, DEMO_TOP_DIVISION)!;
    const second = currentSeasonOf(state, DEMO_SECOND_DIVISION)!;
    while (state.date < '2027-06-25') advanceDay(state);

    expect(top.status).toBe('finished');
    const groups = top.split!.groups;
    expect(groups.map((g) => g.length)).toEqual([6, 6]);
    const fixtures = seasonFixtures(state, top);
    expect(fixtures).toHaveLength(198 + 30);
    // Every club plays 38 games, the last five only against its own half, with 19 at home or close to it.
    for (const id of top.clubIds) {
      const mine = fixtures.filter((f) => f.homeId === id || f.awayId === id);
      expect(mine).toHaveLength(38);
      const half = groups.find((g) => g.includes(id))!;
      for (const f of mine.filter((f) => f.round > 33)) expect(half).toContain(f.homeId === id ? f.awayId : f.homeId);
      const home = mine.filter((f) => f.homeId === id).length;
      expect(home).toBeGreaterThanOrEqual(18);
      expect(home).toBeLessThanOrEqual(20);
    }
    expect(top.final!.order.slice(0, 6).sort()).toEqual([...groups[0]!].sort());
    expect(seasonTable(state, top).map((r) => r.clubId)).toEqual(top.final!.order);

    const qualifier = second.final!.playoffQualifierId!;
    expect(second.final!.order.slice(1, 4)).toContain(qualifier);
    expect(second.final!.playoffRelegatedId).not.toBeUndefined();

    const nextTop = currentSeasonOf(state, DEMO_TOP_DIVISION)!;
    const nextSecond = currentSeasonOf(state, DEMO_SECOND_DIVISION)!;
    expect(nextTop.id).not.toBe(top.id);
    expect(nextTop.clubIds).toHaveLength(12);
    expect(nextSecond.clubIds).toHaveLength(10);
    expect(nextTop.clubIds).toContain(second.final!.order[0]);
    expect(nextTop.clubIds).not.toContain(top.final!.order[11]);
    const eleventh = top.final!.order[10]!;
    if (second.final!.playoffRelegatedId) {
      expect(second.final!.playoffRelegatedId).toBe(eleventh);
      expect(nextTop.clubIds).toContain(qualifier);
      expect(nextSecond.clubIds).toContain(eleventh);
    } else {
      expect(nextTop.clubIds).toContain(eleventh);
      expect(nextSecond.clubIds).toContain(qualifier);
    }
    expect(nextTop.split).toBeNull();
  });

  it('merges packs into one world', () => {
    const a = scottishPack();
    const b: WorldPack = { ...a, id: 'b', nations: a.nations.map((n) => ({ ...n, wealth: 0.5 })), competitions: [], clubs: [], players: [], fixtures: [] };
    const merged = mergePacks([a, b]);
    expect(merged.clubs).toHaveLength(a.clubs.length);
    expect(merged.nations.every((n) => n.wealth === 0.5)).toBe(true);
    expect(validatePack(mergePacks([a, a])).some((p) => p.startsWith('Duplicate club'))).toBe(true);
  });
});
