import type { Position } from './attributes.ts';
import type { ISODate } from './dates.ts';
import { CLUB_SUFFIXES, NAME_POOLS, TOWN_PREFIXES, TOWN_SUFFIXES } from './names.ts';
import { DEMO_NATION, NATIONS } from './nations.ts';
import { generatePlayer } from './players.ts';
import { chance, normal, pick, type Rng, randInt, weightedPick } from './rng.ts';
import {
  ENGLISH_STYLE_TIEBREAKERS, EUROPEAN_INTERNATIONAL_BREAKS, type LeagueRules,
} from './rules.ts';
import { pickStartingXI } from './selection.ts';
import type { Club, Competition, Nation, Player, World } from './types.ts';

/**
 * The demo world: a made-up country (Albion) with a playable top division and a shadow
 * second division. Always safe to distribute (PLAN §5.2) and used for development and tests.
 */

export const DEMO_TOP_DIVISION = 'aln-1';
export const DEMO_SECOND_DIVISION = 'aln-2';
const CLUBS_PER_DIVISION = 20;

const DEMO_SEASON: LeagueRules['season'] = {
  calendar: 'aug-may',
  start: '08-15',
  end: '05-23',
  rollover: '06-20',
  blocked: EUROPEAN_INTERNATIONAL_BREAKS,
};

export const DEMO_RULES: Record<string, LeagueRules> = {
  [DEMO_TOP_DIVISION]: {
    format: 'league',
    rounds: 2,
    points: { win: 3, draw: 1, loss: 0 },
    tieBreakers: ENGLISH_STYLE_TIEBREAKERS,
    season: DEMO_SEASON,
    relegation: { places: 3, to: DEMO_SECOND_DIVISION },
    zones: [
      { from: 1, to: 1, kind: 'champion', label: 'Champions' },
      { from: 2, to: 4, kind: 'continental', label: 'Continental qualification' },
      { from: 18, to: 20, kind: 'relegation', label: 'Relegation' },
    ],
  },
  [DEMO_SECOND_DIVISION]: {
    format: 'league',
    rounds: 2,
    points: { win: 3, draw: 1, loss: 0 },
    tieBreakers: ENGLISH_STYLE_TIEBREAKERS,
    season: DEMO_SEASON,
    promotion: { places: 3, to: DEMO_TOP_DIVISION },
    zones: [{ from: 1, to: 3, kind: 'promotion', label: 'Promotion' }],
  },
};

type Depth = 'starter' | 'backup' | 'youth';

/** 25-man squad shape; shadow clubs drop the slots marked `fullOnly` (22 players). */
const SQUAD_TEMPLATE: ReadonlyArray<{ position: Position; depth: Depth; fullOnly?: boolean }> = [
  { position: 'GK', depth: 'starter' }, { position: 'GK', depth: 'backup' }, { position: 'GK', depth: 'youth' },
  { position: 'DC', depth: 'starter' }, { position: 'DC', depth: 'starter' }, { position: 'DC', depth: 'backup' },
  { position: 'DC', depth: 'youth', fullOnly: true },
  { position: 'DL', depth: 'starter' }, { position: 'DL', depth: 'backup' },
  { position: 'DR', depth: 'starter' }, { position: 'DR', depth: 'backup' },
  { position: 'DM', depth: 'starter' }, { position: 'DM', depth: 'backup' },
  { position: 'MC', depth: 'starter' }, { position: 'MC', depth: 'starter' }, { position: 'MC', depth: 'backup' },
  { position: 'MC', depth: 'youth', fullOnly: true },
  { position: 'ML', depth: 'starter' }, { position: 'MR', depth: 'starter' },
  { position: 'AML', depth: 'backup' }, { position: 'AMR', depth: 'backup' }, { position: 'AMC', depth: 'starter' },
  { position: 'ST', depth: 'starter' }, { position: 'ST', depth: 'starter' },
  { position: 'ST', depth: 'youth', fullOnly: true },
];

const DEPTH_PROFILE: Record<Depth, { caOffset: number; minAge: number; maxAge: number }> = {
  starter: { caOffset: 6, minAge: 22, maxAge: 32 },
  backup: { caOffset: -6, minAge: 20, maxAge: 34 },
  youth: { caOffset: -28, minAge: 17, maxAge: 19 },
};

/** How often each nation supplies a foreign player to the demo league. */
const FOREIGN_WEIGHTS: Record<string, number> = {
  eng: 15, sco: 5, esp: 8, ita: 6, ger: 6, ned: 6, por: 6, fra: 8, bra: 8, arg: 6, cze: 3, usa: 3,
};

const COLOURS = [
  '#c8102e', '#003399', '#1b5e20', '#ffd100', '#6a1b9a', '#ff6f00', '#000000', '#ffffff',
  '#7b1e3a', '#5dade2', '#00695c', '#9e9e9e',
];

function uniqueTownNames(rng: Rng, count: number): string[] {
  const names = new Set<string>();
  while (names.size < count) names.add(pick(rng, TOWN_PREFIXES) + pick(rng, TOWN_SUFFIXES));
  return [...names];
}

function stadiumName(rng: Rng, town: string, reputation: number): string {
  const surname = pick(rng, NAME_POOLS.english?.last ?? ['Victoria']);
  const options = [`${town} Park`, `${surname} Road`, `${surname} Lane`, `${town} Stadium`];
  if (reputation > 75) options.push(`${town} Arena`);
  return pick(rng, options);
}

/** Club sizes fall off steeply: a few giants, a crowded middle. */
function reputationFor(rng: Rng, tier: number, rank: number): number {
  const t = 1 - rank / (CLUBS_PER_DIVISION - 1);
  const value = tier === 1 ? 50 + 45 * t ** 1.6 : 30 + 25 * t ** 1.3;
  return Math.max(1, Math.min(100, Math.round(value + normal(rng, 0, 2.5))));
}

export function createDemoWorld(rng: Rng, today: ISODate): World {
  const nations: Record<string, Nation> = { [DEMO_NATION.id]: DEMO_NATION };
  for (const n of NATIONS) nations[n.id] = n;

  const competitions: Record<string, Competition> = {
    [DEMO_TOP_DIVISION]: {
      id: DEMO_TOP_DIVISION, name: 'Albion Premier Division', shortName: 'Premier Division',
      nationId: DEMO_NATION.id, tier: 1, mode: 'playable', rules: DEMO_RULES[DEMO_TOP_DIVISION] as LeagueRules,
    },
    [DEMO_SECOND_DIVISION]: {
      id: DEMO_SECOND_DIVISION, name: 'Albion First Division', shortName: 'First Division',
      nationId: DEMO_NATION.id, tier: 2, mode: 'shadow', rules: DEMO_RULES[DEMO_SECOND_DIVISION] as LeagueRules,
    },
  };

  const clubs: Record<string, Club> = {};
  const players: Record<string, Player> = {};
  const towns = uniqueTownNames(rng, CLUBS_PER_DIVISION * 2);
  const usedClubNames = new Set<string>();
  let playerCount = 0;

  towns.forEach((town, index) => {
    const tier = index < CLUBS_PER_DIVISION ? 1 : 2;
    const rank = index % CLUBS_PER_DIVISION;
    const reputation = reputationFor(rng, tier, rank);
    let name = `${town} ${pick(rng, CLUB_SUFFIXES)}`;
    while (usedClubNames.has(name)) name = `${town} ${pick(rng, CLUB_SUFFIXES)}`;
    usedClubNames.add(name);

    const primary = pick(rng, COLOURS);
    let secondary = pick(rng, COLOURS);
    while (secondary === primary) secondary = pick(rng, COLOURS);

    const club: Club = {
      id: `c${index + 1}`,
      name,
      shortName: town,
      nationId: DEMO_NATION.id,
      reputation,
      stadium: stadiumName(rng, town, reputation),
      founded: randInt(rng, 1865, 1925),
      colours: { primary, secondary },
      leagueId: tier === 1 ? DEMO_TOP_DIVISION : DEMO_SECOND_DIVISION,
    };
    clubs[club.id] = club;

    // A club's level of player follows its size; the very biggest clubs pull further ahead.
    const meanCa = 55 + reputation + Math.max(0, reputation - 75) * 0.6;
    const squad: Player[] = [];
    for (const slot of SQUAD_TEMPLATE) {
      if (slot.fullOnly && tier !== 1) continue;
      const depth = DEPTH_PROFILE[slot.depth];
      const foreign = !chance(rng, 0.62);
      const nation = foreign
        ? (nations[weightedPick(rng, Object.keys(FOREIGN_WEIGHTS), (id) => FOREIGN_WEIGHTS[id] ?? 0)] as Nation)
        : DEMO_NATION;
      playerCount++;
      const player = generatePlayer(rng, {
        id: `p${playerCount}`,
        position: slot.position,
        // Starters vary more, so the best clubs have a few real stars, as in real leagues.
        ca: meanCa + depth.caOffset + normal(rng, 0, slot.depth === 'starter' ? 11 : 8),
        age: randInt(rng, depth.minAge, depth.maxAge),
        nationId: nation.id,
        namePool: nation.namePool,
        clubId: club.id,
        today,
      });
      players[player.id] = player;
      squad.push(player);
    }
    assignSquadNumbers(squad);
  });

  return { nations, clubs, players, competitions };
}

/** First XI wears 1–11, everyone else 12 upwards. */
export function assignSquadNumbers(squad: Player[]): void {
  const xi = pickStartingXI(squad);
  const numberBySlot = [1, 2, 5, 6, 3, 7, 4, 8, 11, 9, 10];
  const taken = new Set<string>();
  xi.playerIds.forEach((id, slot) => {
    const player = squad.find((p) => p.id === id);
    if (!player) return;
    player.squadNumber = numberBySlot[slot] ?? null;
    taken.add(id);
  });
  let next = 12;
  for (const player of squad) {
    if (!taken.has(player.id)) player.squadNumber = next++;
  }
}
