import { describe, expect, it } from 'vitest';
import { advanceDay, createGame } from '../src/game.ts';
import { type PackFixture, type PackPlayer, validatePack, type WorldPack } from '../src/pack.ts';
import { currentSeasonOf, seasonFixtures } from '../src/queries.ts';
import { createRng } from '../src/rng.ts';
import { createDemoWorld, DEMO_SECOND_DIVISION, DEMO_TOP_DIVISION } from '../src/worldgen.ts';

/** A pack built from the made-up demo world, with a play-off and a hand-made first-season fixture list. */
function demoPack(): WorldPack {
  const world = createDemoWorld(createRng('pack-test'), '2026-06-15');
  const competitions = Object.values(world.competitions).map((c) => structuredClone(c));
  const second = competitions.find((c) => c.id === DEMO_SECOND_DIVISION)!;
  second.rules.promotion = { places: 2, to: DEMO_TOP_DIVISION };
  second.rules.promotionPlayoff = { from: 3, to: 6 };

  const players: PackPlayer[] = Object.values(world.players).map((p) => ({
    id: p.id, firstName: p.firstName, lastName: p.lastName, nationId: p.nationId, dateOfBirth: p.dateOfBirth,
    clubId: p.clubId!, positions: p.positions, foot: p.foot, attributes: p.attributes, ca: p.ca,
    potentialHeadroom: p.pa - p.ca, squadNumber: p.squadNumber, contractExpires: '2028-06-30',
  }));

  // A real-looking first season for the top division: every pair home and away, one round a week.
  const top = Object.values(world.clubs).filter((c) => c.leagueId === DEMO_TOP_DIVISION).map((c) => c.id);
  const fixtures: PackFixture[] = [];
  let round = 0;
  for (let i = 0; i < top.length; i++) {
    for (let j = 0; j < top.length; j++) {
      if (i === j) continue;
      round++;
      const day = new Date(Date.UTC(2026, 7, 21) + Math.floor(round / 10) * 7 * 86_400_000).toISOString().slice(0, 10);
      fixtures.push({ competitionId: DEMO_TOP_DIVISION, round: Math.floor(round / 10) + 1, date: day, homeId: top[i]!, awayId: top[j]! });
    }
  }

  return {
    format: 1, id: 'test', name: 'Test', notice: '', createdAt: '', sources: [],
    nations: Object.values(world.nations), competitions, clubs: Object.values(world.clubs), players, fixtures,
  };
}

describe('world packs', () => {
  const pack = demoPack();

  it('pass validation, and validation catches broken data', () => {
    expect(validatePack(pack)).toEqual([]);
    const broken = structuredClone(pack);
    broken.players[0]!.clubId = 'nowhere';
    expect(validatePack(broken).length).toBeGreaterThan(0);
  });

  it('load into a game using the real fixture list for the first season', () => {
    const state = createGame({ seed: 's', managerName: 'Test', pack });
    const season = currentSeasonOf(state, DEMO_TOP_DIVISION)!;
    const fixtures = seasonFixtures(state, season);
    expect(fixtures).toHaveLength(pack.fixtures.length);
    expect(fixtures[0]!.date).toBe(pack.fixtures[0]!.date);
    expect(Object.keys(state.world.players)).toHaveLength(pack.players.length);
  });

  it('roll potential per save but keep current ability from the pack', () => {
    const a = createGame({ seed: 'one', managerName: 'Test', pack });
    const b = createGame({ seed: 'two', managerName: 'Test', pack });
    const young = pack.players.filter((p) => p.potentialHeadroom > 20);
    expect(young.some((p) => a.world.players[p.id]!.pa !== b.world.players[p.id]!.pa)).toBe(true);
    for (const p of young) expect(a.world.players[p.id]!.ca).toBe(p.ca);
  });

  it('promote two clubs plus the play-off winner', () => {
    const state = createGame({ seed: 'playoffs', managerName: 'Test', pack });
    const first = currentSeasonOf(state, DEMO_SECOND_DIVISION)!;
    while (state.date < '2027-06-25') advanceDay(state);
    const winner = first.final!.playoffWinnerId!;
    expect(first.final!.order.slice(2, 6)).toContain(winner);
    const nextTop = currentSeasonOf(state, DEMO_TOP_DIVISION)!;
    for (const id of [...first.final!.order.slice(0, 2), winner]) expect(nextTop.clubIds).toContain(id);
    expect(nextTop.clubIds).toHaveLength(20);
  });
});
