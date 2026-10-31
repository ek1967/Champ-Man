import { describe, expect, it } from 'vitest';
import { advanceDay, createGame, takeJob } from '../src/game.ts';
import { academyRating, developPlayer, releaseByManager, releaseCost } from '../src/development.ts';
import { currentSeasonOf, squadOf } from '../src/queries.ts';
import { ageOn } from '../src/dates.ts';
import type { GameState, Player } from '../src/types.ts';
import { DEMO_TOP_DIVISION } from '../src/worldgen.ts';
import { ALL_ATTRIBUTES } from '../src/attributes.ts';

const attributeTotal = (p: Player) => ALL_ATTRIBUTES.reduce((s, k) => s + p.attributes[k], 0);

function until(state: GameState, date: string): void {
  while (state.date < date) advanceDay(state);
}

describe('development', () => {
  it('grows young players towards their potential and never past it', () => {
    const state = createGame({ seed: 'dev-young', managerName: 'Test' });
    const young = Object.values(state.world.players).find((p) => ageOn(p.dateOfBirth, state.date) <= 18 && p.pa - p.ca >= 30)!;
    young.pa = young.ca + 40;
    const before = { ca: young.ca, attrs: attributeTotal(young) };
    for (let month = 0; month < 24; month++) {
      state.date = `${2026 + Math.floor((6 + month) / 12)}-${String(((6 + month) % 12) + 1).padStart(2, '0')}-01`;
      developPlayer(state, young);
    }
    expect(young.ca).toBeGreaterThan(before.ca + 10);
    expect(young.ca).toBeLessThanOrEqual(young.pa);
    expect(attributeTotal(young)).toBeGreaterThan(before.attrs);
    expect(young.abilityHistory.length).toBe(24);
  });

  it('makes older players decline, physical attributes first', () => {
    const state = createGame({ seed: 'dev-old', managerName: 'Test' });
    const old = Object.values(state.world.players).find((p) => ageOn(p.dateOfBirth, state.date) >= 33 && p.positions.GK !== 20)!;
    const pace = old.attributes.pace + old.attributes.acceleration + old.attributes.stamina;
    const vision = old.attributes.vision + old.attributes.decisions;
    const ca = old.ca;
    for (let month = 0; month < 12; month++) developPlayer(state, old);
    expect(old.ca).toBeLessThan(ca);
    expect(old.attributes.pace + old.attributes.acceleration + old.attributes.stamina).toBeLessThan(pace);
    expect(vision - (old.attributes.vision + old.attributes.decisions)).toBeLessThanOrEqual(2);
  });
});

describe('youth intake, retirement and releases', () => {
  const state = createGame({ seed: 'youth', managerName: 'Test' });
  const clubs = currentSeasonOf(state, DEMO_TOP_DIVISION)!.clubIds;
  const clubId = [...clubs].sort((a, b) => state.world.clubs[b]!.reputation - state.world.clubs[a]!.reputation)[0]!;
  takeJob(state, clubId);
  const veterans = Object.values(state.world.players).filter((p) => ageOn(p.dateOfBirth, '2027-06-25') >= 35);
  until(state, '2027-07-05');

  it('adds 16 and 17-year-olds to every club in the spring, with news for the manager', () => {
    for (const id of clubs) {
      const youth = Object.values(state.world.players).filter((p) => p.id.startsWith(`y2027-${id}-`));
      expect(youth.length).toBeGreaterThanOrEqual(1);
      for (const p of youth) {
        expect([16, 17]).toContain(ageOn(p.dateOfBirth, '2027-03-20'));
        expect(p.pa).toBeGreaterThanOrEqual(p.ca);
      }
    }
    expect(state.news.some((n) => n.title.startsWith('Youth intake'))).toBe(true);
  });

  it('gives bigger clubs better academies', () => {
    const sizes = clubs.map((id) => state.world.clubs[id]!).sort((a, b) => b.reputation - a.reputation);
    expect(academyRating(sizes[0]!)).toBeGreaterThan(academyRating(sizes[sizes.length - 1]!));
  });

  it('retires most players in their mid-thirties', () => {
    const retired = veterans.filter((p) => p.retired).length;
    expect(retired / Math.max(1, veterans.length)).toBeGreaterThan(0.4);
    for (const p of veterans.filter((x) => x.retired)) expect(p.clubId).toBeNull();
  });

  it('lets the manager release a player for half the wages still owed', () => {
    const player = squadOf(state, clubId).find((p) => p.contract && p.contract.expires > '2028-06-30')!;
    const cost = releaseCost(state, player);
    expect(cost).toBeGreaterThan(0);
    const result = releaseByManager(state, player.id);
    expect(result.ok).toBe(true);
    expect(player.clubId).toBeNull();
  });
});
