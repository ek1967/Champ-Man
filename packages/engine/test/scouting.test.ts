import { describe, expect, it } from 'vitest';
import { ALL_ATTRIBUTES } from '../src/attributes.ts';
import { advanceDay, createGame, takeJob } from '../src/game.ts';
import { abilityStars, mainPosition } from '../src/players.ts';
import { currentSeasonOf, squadOf } from '../src/queries.ts';
import {
  abilityForStars, attributeView, briefMaxFee, comparisonLine, estimatedAbility, estimatedPotential, findPlayers, knowledgeOf, playersAbroad,
  positionComparison, scoutClub, scoutingStaff, scoutPlayer, scoutReportHistory, toggleShortlist,
} from '../src/scouting.ts';
import { askingPrice, availableBudget } from '../src/transfers.ts';
import { ageOn } from '../src/dates.ts';
import { DEMO_TOP_DIVISION } from '../src/worldgen.ts';

function career(seed: string) {
  const state = createGame({ seed, managerName: 'Test' });
  const clubs = currentSeasonOf(state, DEMO_TOP_DIVISION)!.clubIds;
  const clubId = [...clubs].sort((a, b) => state.world.clubs[a]!.reputation - state.world.clubs[b]!.reputation)[0]!;
  takeJob(state, clubId);
  return { state, clubId, rival: clubs.find((c) => c !== clubId)! };
}

describe('scouting', () => {
  it('knows your own players exactly and others only roughly', () => {
    const { state, clubId, rival } = career('knowledge');
    const mine = squadOf(state, clubId)[0]!;
    const theirs = squadOf(state, rival)[0]!;
    const abroad = Object.values(state.world.players).find((p) => p.clubId && state.world.clubs[p.clubId]!.leagueId !== DEMO_TOP_DIVISION)!;
    expect(knowledgeOf(state, mine)).toBe(100);
    expect(estimatedAbility(state, mine).exact).toBe(true);
    expect(knowledgeOf(state, theirs)).toBeLessThan(100);
    expect(knowledgeOf(state, abroad)).toBeLessThan(knowledgeOf(state, theirs));
  });

  it('shows attribute ranges that always contain the true value', () => {
    const { state, rival } = career('ranges');
    for (const p of squadOf(state, rival)) {
      for (const key of ALL_ATTRIBUTES) {
        const view = attributeView(state, p, key);
        expect(view.low).toBeLessThanOrEqual(p.attributes[key]);
        expect(view.high).toBeGreaterThanOrEqual(p.attributes[key]);
        expect(view.high).toBeGreaterThan(view.low - 1);
      }
    }
  });

  it('turns a scouting trip into a report with a grade and exact knowledge', () => {
    const { state, rival } = career('report');
    const target = squadOf(state, rival)[2]!;
    expect(scoutPlayer(state, target.id).ok).toBe(true);
    expect(scoutPlayer(state, target.id).ok).toBe(false); // already being watched
    for (let i = 0; i < 4; i++) advanceDay(state);
    expect(knowledgeOf(state, target)).toBe(100);
    expect(estimatedAbility(state, target)).toEqual({ stars: abilityStars(target.ca), exact: true });
    const report = state.scouting!.reports[target.id]!;
    expect(['A', 'B', 'C', 'D']).toContain(report.grade);
    const potential = estimatedPotential(state, target);
    expect(potential.min).toBe(potential.max);
    expect(state.news.some((n) => n.title.startsWith('Scout report'))).toBe(true);
  });

  it('limits assignments to the number of scouts, and club trips teach you a whole squad', () => {
    const { state, rival } = career('limits');
    const { scouts } = scoutingStaff(state);
    expect(scoutClub(state, rival).ok).toBe(true);
    const others = Object.values(state.world.players).filter((p) => p.clubId && p.clubId !== rival && p.clubId !== state.manager.clubId);
    let accepted = 1;
    for (const p of others.slice(0, scouts + 2)) if (scoutPlayer(state, p.id).ok) accepted++;
    expect(accepted).toBe(scouts);
    for (let i = 0; i < 9; i++) advanceDay(state);
    for (const p of squadOf(state, rival)) expect(knowledgeOf(state, p)).toBeGreaterThanOrEqual(75);
  });

  it('keeps a shortlist', () => {
    const { state, rival } = career('shortlist');
    const p = squadOf(state, rival)[0]!;
    expect(toggleShortlist(state, p.id)).toBe(true);
    expect(state.scouting!.shortlist).toContain(p.id);
    expect(toggleShortlist(state, p.id)).toBe(false);
  });
});

describe('searching for players', () => {
  it('finds first-team players for a position, better than the current starter', () => {
    const { state } = career('search-first');
    expect(findPlayers(state, { position: 'DL', need: 'first', where: 'all' }).ok).toBe(true);
    for (let i = 0; i < 8; i++) advanceDay(state);
    const search = state.scouting!.searches![0]!;
    expect(search.criteria.position).toBe('DL');
    expect(search.playerIds.length).toBeGreaterThan(0);
    for (const id of search.playerIds) {
      const p = state.world.players[id]!;
      expect(knowledgeOf(state, p)).toBe(100);
      expect(state.scouting!.reports[id]).toBeDefined();
      expect(p.positions.DL ?? 0).toBeGreaterThan(10);
    }
    expect(state.news.some((n) => n.title.includes('left-backs'))).toBe(true);
  });

  it('finds prospects of 21 or under for the future, in your own league', () => {
    const { state, clubId } = career('search-future');
    findPlayers(state, { position: 'any', need: 'future', where: 'league' });
    for (let i = 0; i < 6; i++) advanceDay(state);
    const search = state.scouting!.searches![0]!;
    expect(search.playerIds.length).toBeGreaterThan(0);
    for (const id of search.playerIds) {
      const p = state.world.players[id]!;
      expect(ageOn(p.dateOfBirth, state.date)).toBeLessThanOrEqual(21);
      expect(state.world.clubs[p.clubId!]!.leagueId).toBe(state.world.clubs[clubId]!.leagueId);
    }
  });

  it('brings back players abroad matching the brief', () => {
    const { state } = career('search-abroad');
    expect(findPlayers(state, { position: 'ST', need: 'future', where: 'bra' }).ok).toBe(true);
    for (let i = 0; i < 15; i++) advanceDay(state);
    const found = playersAbroad(state);
    expect(found).toHaveLength(5);
    for (const p of found) {
      expect(p.nationId).toBe('bra');
      expect(p.positions.ST).toBe(20);
      expect(ageOn(p.dateOfBirth, state.date)).toBeLessThanOrEqual(21);
    }
  });
});

describe('scouting briefs with a budget and targets', () => {
  it('only recommends players within the fee, defaulting to the money free to spend', () => {
    const { state, clubId } = career('brief-fee');
    findPlayers(state, { position: 'any', need: 'first', where: 'all', maxFee: 3_000_000 });
    for (let i = 0; i < 8; i++) advanceDay(state);
    const search = state.scouting!.searches![0]!;
    for (const id of search.playerIds) expect(askingPrice(state, state.world.players[id]!)).toBeLessThanOrEqual(3_000_000);
    expect(briefMaxFee(state, { position: 'any', need: 'first', where: 'all' })).toBe(Math.max(250_000, availableBudget(state, clubId)));
  });

  it("meets ability and potential targets, give or take the scout's judgement", () => {
    const { state } = career('brief-stars');
    findPlayers(state, { position: 'any', need: 'future', where: 'all', minPotential: 3, maxFee: 1_000_000_000 });
    for (let i = 0; i < 8; i++) advanceDay(state);
    for (const id of state.scouting!.searches![0]!.playerIds) {
      expect(state.world.players[id]!.pa).toBeGreaterThanOrEqual(abilityForStars(3) - 25);
    }
    findPlayers(state, { position: 'DC', need: 'first', where: 'esp', minAbility: 2, maxFee: 5_000_000 });
    for (let i = 0; i < 15; i++) advanceDay(state);
    for (const p of playersAbroad(state)) {
      expect(p.ca).toBeGreaterThanOrEqual(abilityForStars(2));
      expect(askingPrice(state, p)).toBeLessThanOrEqual(5_000_000);
    }
  });

  it('compares a player with your own at the position', () => {
    const { state, clubId, rival } = career('compare');
    const target = squadOf(state, rival).find((p) => mainPosition(p) === 'DC')!;
    const c = positionComparison(state, target, 'DC')!;
    expect(c.squad.length).toBeGreaterThan(0);
    for (const m of c.squad) expect(state.world.players[m.id]!.clubId).toBe(clubId);
    expect(comparisonLine(state, target, 'DC')).toMatch(/^At centre-back you have /);
  });
});

describe('keeping scout reports', () => {
  it('keeps every search and every report, including repeat reports and players who have gone', () => {
    const { state, rival } = career('keep');
    const target = squadOf(state, rival)[3]!;
    scoutPlayer(state, target.id);
    for (let i = 0; i < 8; i++) advanceDay(state);
    scoutPlayer(state, target.id);
    for (let i = 0; i < 8; i++) advanceDay(state);
    const reportsOnTarget = scoutReportHistory(state).filter((e) => e.playerId === target.id);
    expect(reportsOnTarget).toHaveLength(2);
    expect(reportsOnTarget[0]!.where).toBe(state.world.clubs[rival]!.shortName);

    for (let n = 0; n < 12; n++) {
      findPlayers(state, { position: 'any', need: n % 2 ? 'backup' : 'first', where: 'league', maxFee: 1_000_000_000 });
      for (let i = 0; i < 6; i++) advanceDay(state);
    }
    expect(state.scouting!.searches!.length).toBe(12);

    // Players found abroad stay in the history after the trail goes cold.
    findPlayers(state, { position: 'ST', need: 'first', where: 'ita', maxFee: 1_000_000_000 });
    while (state.date < '2027-03-01') advanceDay(state);
    const abroad = scoutReportHistory(state).filter((e) => e.where.startsWith('Abroad'));
    expect(abroad.length).toBeGreaterThan(0);
    expect(state.world.players[abroad[0]!.playerId]!.retired).toBe(true);
  });
});

describe('scouting for a position', () => {
  it('only brings back players who play there, for every kind of brief', () => {
    const { state } = career('keepers');
    for (const need of ['first', 'backup', 'future'] as const) {
      findPlayers(state, { position: 'GK', need, where: 'all', maxFee: 1_000_000_000 });
      for (let i = 0; i < 8; i++) advanceDay(state);
      const search = state.scouting!.searches![0]!;
      for (const id of search.playerIds) expect(state.world.players[id]!.positions.GK ?? 0).toBeGreaterThanOrEqual(15);
    }
    findPlayers(state, { position: 'DL', need: 'future', where: 'all', maxFee: 1_000_000_000 });
    for (let i = 0; i < 8; i++) advanceDay(state);
    for (const id of state.scouting!.searches![0]!.playerIds) expect(state.world.players[id]!.positions.DL ?? 0).toBeGreaterThanOrEqual(15);
  });
});
