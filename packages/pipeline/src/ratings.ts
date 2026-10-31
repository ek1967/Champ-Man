/**
 * Rating model (PLAN §6.2): turns what the data tells us about a player into Current Ability
 * (1–200), a potential estimate, a detailed position and 1–20 attributes.
 *
 * Three signals, each scaled 0–1 within the player's position group:
 * - price: FPL price, the market's view of the player.
 * - regularity: share of minutes played, weighted by how strong the club is
 *   (starting every week for a top club is the clearest sign of quality).
 * - performance: FPL bonus-points-system score per 90 minutes, an all-round match rating.
 * The constants are tuned by reading the review report; see `npm run data:england`.
 */
import {
  type Attributes, clampAttribute, createRng, generateAttributes, hashString, type Position, random,
} from '@moc/engine';

export type FplPosition = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface Per90 {
  xg: number;
  xa: number;
  threat: number;
  creativity: number;
  tackles: number;
  cbi: number;
  recoveries: number;
  bps: number;
}

export interface RatingInput {
  id: string;
  group: FplPosition;
  /** Price in £m. */
  price: number;
  age: number;
  /** Club strength tier, 1 (weak) – 5 (elite). */
  clubTier: number;
  /** Share of the club's league minutes played: this season so far, and last season if in the data. */
  minutesNow: number;
  minutesLast: number | null;
  /** Minutes the per-90 figures are based on. */
  per90Minutes: number;
  per90: Per90 | null;
  setPieces: { corners: number | null; freeKicks: number | null; penalties: number | null };
}

export interface Rating {
  ca: number;
  potentialHeadroom: number;
  positions: Partial<Record<Position, number>>;
  attributes: Attributes;
  foot: 'L' | 'R' | 'B';
  /** The signals behind the rating, for the review report. */
  signals: { price: number; regularity: number; performance: number | null; club: number };
}

export const RATING = {
  weights: { price: 0.35, regularity: 0.35, performance: 0.2, club: 0.1 },
  /** CA = base + span × score + position offset. */
  base: 88,
  span: 92,
  /**
   * FPL prices and bonus points reward goals more than defending, but within-position ranking
   * already removes most of that; these small offsets keep the very top of the list attacking,
   * as in real-world player valuations.
   */
  positionOffset: { GK: -4, DEF: -2, MID: 1, FWD: 2 } as Record<FplPosition, number>,
  /** Per-90 figures need this many minutes to judge a player's style (position)… */
  minStyleMinutes: 180,
  /** …and this many to count towards their rating. */
  minPer90Minutes: 450,
} as const;

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Percentile ranks within a position group, so a defender's numbers are compared with defenders'. */
export type Percentiles = Partial<Record<keyof Per90 | 'price', number>>;

/** Mid-rank of `value` among sorted values, scaled 0–1 (ties share a rank). */
function rankOf(sorted: readonly number[], value: number): number {
  let lo = 0;
  while (lo < sorted.length && (sorted[lo] as number) < value) lo++;
  let hi = lo;
  while (hi < sorted.length && sorted[hi] === value) hi++;
  return sorted.length > 1 ? (lo + hi - 1) / 2 / (sorted.length - 1) : 0.5;
}

/** Role used to compare prices: deep midfielders are priced far below attacking ones. */
const PRICE_ROLE: Record<Position, string> = {
  GK: 'GK', DC: 'CB', DL: 'FB', DR: 'FB', WBL: 'FB', WBR: 'FB', DM: 'CM', MC: 'CM',
  AMC: 'AM', AML: 'AM', AMR: 'AM', ML: 'AM', MR: 'AM', ST: 'ST',
};

export function percentiles(inputs: readonly RatingInput[]): Map<string, Percentiles> {
  const out = new Map<string, Percentiles>();
  const groups: FplPosition[] = ['GK', 'DEF', 'MID', 'FWD'];
  const keys: Array<keyof Per90> = ['xg', 'xa', 'threat', 'creativity', 'tackles', 'cbi', 'recoveries', 'bps'];
  for (const group of groups) {
    const members = inputs.filter((i) => i.group === group && i.per90 && i.per90Minutes >= RATING.minStyleMinutes);
    for (const key of keys) {
      const sorted = members.map((m) => (m.per90 as Per90)[key]).sort((a, b) => a - b);
      for (const m of members) {
        const entry = out.get(m.id) ?? {};
        entry[key] = rankOf(sorted, (m.per90 as Per90)[key]);
        out.set(m.id, entry);
      }
    }
  }
  // Price rank within the playing role, which needs the style figures above.
  const roles = new Map<string, string>();
  for (const input of inputs) roles.set(input.id, PRICE_ROLE[detailedPositions(input, out.get(input.id)).main]);
  for (const role of new Set(roles.values())) {
    const members = inputs.filter((i) => roles.get(i.id) === role);
    const prices = members.map((m) => m.price).sort((a, b) => a - b);
    for (const m of members) {
      const entry = out.get(m.id) ?? {};
      entry.price = rankOf(prices, m.price);
      out.set(m.id, entry);
    }
  }
  return out;
}

export function currentAbility(input: RatingInput, pct: Percentiles | undefined) {
  // Price rank within the position; the very top of the market gets a little extra separation.
  const price = (pct?.price ?? 0) ** 1.5;
  const club = clamp01((input.clubTier - 1) / 4);
  const minutes = Math.max(input.minutesNow, (input.minutesLast ?? 0) * 0.9);
  // Club strength already counts once below; here it only slightly favours minutes at stronger clubs.
  const regularity = minutes * (0.8 + 0.2 * club);
  const performance = input.per90Minutes >= RATING.minPer90Minutes ? (pct?.bps ?? null) : null;

  const w = RATING.weights;
  let score: number;
  if (performance === null) {
    const total = w.price + w.regularity + w.club;
    score = (w.price * price + w.regularity * regularity + w.club * club) / total;
  } else {
    score = w.price * price + w.regularity * regularity + w.performance * performance + w.club * club;
  }
  let ca = RATING.base + RATING.span * score + RATING.positionOffset[input.group];
  // Teenagers who aren't playing yet are prospects, not first-teamers.
  if (input.age <= 20 && minutes < 0.3) ca -= (21 - input.age) * 3.5;
  return { ca: Math.round(Math.max(40, Math.min(195, ca))), signals: { price, regularity, performance, club } };
}

const HEADROOM_BY_AGE: Record<number, number> = {
  16: 55, 17: 50, 18: 44, 19: 37, 20: 30, 21: 23, 22: 17, 23: 12, 24: 8, 25: 5, 26: 3, 27: 1,
};

export function potentialHeadroom(age: number, ca: number): number {
  const base = HEADROOM_BY_AGE[Math.max(16, Math.min(28, age))] ?? 0;
  // Young players already good for their age have the most room.
  const precocity = age <= 22 ? Math.max(0, (ca - 110) / 60) : 0;
  return Math.round(Math.min(200 - ca, base * (1 + 0.5 * precocity)));
}

/**
 * Detailed position from the FPL group and the player's style. FPL only gives GK/DEF/MID/FWD,
 * and has no left/right information, so wide players are given both sides.
 */
export function detailedPositions(input: RatingInput, pct: Percentiles | undefined): {
  main: Position;
  positions: Partial<Record<Position, number>>;
} {
  const p = (key: keyof Per90) => pct?.[key] ?? 0.5;
  const side = random(createRng(hashString(`side:${input.id}`))) < 0.5 ? 'L' : 'R';
  switch (input.group) {
    case 'GK':
      return { main: 'GK', positions: { GK: 20 } };
    case 'DEF': {
      // Full-backs create; centre-backs clear, block and intercept.
      const fullBack = p('creativity') + p('xa') > p('cbi') * 2 + 0.15;
      if (!fullBack) return { main: 'DC', positions: { DC: 20 } };
      const main: Position = side === 'L' ? 'DL' : 'DR';
      const other: Position = side === 'L' ? 'DR' : 'DL';
      const wing: Position = side === 'L' ? 'WBL' : 'WBR';
      return { main, positions: { [main]: 20, [wing]: 17, [other]: 14 } };
    }
    case 'MID': {
      const attack = (p('threat') + p('xg') + p('creativity') + p('xa')) / 4;
      const defence = (p('tackles') + p('recoveries') + p('cbi')) / 3;
      if (defence - attack > 0.2) return { main: 'DM', positions: { DM: 20, MC: 16 } };
      // Expensive midfielders are nearly always attackers; it settles players with few minutes so far.
      const pricedAsAttacker = input.price >= 7.5;
      if (attack - defence > 0.08 || (pricedAsAttacker && attack - defence > -0.1)) {
        if (p('threat') > p('creativity')) {
          // Goal threat from midfield usually means a wide forward.
          const main: Position = side === 'L' ? 'AML' : 'AMR';
          const other: Position = side === 'L' ? 'AMR' : 'AML';
          const mid: Position = side === 'L' ? 'ML' : 'MR';
          return { main, positions: { [main]: 20, [other]: 16, [mid]: 16, AMC: 13 } };
        }
        return { main: 'AMC', positions: { AMC: 20, MC: 15, AML: 14, AMR: 14, ML: 12, MR: 12 } };
      }
      return { main: 'MC', positions: { MC: 20, DM: 14, AMC: 13 } };
    }
    case 'FWD':
      return { main: 'ST', positions: { ST: 20, AMC: 11, AML: 10, AMR: 10 } };
  }
}

/** Attributes from CA and position, then nudged by what the player actually does on the pitch. */
export function rateAttributes(
  input: RatingInput,
  main: Position,
  ca: number,
  pct: Percentiles | undefined,
): Attributes {
  const rng = createRng(hashString(`attributes:${input.id}`));
  const attributes = generateAttributes(rng, main, ca, input.age);
  const nudge = (key: keyof Attributes, by: number) => {
    attributes[key] = clampAttribute(attributes[key] + by);
  };
  if (pct && main !== 'GK') {
    const d = (key: keyof Per90, scale: number) => scale * ((pct[key] ?? 0.5) - 0.5);
    nudge('finishing', d('xg', 6));
    nudge('movement', d('threat', 4));
    nudge('passing', d('creativity', 4));
    nudge('vision', d('xa', 4));
    nudge('crossing', d('creativity', 3));
    nudge('tackling', d('tackles', 5));
    nudge('marking', d('cbi', 4));
    nudge('positioning', d('cbi', 3));
    nudge('workRate', d('recoveries', 4));
    nudge('anticipation', d('recoveries', 2));
  }
  const { corners, freeKicks, penalties } = input.setPieces;
  if (corners === 1 || freeKicks === 1) nudge('setPieces', 4);
  else if (corners === 2 || freeKicks === 2) nudge('setPieces', 2);
  if (penalties === 1) nudge('composure', 2);
  return attributes;
}

export function preferredFoot(id: string, main: Position): 'L' | 'R' | 'B' {
  const roll = random(createRng(hashString(`foot:${id}`)));
  if (roll < 0.05) return 'B';
  const leftSided = main === 'DL' || main === 'WBL' || main === 'ML' || main === 'AML';
  return roll < (leftSided ? 0.7 : 0.25) ? 'L' : 'R';
}

export function ratePlayer(input: RatingInput, pct: Percentiles | undefined): Rating {
  const { ca, signals } = currentAbility(input, pct);
  const { main, positions } = detailedPositions(input, pct);
  return {
    ca,
    potentialHeadroom: potentialHeadroom(input.age, ca),
    positions,
    attributes: rateAttributes(input, main, ca, pct),
    foot: preferredFoot(input.id, main),
    signals,
  };
}
