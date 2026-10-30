import { describe, expect, it } from 'vitest';
import { ALL_ATTRIBUTES } from '../src/attributes.ts';
import { createRng } from '../src/rng.ts';
import { createDemoWorld, DEMO_SECOND_DIVISION, DEMO_TOP_DIVISION } from '../src/worldgen.ts';
import { ageOn } from '../src/dates.ts';
import { mainPosition } from '../src/players.ts';

const TODAY = '2026-06-15';

describe('createDemoWorld', () => {
  const world = createDemoWorld(createRng('world'), TODAY);
  const clubs = Object.values(world.clubs);
  const players = Object.values(world.players);

  it('is identical for the same seed', () => {
    expect(JSON.stringify(createDemoWorld(createRng('world'), TODAY))).toBe(JSON.stringify(world));
  });

  it('has 20 clubs in each division with unique names', () => {
    expect(clubs.filter((c) => c.leagueId === DEMO_TOP_DIVISION)).toHaveLength(20);
    expect(clubs.filter((c) => c.leagueId === DEMO_SECOND_DIVISION)).toHaveLength(20);
    expect(new Set(clubs.map((c) => c.name)).size).toBe(40);
  });

  it('gives full squads to top-division clubs and thin squads to shadow clubs', () => {
    for (const club of clubs) {
      const squad = players.filter((p) => p.clubId === club.id);
      expect(squad).toHaveLength(club.leagueId === DEMO_TOP_DIVISION ? 25 : 22);
      expect(squad.filter((p) => mainPosition(p) === 'GK').length).toBeGreaterThanOrEqual(3);
      const numbers = squad.map((p) => p.squadNumber);
      expect(new Set(numbers).size).toBe(squad.length);
    }
  });

  it('keeps attributes, abilities and ages in range', () => {
    for (const p of players) {
      for (const key of ALL_ATTRIBUTES) {
        expect(p.attributes[key]).toBeGreaterThanOrEqual(1);
        expect(p.attributes[key]).toBeLessThanOrEqual(20);
      }
      expect(p.ca).toBeGreaterThanOrEqual(1);
      expect(p.pa).toBeGreaterThanOrEqual(p.ca);
      expect(p.pa).toBeLessThanOrEqual(200);
      const age = ageOn(p.dateOfBirth, TODAY);
      expect(age).toBeGreaterThanOrEqual(16);
      expect(age).toBeLessThanOrEqual(35);
      expect(p.value).toBeGreaterThan(0);
    }
  });

  it('makes bigger clubs stronger', () => {
    const top = clubs.filter((c) => c.leagueId === DEMO_TOP_DIVISION).sort((a, b) => b.reputation - a.reputation);
    const avgCa = (clubId: string) => {
      const squad = players.filter((p) => p.clubId === clubId);
      return squad.reduce((s, p) => s + p.ca, 0) / squad.length;
    };
    expect(avgCa(top[0]!.id)).toBeGreaterThan(avgCa(top[19]!.id) + 20);
  });
});
