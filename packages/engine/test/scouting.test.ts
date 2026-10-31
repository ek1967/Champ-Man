import { describe, expect, it } from 'vitest';
import { ALL_ATTRIBUTES } from '../src/attributes.ts';
import { advanceDay, createGame, takeJob } from '../src/game.ts';
import { abilityStars } from '../src/players.ts';
import { currentSeasonOf, squadOf } from '../src/queries.ts';
import {
  attributeView, estimatedAbility, estimatedPotential, findPlayers, knowledgeOf, playersAbroad, scoutClub, scoutingStaff, scoutPlayer,
  toggleShortlist,
} from '../src/scouting.ts';
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
