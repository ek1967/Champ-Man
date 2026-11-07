import {
  ALL_ATTRIBUTES, type Attributes, clampAttribute, GOALKEEPING, HIDDEN, type HiddenAttributes,
  type Position, POSITION_PROFILES, POSITIONS, RELATED_POSITIONS, TECHNICAL,
} from './attributes.ts';
import { addDays, ageOn, type ISODate, makeDate, yearOf } from './dates.ts';
import { NAME_POOLS } from './names.ts';
import { chance, hashString, normal, pick, type Rng, randInt } from './rng.ts';
import type { Id, Player } from './types.ts';

const PACE_KEYS = new Set(['pace', 'acceleration', 'agility']);
const GROWING_KEYS = new Set(['strength', 'stamina']);
const EXPERIENCE_KEYS = new Set(['decisions', 'composure', 'anticipation', 'positioning', 'leadership']);

/**
 * Spreads Current Ability across 1–20 attributes using the position's profile:
 * attributes that matter for the position sit above the player's general level, the rest below.
 */
export function generateAttributes(rng: Rng, position: Position, ca: number, age: number): Attributes {
  const profile = POSITION_PROFILES[position];
  const level = 1.5 + (ca / 200) * 15.5;
  const attributes = {} as Attributes;
  for (const key of ALL_ATTRIBUTES) {
    const weight = profile[key] ?? 0;
    const isGkSkill = (GOALKEEPING as readonly string[]).includes(key);
    let value: number;
    if (position !== 'GK' && isGkSkill) {
      value = randInt(rng, 1, 4);
    } else if (position === 'GK' && weight === 0 && (TECHNICAL as readonly string[]).includes(key)) {
      value = level * 0.45 + normal(rng, 0, 1.5);
    } else {
      value = level + weight * 4.5 - 1.5 + normal(rng, 0, 1.6);
    }
    if (age <= 19 && GROWING_KEYS.has(key)) value -= (20 - age) * 1.2;
    if (age >= 31 && PACE_KEYS.has(key)) value -= (age - 30) * 0.7;
    if (age >= 28 && EXPERIENCE_KEYS.has(key)) value += 1;
    attributes[key] = clampAttribute(value);
  }
  return attributes;
}

export function generateHidden(rng: Rng, ca: number): HiddenAttributes {
  const hidden = {} as HiddenAttributes;
  for (const key of HIDDEN) hidden[key] = clampAttribute(normal(rng, 11, 3.5));
  hidden.consistency = clampAttribute(normal(rng, 10 + (ca - 100) / 20, 3));
  hidden.injuryProneness = clampAttribute(normal(rng, 8, 4));
  return hidden;
}

/** Room to grow shrinks with age; a few teenagers are genuine wonderkids. */
export function generatePotential(rng: Rng, ca: number, age: number): number {
  let headroom: number;
  if (age <= 17) headroom = normal(rng, 45, 20);
  else if (age <= 20) headroom = normal(rng, 35, 18);
  else if (age <= 23) headroom = normal(rng, 18, 12);
  else if (age <= 26) headroom = normal(rng, 6, 6);
  else headroom = randInt(rng, 0, 3);
  let pa = Math.round(ca + Math.max(0, headroom));
  if (age <= 19 && chance(rng, 0.02)) pa = Math.max(pa, randInt(rng, 160, 195));
  return Math.min(200, Math.max(ca, pa));
}

/** Rounds to two significant figures, the way transfer fees and wages are quoted. */
export function roundMoney(amount: number): number {
  if (amount <= 0) return 0;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(amount)) - 1);
  return Math.round(amount / magnitude) * magnitude;
}

export function estimateValue(ca: number, pa: number, age: number): number {
  let value = 50_000 * 10 ** ((ca - 60) / 35);
  if (age <= 21) value *= 1 + (pa - ca) / 80;
  else if (age >= 33) value *= 0.3;
  else if (age >= 31) value *= 0.55;
  else if (age >= 28) value *= 0.8;
  return Math.max(10_000, roundMoney(value));
}

export function estimateWage(ca: number): number {
  return Math.max(500, roundMoney((ca / 200) ** 4 * 300_000));
}

function generatePositions(rng: Rng, main: Position, versatility: number): Partial<Record<Position, number>> {
  const positions: Partial<Record<Position, number>> = { [main]: 20 };
  const related = RELATED_POSITIONS[main];
  for (const pos of POSITIONS) {
    const base = related[pos];
    if (base === undefined) continue;
    if (!chance(rng, 0.45 + versatility / 40)) continue;
    positions[pos] = clampAttribute(base + normal(rng, 0, 2) + (versatility - 10) / 4);
  }
  return positions;
}

function generateFoot(rng: Rng, main: Position): 'L' | 'R' | 'B' {
  if (chance(rng, 0.05)) return 'B';
  const leftSided = main === 'DL' || main === 'WBL' || main === 'ML' || main === 'AML';
  return chance(rng, leftSided ? 0.65 : 0.2) ? 'L' : 'R';
}

export interface NewPlayerSpec {
  id: Id;
  position: Position;
  ca: number;
  age: number;
  nationId: Id;
  namePool: string;
  clubId: Id | null;
  today: ISODate;
}

export function generatePlayer(rng: Rng, spec: NewPlayerSpec): Player {
  const pool = NAME_POOLS[spec.namePool] ?? NAME_POOLS.english;
  if (!pool) throw new Error(`Unknown name pool ${spec.namePool}`);
  const firstName = pick(rng, pool.first);
  const lastName = pick(rng, pool.last);
  const knownAs = pool.singleNameChance && chance(rng, pool.singleNameChance) ? firstName : undefined;

  const ca = Math.max(1, Math.min(200, Math.round(spec.ca)));
  const hidden = generateHidden(rng, ca);
  const pa = generatePotential(rng, ca, spec.age);
  // Birthday somewhere in the year before they reach `age`.
  const dateOfBirth = addDays(spec.today, -Math.floor(spec.age * 365.25 + randInt(rng, 0, 364)));
  const age = ageOn(dateOfBirth, spec.today);
  const contractYears = age >= 31 ? randInt(rng, 1, 2) : randInt(rng, 1, 5);

  const player: Player = {
    id: spec.id,
    firstName,
    lastName,
    nationId: spec.nationId,
    dateOfBirth,
    clubId: spec.clubId,
    positions: generatePositions(rng, spec.position, hidden.versatility),
    foot: generateFoot(rng, spec.position),
    attributes: generateAttributes(rng, spec.position, ca, age),
    hidden,
    ca,
    pa,
    contract: spec.clubId
      ? { wage: estimateWage(ca), expires: makeDate(yearOf(spec.today) + contractYears, 6, 30) }
      : null,
    value: estimateValue(ca, pa, age),
    squadNumber: null,
    stats: [],
    condition: 100,
    injury: null,
    suspension: 0,
    form: [],
    transferListed: false,
    abilityHistory: [],
    growthCarry: 0,
  };
  if (knownAs) player.knownAs = knownAs;
  player.positions = rolePositions(player);
  return player;
}

/**
 * How well a player usually knows the positions around his own, before footedness, attributes and
 * versatility move it up or down: a left back is nearly at home at left wing-back, can do a job at
 * left midfield or centre-back, and is lost up front.
 */
const NEIGHBOURS: Record<Position, Partial<Record<Position, number>>> = {
  GK: {},
  DC: { DM: 11, DL: 10, DR: 10 },
  DL: { WBL: 17, ML: 13, DC: 11, DR: 11 },
  DR: { WBR: 17, MR: 13, DC: 11, DL: 11 },
  WBL: { DL: 16, ML: 15, AML: 11, WBR: 11 },
  WBR: { DR: 16, MR: 15, AMR: 11, WBL: 11 },
  DM: { MC: 16, DC: 12 },
  MC: { DM: 14, AMC: 14, ML: 10, MR: 10 },
  ML: { AML: 16, WBL: 13, MR: 12, MC: 11 },
  MR: { AMR: 16, WBR: 13, ML: 12, MC: 11 },
  AML: { ML: 16, AMR: 14, AMC: 11, ST: 11 },
  AMR: { MR: 16, AML: 14, AMC: 11, ST: 11 },
  AMC: { MC: 13, ST: 13, AML: 12, AMR: 12 },
  ST: { AMC: 12, AML: 11, AMR: 11 },
};

const LEFT_SIDE = new Set<Position>(['DL', 'WBL', 'ML']);
const RIGHT_SIDE = new Set<Position>(['DR', 'WBR', 'MR']);

/** Weighted average of the attributes a position needs. */
function profileScore(player: Pick<Player, 'attributes'>, position: Position): number {
  let total = 0;
  let weight = 0;
  for (const [key, w] of Object.entries(POSITION_PROFILES[position])) {
    total += (player.attributes[key as keyof Attributes] ?? 10) * (w ?? 0);
    weight += w ?? 0;
  }
  return weight > 0 ? total / weight : 10;
}

/**
 * Fills in how well a player can cover the positions next to his main one, so most players are
 * accomplished or unconvincing somewhere besides their best position. Never lowers what a player
 * already knows, and gives the same answer every time for the same player, so it is safe to run again.
 */
export function rolePositions(player: Pick<Player, 'id' | 'positions' | 'foot' | 'attributes' | 'hidden'>): Partial<Record<Position, number>> {
  const positions = { ...player.positions };
  let main: Position = 'MC';
  let best = -1;
  for (const pos of POSITIONS) {
    const value = positions[pos] ?? 0;
    if (value > best) {
      main = pos;
      best = value;
    }
  }
  const versatility = ((player.hidden?.versatility ?? 10) - 10) / 4;
  const home = profileScore(player, main);
  for (const [pos, base] of Object.entries(NEIGHBOURS[main]) as Array<[Position, number]>) {
    const jitter = (hashString(`position:${player.id}:${pos}`) % 5) - 2;
    // Footedness matters for full backs and wide midfielders, less so for inverted wingers.
    let foot = 0;
    if (player.foot === 'L') foot = LEFT_SIDE.has(pos) ? 1 : RIGHT_SIDE.has(pos) ? -1 : 0;
    if (player.foot === 'R') foot = RIGHT_SIDE.has(pos) ? 1 : LEFT_SIDE.has(pos) ? -1 : 0;
    // A quick, tricky striker makes a better winger than a target man does.
    const suits = Math.max(-3, Math.min(2, Math.round((profileScore(player, pos) - home + 1.5) * 0.6)));
    const value = Math.max(1, Math.min(18, Math.round(base + jitter + versatility + foot + suits)));
    positions[pos] = Math.max(positions[pos] ?? 0, value);
  }
  return positions;
}

export function displayName(player: Player): string {
  return player.knownAs ?? `${player.firstName} ${player.lastName}`;
}

/** 'J. Smith', or the single name. */
export function shortName(player: Player): string {
  return player.knownAs ?? `${player.firstName.charAt(0)}. ${player.lastName}`;
}

export function mainPosition(player: Player): Position {
  let best: Position = 'MC';
  let bestValue = -1;
  for (const pos of POSITIONS) {
    const value = player.positions[pos] ?? 0;
    if (value > bestValue) {
      best = pos;
      bestValue = value;
    }
  }
  return best;
}

/** How well a player performs in a position: Current Ability scaled by familiarity. */
export function positionRating(player: Player, position: Position): number {
  const familiarity = player.positions[position];
  const factor = familiarity === undefined ? 0.55 : 0.55 + 0.45 * (familiarity / 20);
  return player.ca * factor;
}

/**
 * Star rating for quick comparison: Current (or Potential) Ability on a half-star scale.
 * 5 stars ≈ world class (CA 185+), 3 stars ≈ solid Premier League player (CA 135).
 */
export function abilityStars(ability: number): number {
  const stars = (ability - 60) / 25;
  return Math.round(Math.max(0.5, Math.min(5, stars)) * 2) / 2;
}

/** How good a player is in a particular position, in stars (ability adjusted for familiarity). */
export function positionStars(player: Player, position: Position): number {
  return abilityStars(positionRating(player, position));
}

export function averageForm(player: Player): number | null {
  if (player.form.length === 0) return null;
  return player.form.reduce((a, b) => a + b, 0) / player.form.length;
}

/** How well a player plays a position, in the classic four bands. */
export type PositionFit = 'natural' | 'accomplished' | 'unconvincing' | 'awkward';

export const POSITION_FIT_LABELS: Record<PositionFit, string> = {
  natural: 'Natural',
  accomplished: 'Accomplished',
  unconvincing: 'Unconvincing',
  awkward: 'Awkward',
};

/** Natural 18–20, accomplished 15–17, unconvincing 10–14, awkward below 10 (or never played there). */
export function positionFit(player: Player, position: Position): PositionFit {
  const f = player.positions[position] ?? 0;
  if (f >= 18) return 'natural';
  if (f >= 15) return 'accomplished';
  if (f >= 10) return 'unconvincing';
  return 'awkward';
}
