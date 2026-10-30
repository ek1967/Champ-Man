/**
 * Match engine (PLAN §7.2). A match is played minute by minute: possession is decided by
 * midfield control, attacks by the attackers against the defence, and shots by the shooter
 * against the keeper, all from the players' attributes, position, fitness and form, shaped by
 * each side's tactics. The same engine runs with commentary for the manager's match and
 * silently for every other Premier League match. Constants are tuned with the calibration harness.
 */
import type { Position } from './attributes.ts';
import { say } from './commentary.ts';
import { addDays, type ISODate } from './dates.ts';
import { shortName } from './players.ts';
import { chance, forkRng, normal, random, randInt, type Rng, weightedPick } from './rng.ts';
import {
  FORMATIONS, MAX_SUBSTITUTIONS, type Mentality, selectionRating, type Tactics, type TeamInstructions,
} from './tactics.ts';
import type { Club, GoalEvent, Id, Player, TeamMatchStats } from './types.ts';

export const MATCH = {
  /** Chance per minute that someone builds an attack. */
  attackRate: 0.62,
  /** Share of attacks that become a shot, before the attack/defence balance. */
  chanceBase: 0.4,
  /** How strongly the attack/defence balance changes chance creation and quality. */
  chanceExponent: 0.9,
  qualityExponent: 0.5,
  /** Typical shot quality (expected goals) and its spread. */
  xgMedian: 0.16,
  xgSpread: 0.75,
  finishingExponent: 0.8,
  keeperExponent: 0.8,
  possessionExponent: 2.6,
  homeAdvantage: 1.1,
  foulRate: 0.115,
  yellowPerFoul: 0.16,
  redPerFoul: 0.002,
  penaltyPerChance: 0.011,
  injuryPerMatch: 0.012,
  /** Energy lost per minute by a player with average stamina. */
  drain: 0.0036,
  /** How far attacks follow possession (1 = fully). */
  attackShareOfPossession: 0.5,
  /** Share of non-scoring shots that are on target (saved). */
  savedShare: 0.36,
} as const;

export type Side = 'home' | 'away';

export interface MatchEvent {
  minute: string;
  side: Side | null;
  kind:
    | 'kickoff' | 'halftime' | 'fulltime' | 'goal' | 'chance' | 'save' | 'miss' | 'blocked' | 'corner'
    | 'foul' | 'yellow' | 'red' | 'injury' | 'sub' | 'offside' | 'play';
  text: string;
  /** Goals, cards, injuries and substitutions: shown highlighted and kept in "key events only" mode. */
  key: boolean;
}

export interface LivePlayer {
  id: Id;
  side: Side;
  energy: number;
  form: number;
  rating: number;
  yellow: number;
  sentOff: boolean;
  injured: boolean;
  /** Minute they came on (0 for starters) and went off (null while on the pitch). */
  on: number;
  off: number | null;
  goals: number;
  assists: number;
}

export interface MatchSideState {
  clubId: Id;
  human: boolean;
  tactics: Tactics;
  /** Players on the pitch and the position each is playing. */
  onPitch: Array<{ id: Id; position: Position }>;
  bench: Id[];
  subsMade: number;
  stats: TeamMatchStats;
  possessionTotal: number;
}

export interface LiveMatch {
  fixtureId: Id;
  date: ISODate;
  minute: number;
  period: 'pre' | 'first' | 'half' | 'second' | 'full';
  stoppage: [number, number];
  score: [number, number];
  home: MatchSideState;
  away: MatchSideState;
  players: Record<Id, LivePlayer>;
  events: MatchEvent[];
  goals: GoalEvent[];
  /** Injuries picked up in this match: player → days out. */
  injuries: Record<Id, { name: string; days: number }>;
  rng: Rng;
  commentary: boolean;
}

/** Everything the engine needs to know about the world, without depending on the game state. */
export interface MatchContext {
  players: Record<Id, Player>;
  clubs: Record<Id, Club>;
}

const MENTALITY_INDEX: Record<Mentality, number> = { defensive: -2, cautious: -1, balanced: 0, positive: 1, attacking: 2 };

// How much each position contributes to each phase of play.
const W_CONTROL: Record<Position, number> = {
  GK: 0.05, DC: 0.25, DL: 0.4, DR: 0.4, WBL: 0.55, WBR: 0.55, DM: 1, MC: 1, ML: 0.75, MR: 0.75,
  AMC: 0.85, AML: 0.55, AMR: 0.55, ST: 0.25,
};
const W_ATTACK: Record<Position, number> = {
  GK: 0, DC: 0.05, DL: 0.25, DR: 0.25, WBL: 0.45, WBR: 0.45, DM: 0.15, MC: 0.4, ML: 0.6, MR: 0.6,
  AMC: 0.9, AML: 0.9, AMR: 0.9, ST: 1,
};
const W_DEFENCE: Record<Position, number> = {
  GK: 0.3, DC: 1, DL: 0.8, DR: 0.8, WBL: 0.6, WBR: 0.6, DM: 0.75, MC: 0.35, ML: 0.3, MR: 0.3,
  AMC: 0.12, AML: 0.15, AMR: 0.15, ST: 0.08,
};
const W_SHOOT: Record<Position, number> = {
  GK: 0, DC: 0.3, DL: 0.3, DR: 0.3, WBL: 0.4, WBR: 0.4, DM: 0.45, MC: 0.9, ML: 1, MR: 1,
  AMC: 1.25, AML: 1.25, AMR: 1.25, ST: 1.2,
};
const W_CREATE: Record<Position, number> = {
  GK: 0.02, DC: 0.2, DL: 0.8, DR: 0.8, WBL: 1, WBR: 1, DM: 0.6, MC: 1.2, ML: 1.3, MR: 1.3,
  AMC: 1.6, AML: 1.4, AMR: 1.4, ST: 0.8,
};

const avg = (...values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

function emptyStats(): TeamMatchStats {
  return { possession: 50, shots: 0, onTarget: 0, corners: 0, fouls: 0, yellow: 0, red: 0 };
}

function name(ctx: MatchContext, id: Id | undefined): string {
  const p = id ? ctx.players[id] : undefined;
  return p ? shortName(p) : '';
}

export function displayMinute(live: Pick<LiveMatch, 'minute' | 'period'>): string {
  if (live.period === 'pre') return "0'";
  if (live.period === 'first' && live.minute > 45) return `45+${live.minute - 45}'`;
  if ((live.period === 'second' || live.period === 'full') && live.minute > 90) return `90+${live.minute - 90}'`;
  if (live.period === 'half') return 'HT';
  return `${live.minute}'`;
}

// ---------- Setup ----------

function sideState(clubId: Id, tactics: Tactics, human: boolean): MatchSideState {
  const slots = FORMATIONS[tactics.formation];
  const onPitch = tactics.lineup
    .map((id, i) => ({ id, position: slots[i]?.position as Position }))
    .filter((x): x is { id: Id; position: Position } => x.id !== null);
  return { clubId, human, tactics, onPitch, bench: [...tactics.bench], subsMade: 0, stats: emptyStats(), possessionTotal: 0 };
}

export interface KickOffOptions {
  fixtureId: Id;
  date: ISODate;
  home: { clubId: Id; tactics: Tactics; human: boolean };
  away: { clubId: Id; tactics: Tactics; human: boolean };
  rng: Rng;
  commentary: boolean;
}

export function kickOff(ctx: MatchContext, options: KickOffOptions): LiveMatch {
  const rng = forkRng(options.rng);
  const live: LiveMatch = {
    fixtureId: options.fixtureId,
    date: options.date,
    minute: 0,
    period: 'pre',
    stoppage: [randInt(rng, 0, 3), randInt(rng, 2, 6)],
    score: [0, 0],
    home: sideState(options.home.clubId, options.home.tactics, options.home.human),
    away: sideState(options.away.clubId, options.away.tactics, options.away.human),
    players: {},
    events: [],
    goals: [],
    injuries: {},
    rng,
    commentary: options.commentary,
  };
  for (const side of ['home', 'away'] as const) {
    for (const { id } of live[side].onPitch) addLivePlayer(ctx, live, id, side, 0);
  }
  return live;
}

function addLivePlayer(ctx: MatchContext, live: LiveMatch, id: Id, side: Side, minute: number): void {
  const p = ctx.players[id];
  const consistency = p?.hidden.consistency ?? 10;
  live.players[id] = {
    id,
    side,
    energy: Math.max(0.3, (p?.condition ?? 100) / 100),
    // Consistent players stay close to their level; erratic ones swing more.
    form: 1 + normal(live.rng, 0, 0.075 * (1.2 - consistency / 20)),
    rating: 6.3,
    yellow: 0,
    sentOff: false,
    injured: false,
    on: minute,
    off: null,
    goals: 0,
    assists: 0,
  };
}

// ---------- Ratings ----------

interface UnitRatings {
  control: number;
  attack: number;
  defence: number;
  keeper: number;
  aerial: number;
}

function familiarity(player: Player, position: Position): number {
  const f = player.positions[position];
  return f === undefined ? 0.55 : 0.55 + 0.45 * (f / 20);
}

function effectiveness(ctx: MatchContext, live: LiveMatch, id: Id, position: Position): number {
  const p = ctx.players[id];
  const lp = live.players[id];
  if (!p || !lp) return 0;
  return familiarity(p, position) * (0.72 + 0.28 * lp.energy) * lp.form * (lp.injured ? 0.6 : 1);
}

function unitRatings(ctx: MatchContext, live: LiveMatch, side: Side): UnitRatings {
  const state = live[side];
  const ins = state.tactics.instructions;
  let control = 0;
  let attack = 0;
  let defence = 0;
  let keeper = 2;
  let aerial = 0;
  for (const { id, position } of state.onPitch) {
    const p = ctx.players[id];
    if (!p) continue;
    const a = p.attributes;
    const m = effectiveness(ctx, live, id, position);
    control += W_CONTROL[position] * m * avg(a.passing, a.decisions, a.teamwork, a.firstTouch, a.vision, a.workRate, a.anticipation);
    attack += W_ATTACK[position] * m * avg(a.dribbling, a.passing, a.vision, a.flair, a.firstTouch, a.movement, a.pace, a.finishing);
    defence += W_DEFENCE[position] * m * avg(a.tackling, a.marking, a.positioning, a.anticipation, a.heading, a.strength, a.bravery, a.pace);
    aerial += W_DEFENCE[position] * m * avg(a.heading, a.jumping, a.strength);
    if (position === 'GK') keeper = m * avg(a.reflexes, a.handling, a.oneOnOnes, a.commandOfArea, a.positioning);
  }

  const mentality = MENTALITY_INDEX[ins.mentality];
  // Committing players forward creates more but leaves gaps behind.
  attack *= 1 + 0.06 * mentality;
  defence *= 1 - 0.085 * mentality;
  control *= 1 + 0.01 * mentality;
  if (ins.passing === 'short') control *= 1.04;
  if (ins.passing === 'direct') {
    control *= 0.94;
    attack *= 1.04;
  }
  if (ins.tempo === 'fast') control *= 0.985;
  if (ins.tempo === 'slow') control *= 1.015;
  if (ins.pressing === 'high') {
    control *= 1.05;
    defence *= 1.02;
  }
  if (ins.pressing === 'low') {
    control *= 0.95;
    defence *= 1.03;
  }
  if (ins.line === 'high') control *= 1.03;
  if (ins.line === 'deep') {
    defence *= 1.04;
    attack *= 0.97;
  }
  if (ins.width === 'narrow') defence *= 1.03;
  if (ins.width === 'wide') attack *= 1.02;
  if (ins.tackling === 'hard') defence *= 1.03;
  if (ins.tackling === 'easy') defence *= 0.97;
  if (side === 'home') {
    control *= MATCH.homeAdvantage;
    attack *= MATCH.homeAdvantage;
  }
  return { control, attack, defence, keeper, aerial };
}

/** A high line is exposed by quick attackers; a deep line isn't. */
function paceThreat(ctx: MatchContext, live: LiveMatch, attacking: Side): number {
  const defending: Side = attacking === 'home' ? 'away' : 'home';
  if (live[defending].tactics.instructions.line !== 'high') return 1;
  const pace = (side: Side, positions: (p: Position) => boolean) => {
    const values = live[side].onPitch.filter((x) => positions(x.position)).map((x) => ctx.players[x.id]?.attributes.pace ?? 10);
    return values.length > 0 ? avg(...values) : 10;
  };
  const attackers = pace(attacking, (p) => ['ST', 'AML', 'AMR', 'AMC', 'ML', 'MR'].includes(p));
  const defenders = pace(defending, (p) => ['DC', 'DL', 'DR', 'WBL', 'WBR'].includes(p));
  return 1 + Math.max(0, (attackers - defenders) / 40);
}

// ---------- Events ----------

function push(ctx: MatchContext, live: LiveMatch, event: Omit<MatchEvent, 'minute'>): MatchEvent | null {
  if (!live.commentary && !event.key) return null;
  const e = { ...event, minute: displayMinute(live) };
  live.events.push(e);
  return e;
}

function teamName(ctx: MatchContext, live: LiveMatch, side: Side): string {
  return ctx.clubs[live[side].clubId]?.shortName ?? side;
}

function scoreLine(ctx: MatchContext, live: LiveMatch): string {
  return `${teamName(ctx, live, 'home')} ${live.score[0]}-${live.score[1]} ${teamName(ctx, live, 'away')}`;
}

function rate(live: LiveMatch, id: Id | undefined, by: number): void {
  const lp = id ? live.players[id] : undefined;
  if (lp) lp.rating += by;
}

function pickWeighted(ctx: MatchContext, live: LiveMatch, side: Side, weight: (p: Player, pos: Position) => number, exclude?: Id): Id | undefined {
  const options = live[side].onPitch.filter((x) => x.id !== exclude);
  if (options.length === 0) return undefined;
  return weightedPick(live.rng, options, ({ id, position }) => {
    const p = ctx.players[id];
    return p ? weight(p, position) * effectiveness(ctx, live, id, position) : 0;
  }).id;
}

const keeperOf = (live: LiveMatch, side: Side): Id | undefined => live[side].onPitch.find((x) => x.position === 'GK')?.id;

function scoreGoal(ctx: MatchContext, live: LiveMatch, side: Side, scorer: Id, assist: Id | undefined, header: boolean, penalty: boolean): void {
  live.score[side === 'home' ? 0 : 1]++;
  const minute = live.period === 'first' ? Math.min(45, live.minute) : live.minute;
  live.goals.push({ minute, clubId: live[side].clubId, scorerId: scorer, assistId: assist ?? null });
  const lp = live.players[scorer];
  if (lp) {
    lp.goals++;
    lp.rating += 1.1;
  }
  if (assist) {
    const la = live.players[assist];
    if (la) {
      la.assists++;
      la.rating += 0.6;
    }
  }
  const other: Side = side === 'home' ? 'away' : 'home';
  rate(live, keeperOf(live, other), -0.35);
  for (const { id, position } of live[other].onPitch) {
    if (['DC', 'DL', 'DR', 'WBL', 'WBR'].includes(position)) rate(live, id, -0.12);
  }
  const key = penalty ? 'penaltyGoal' : header ? 'headerGoal' : 'goal';
  push(ctx, live, { side, kind: 'goal', key: true, text: `${say(live.rng, key, { p: name(ctx, scorer) })} ${scoreLine(ctx, live)}` });
}

type ShotKind = 'open' | 'header' | 'long' | 'penalty' | 'freeKick';

function shoot(ctx: MatchContext, live: LiveMatch, side: Side, shooter: Id, assist: Id | undefined, xg: number, kind: ShotKind): void {
  const other: Side = side === 'home' ? 'away' : 'home';
  const stats = live[side].stats;
  const p = ctx.players[shooter];
  const pos = live[side].onPitch.find((x) => x.id === shooter)?.position ?? 'ST';
  const skill = !p ? 10 : kind === 'header' ? avg(p.attributes.heading, p.attributes.jumping)
    : kind === 'long' ? p.attributes.longShots
    : kind === 'freeKick' ? avg(p.attributes.setPieces, p.attributes.longShots)
    : avg(p.attributes.finishing, p.attributes.composure);
  const shooterQuality = skill * effectiveness(ctx, live, shooter, pos);
  const keeper = keeperOf(live, other);
  const keeperQuality = unitRatings(ctx, live, other).keeper;
  const pGoal = Math.min(0.92, Math.max(0.004,
    xg * (shooterQuality / 12) ** MATCH.finishingExponent * (12 / Math.max(3, keeperQuality)) ** MATCH.keeperExponent));
  stats.shots++;

  const blockable = kind === 'open' || kind === 'long';
  if (blockable && chance(live.rng, 0.2)) {
    const blocker = pickWeighted(ctx, live, other, (pl, ps) => W_DEFENCE[ps] * pl.attributes.bravery);
    rate(live, blocker, 0.08);
    push(ctx, live, { side, kind: 'blocked', key: false, text: say(live.rng, 'blocked', { q: name(ctx, blocker) }) });
    return;
  }
  const roll = random(live.rng) / (blockable ? 0.8 : 1);
  if (roll < pGoal) {
    stats.onTarget++;
    rate(live, shooter, 0.15);
    scoreGoal(ctx, live, side, shooter, assist, kind === 'header', kind === 'penalty');
    return;
  }
  if (kind === 'penalty') {
    stats.onTarget++;
    rate(live, keeper, 0.6);
    rate(live, shooter, -0.6);
    push(ctx, live, { side, kind: 'save', key: true, text: say(live.rng, 'penaltyMiss', { p: name(ctx, shooter), k: name(ctx, keeper) }) });
    return;
  }
  if (chance(live.rng, MATCH.savedShare)) {
    stats.onTarget++;
    rate(live, shooter, 0.1);
    rate(live, keeper, 0.2 + xg);
    push(ctx, live, { side, kind: 'save', key: false, text: say(live.rng, 'save', { k: name(ctx, keeper) }) });
  } else {
    rate(live, shooter, -0.05);
    push(ctx, live, { side, kind: 'miss', key: false, text: say(live.rng, 'miss', {}) });
  }
}

function attack(ctx: MatchContext, live: LiveMatch, side: Side, mine: UnitRatings, theirs: UnitRatings): void {
  const other: Side = side === 'home' ? 'away' : 'home';
  const ins = live[side].tactics.instructions;
  const balance = (mine.attack / Math.max(1, theirs.defence)) * paceThreat(ctx, live, side);
  let pChance = MATCH.chanceBase * balance ** MATCH.chanceExponent;
  if (ins.passing === 'short') pChance *= 0.93;
  pChance = Math.min(0.85, Math.max(0.05, pChance));

  if (!chance(live.rng, pChance)) {
    // The move breaks down: a corner, an offside, or the defence wins it back.
    if (chance(live.rng, 0.22)) {
      corner(ctx, live, side, theirs);
    } else if (chance(live.rng, ins.tempo === 'fast' ? 0.07 : 0.05)) {
      const runner = pickWeighted(ctx, live, side, (_p, pos) => W_SHOOT[pos]);
      push(ctx, live, { side, kind: 'offside', key: false, text: say(live.rng, 'offside', { p: name(ctx, runner) }) });
    } else {
      const defender = pickWeighted(ctx, live, other, (p, pos) => W_DEFENCE[pos] * (p.attributes.tackling + p.attributes.positioning));
      rate(live, defender, 0.04);
      if (live.commentary && chance(live.rng, 0.45)) {
        push(ctx, live, { side: other, kind: 'play', key: false, text: say(live.rng, 'breakdown', { p: name(ctx, defender), o: teamName(ctx, live, other) }) });
      }
    }
    return;
  }

  if (chance(live.rng, MATCH.penaltyPerChance)) {
    const fouled = pickWeighted(ctx, live, side, (_p, pos) => W_SHOOT[pos]);
    push(ctx, live, { side, kind: 'chance', key: true, text: say(live.rng, 'penaltyAwarded', { t: teamName(ctx, live, side), q: name(ctx, fouled) }) });
    const taker = live[side].tactics.penaltyTakerId;
    const shooter = taker && live[side].onPitch.some((x) => x.id === taker) ? taker : pickWeighted(ctx, live, side, (p, pos) => W_SHOOT[pos] * p.attributes.finishing);
    if (shooter) shoot(ctx, live, side, shooter, undefined, 0.78, 'penalty');
    return;
  }

  const crossChance = 0.22 * (ins.width === 'wide' ? 1.5 : ins.width === 'narrow' ? 0.6 : 1);
  const kind: ShotKind = chance(live.rng, crossChance) ? 'header' : chance(live.rng, 0.22) ? 'long' : 'open';
  const shooter = pickWeighted(ctx, live, side, (p, pos) => {
    const a = p.attributes;
    if (kind === 'header') return W_SHOOT[pos] * ((a.heading + a.jumping) / 20) ** 2;
    if (kind === 'long') return (W_SHOOT[pos] + W_CONTROL[pos]) * (a.longShots / 10) ** 2;
    return W_SHOOT[pos] * ((a.finishing + a.movement) / 20);
  });
  if (!shooter) return;
  const assist = chance(live.rng, kind === 'long' ? 0.35 : 0.8)
    ? pickWeighted(ctx, live, side, (p, pos) => W_CREATE[pos] * ((kind === 'header' ? p.attributes.crossing : (p.attributes.passing + p.attributes.vision) / 2) / 10) ** 2, shooter)
    : undefined;

  let xg = Math.exp(normal(live.rng, Math.log(MATCH.xgMedian), MATCH.xgSpread)) * balance ** MATCH.qualityExponent;
  if (kind === 'long') xg *= 0.35;
  if (kind === 'header') xg *= Math.min(1.4, mine.aerial / Math.max(1, theirs.aerial)) * 0.85;
  if (ins.passing === 'short') xg *= 1.05;
  if (ins.passing === 'direct') xg *= 0.94;
  xg = Math.min(0.7, Math.max(0.01, xg));

  if (live.commentary) {
    const lineKey = kind === 'header' ? 'crossChance' : kind === 'long' ? 'longShot' : 'chance';
    push(ctx, live, { side, kind: 'chance', key: false, text: say(live.rng, lineKey, { p: name(ctx, shooter), q: name(ctx, assist) || name(ctx, shooter) }) });
  }
  shoot(ctx, live, side, shooter, assist, xg, kind);
}

function corner(ctx: MatchContext, live: LiveMatch, side: Side, theirs: UnitRatings): void {
  live[side].stats.corners++;
  push(ctx, live, { side, kind: 'corner', key: false, text: say(live.rng, 'corner', { t: teamName(ctx, live, side) }) });
  if (!chance(live.rng, 0.3)) return;
  const mine = unitRatings(ctx, live, side);
  const taker = live[side].tactics.cornerTakerId;
  const delivery = (taker ? ctx.players[taker]?.attributes.setPieces : undefined) ?? 10;
  const header = pickWeighted(ctx, live, side, (p, pos) => (W_DEFENCE[pos] + W_SHOOT[pos]) * ((p.attributes.heading + p.attributes.jumping) / 20) ** 3);
  if (!header) return;
  const xg = 0.075 * (delivery / 12) * Math.min(1.5, mine.aerial / Math.max(1, theirs.aerial));
  if (live.commentary) {
    push(ctx, live, { side, kind: 'chance', key: false, text: say(live.rng, 'crossChance', { p: name(ctx, header), q: name(ctx, taker ?? undefined) || teamName(ctx, live, side) }) });
  }
  shoot(ctx, live, side, header, taker && taker !== header ? taker : undefined, xg, 'header');
}

function foul(ctx: MatchContext, live: LiveMatch, side: Side): void {
  // `side` commits the foul.
  const other: Side = side === 'home' ? 'away' : 'home';
  const ins = live[side].tactics.instructions;
  live[side].stats.fouls++;
  // Booked players tread carefully.
  const offender = pickWeighted(ctx, live, side, (p, pos) =>
    (W_DEFENCE[pos] + 0.3) * (p.attributes.aggression + 4) * (21 - p.hidden.sportsmanship) / 10 * ((live.players[p.id]?.yellow ?? 0) > 0 ? 0.35 : 1));
  const victim = pickWeighted(ctx, live, other, (p, pos) => (W_ATTACK[pos] + 0.3) * p.attributes.dribbling);
  if (!offender) return;
  rate(live, offender, -0.05);
  const cardScale = ins.tackling === 'hard' ? 1.35 : ins.tackling === 'easy' ? 0.7 : 1;
  const lp = live.players[offender];
  if (chance(live.rng, MATCH.redPerFoul * cardScale)) {
    sendOff(ctx, live, side, offender, 'red');
    return;
  }
  // Hot-headed players are booked more often.
  const temper = 1.3 - (ctx.players[offender]?.hidden.temperament ?? 10) / 20 * 0.6;
  const caution = lp && lp.yellow > 0 ? 0.5 : 1;
  if (lp && chance(live.rng, MATCH.yellowPerFoul * cardScale * temper * caution)) {
    lp.yellow++;
    live[side].stats.yellow++;
    lp.rating -= 0.3;
    if (lp.yellow >= 2) {
      sendOff(ctx, live, side, offender, 'secondYellow');
      return;
    }
    push(ctx, live, { side, kind: 'yellow', key: true, text: say(live.rng, 'yellow', { p: name(ctx, offender) }) });
    return;
  }
  // A foul in shooting range gives a direct free kick.
  if (chance(live.rng, 0.09)) {
    const taker = live[other].tactics.freeKickTakerId;
    const shooter = taker && live[other].onPitch.some((x) => x.id === taker) ? taker : victim;
    if (!shooter) return;
    if (live.commentary) push(ctx, live, { side: other, kind: 'chance', key: false, text: say(live.rng, 'freeKickShot', { p: name(ctx, shooter) }) });
    shoot(ctx, live, other, shooter, undefined, 0.065, 'freeKick');
  } else if (live.commentary && chance(live.rng, 0.35)) {
    push(ctx, live, { side: other, kind: 'foul', key: false, text: say(live.rng, 'freeKick', { t: teamName(ctx, live, other), p: name(ctx, victim), q: name(ctx, offender) }) });
  }
}

function removeFromPitch(live: LiveMatch, side: Side, id: Id): void {
  live[side].onPitch = live[side].onPitch.filter((x) => x.id !== id);
  const lp = live.players[id];
  if (lp) lp.off = live.minute;
}

function sendOff(ctx: MatchContext, live: LiveMatch, side: Side, id: Id, key: 'red' | 'secondYellow'): void {
  const lp = live.players[id];
  if (!lp) return;
  lp.sentOff = true;
  lp.rating -= 1.5;
  live[side].stats.red++;
  const wasKeeper = live[side].onPitch.find((x) => x.id === id)?.position === 'GK';
  removeFromPitch(live, side, id);
  push(ctx, live, { side, kind: 'red', key: true, text: say(live.rng, key, { p: name(ctx, id) }) });
  // Without a keeper, the computer sends on the reserve keeper (or puts someone in goal).
  if (wasKeeper) {
    const reserve = live[side].bench.find((b) => (ctx.players[b]?.positions.GK ?? 0) >= 15);
    const victim = live[side].onPitch.filter((x) => x.position !== 'GK').sort((a, b) => W_ATTACK[b.position] - W_ATTACK[a.position])[0];
    if (reserve && victim && live[side].subsMade < MAX_SUBSTITUTIONS) {
      substitute(ctx, live, side, victim.id, reserve);
      const slot = live[side].onPitch.find((x) => x.id === reserve);
      if (slot) slot.position = 'GK';
    } else {
      const stand = live[side].onPitch[live[side].onPitch.length - 1];
      if (stand) stand.position = 'GK';
    }
  }
}

const INJURIES: Array<{ name: string; min: number; max: number; weight: number }> = [
  { name: 'Knock', min: 2, max: 6, weight: 30 },
  { name: 'Tight hamstring', min: 5, max: 12, weight: 20 },
  { name: 'Calf strain', min: 10, max: 25, weight: 15 },
  { name: 'Twisted ankle', min: 7, max: 21, weight: 15 },
  { name: 'Hamstring strain', min: 18, max: 42, weight: 10 },
  { name: 'Knee ligament damage', min: 35, max: 90, weight: 6 },
  { name: 'Broken foot', min: 50, max: 100, weight: 4 },
];

function injuries(ctx: MatchContext, live: LiveMatch, side: Side, drainScale: number): void {
  for (const { id } of live[side].onPitch) {
    const p = ctx.players[id];
    const lp = live.players[id];
    if (!p || !lp || lp.injured) continue;
    const risk = (MATCH.injuryPerMatch / 90) * (p.hidden.injuryProneness / 10) * (1.6 - lp.energy) * drainScale;
    if (!chance(live.rng, risk)) continue;
    lp.injured = true;
    const kind = weightedPick(live.rng, INJURIES, (i) => i.weight);
    live.injuries[id] = { name: kind.name, days: randInt(live.rng, kind.min, kind.max) };
    push(ctx, live, { side, kind: 'injury', key: true, text: say(live.rng, 'injury', { p: name(ctx, id) }) });
  }
}

/** Swaps a player on the pitch for one on the bench. Returns false if the change isn't allowed. */
export function substitute(ctx: MatchContext, live: LiveMatch, side: Side, outId: Id, inId: Id): boolean {
  const state = live[side];
  if (state.subsMade >= MAX_SUBSTITUTIONS || live.period === 'full') return false;
  const slot = state.onPitch.find((x) => x.id === outId);
  if (!slot || !state.bench.includes(inId)) return false;
  const position = slot.position;
  removeFromPitch(live, side, outId);
  state.bench = state.bench.filter((b) => b !== inId);
  state.subsMade++;
  addLivePlayer(ctx, live, inId, side, live.minute);
  state.onPitch.push({ id: inId, position });
  push(ctx, live, { side, kind: 'sub', key: true, text: say(live.rng, 'sub', { t: teamName(ctx, live, side), p: name(ctx, inId), q: name(ctx, outId) }) });
  return true;
}

/** Changes a side's instructions (or formation positions are kept) during the match. */
export function setInstructions(live: LiveMatch, side: Side, instructions: TeamInstructions): void {
  live[side].tactics = { ...live[side].tactics, instructions: { ...instructions } };
}

/** Moves a player on the pitch to a different position (e.g. a winger to centre-forward). */
export function movePlayer(live: LiveMatch, side: Side, id: Id, position: Position): void {
  const slot = live[side].onPitch.find((x) => x.id === id);
  if (slot) slot.position = position;
}

/** The computer manager: changes tired or injured players, and chases or protects a result late on. */
function computerManager(ctx: MatchContext, live: LiveMatch, side: Side): void {
  const state = live[side];
  const injured = state.onPitch.find((x) => live.players[x.id]?.injured);
  const canSub = state.subsMade < MAX_SUBSTITUTIONS && state.bench.length > 0;
  const bestFor = (position: Position) => state.bench
    .map((id) => ctx.players[id])
    .filter((p): p is Player => p !== undefined)
    .sort((a, b) => selectionRating(b, position) - selectionRating(a, position))[0];

  if (injured && canSub) {
    const replacement = bestFor(injured.position);
    if (replacement) substitute(ctx, live, side, injured.id, replacement.id);
    return;
  }
  if (state.human) return;

  if (canSub && live.minute >= 58 && state.subsMade < 4 && chance(live.rng, 0.09)) {
    const tired = [...state.onPitch]
      .filter((x) => x.position !== 'GK')
      .sort((a, b) => (live.players[a.id]?.energy ?? 1) - (live.players[b.id]?.energy ?? 1))[0];
    const replacement = tired ? bestFor(tired.position) : undefined;
    if (tired && replacement) substitute(ctx, live, side, tired.id, replacement.id);
  }
  if (live.period === 'second' && (live.minute === 70 || live.minute === 80)) {
    const [mine, theirs] = side === 'home' ? live.score : [live.score[1], live.score[0]];
    const ins = { ...state.tactics.instructions };
    if (mine < theirs) ins.mentality = live.minute >= 80 ? 'attacking' : 'positive';
    else if (mine > theirs && live.minute >= 80) ins.mentality = 'cautious';
    setInstructions(live, side, ins);
  }
}

// ---------- The minute ----------

function drainFor(ins: TeamInstructions): number {
  return (ins.pressing === 'high' ? 1.25 : ins.pressing === 'low' ? 0.85 : 1) * (ins.tempo === 'fast' ? 1.15 : ins.tempo === 'slow' ? 0.9 : 1);
}

function playMinute(ctx: MatchContext, live: LiveMatch): void {
  const home = unitRatings(ctx, live, 'home');
  const away = unitRatings(ctx, live, 'away');
  const ch = home.control ** MATCH.possessionExponent;
  const ca = away.control ** MATCH.possessionExponent;
  const pHome = ch / Math.max(1e-9, ch + ca);
  live.home.possessionTotal += pHome;
  live.away.possessionTotal += 1 - pHome;

  const tempo = (ins: TeamInstructions) => (ins.tempo === 'fast' ? 1.12 : ins.tempo === 'slow' ? 0.88 : 1);
  const rate = MATCH.attackRate * (tempo(live.home.tactics.instructions) + tempo(live.away.tactics.instructions)) / 2;
  // Attacks follow possession, but less than fully: sides without the ball still break.
  const attackHome = 0.5 + (pHome - 0.5) * MATCH.attackShareOfPossession;
  if (chance(live.rng, rate)) {
    if (chance(live.rng, attackHome)) attack(ctx, live, 'home', home, away);
    else attack(ctx, live, 'away', away, home);
  } else if (live.commentary && chance(live.rng, 0.12)) {
    const side: Side = chance(live.rng, pHome) ? 'home' : 'away';
    const p = pickWeighted(ctx, live, side, (_p, pos) => W_CONTROL[pos]);
    const q = pickWeighted(ctx, live, side, (_p, pos) => W_ATTACK[pos], p);
    push(ctx, live, { side, kind: 'play', key: false, text: say(live.rng, 'build', { p: name(ctx, p), q: name(ctx, q), t: teamName(ctx, live, side) }) });
  }

  for (const side of ['home', 'away'] as const) {
    const ins = live[side].tactics.instructions;
    const foulScale = (ins.tackling === 'hard' ? 1.45 : ins.tackling === 'easy' ? 0.65 : 1) * (ins.pressing === 'high' ? 1.15 : ins.pressing === 'low' ? 0.85 : 1);
    // The side without the ball commits more fouls.
    const without = side === 'home' ? 1 - pHome : pHome;
    if (chance(live.rng, MATCH.foulRate * foulScale * (0.6 + 0.8 * without))) foul(ctx, live, side);

    const drain = drainFor(ins);
    for (const { id } of live[side].onPitch) {
      const p = ctx.players[id];
      const lp = live.players[id];
      if (!p || !lp) continue;
      const stamina = (p.attributes.stamina + p.attributes.fitness) / 2;
      lp.energy = Math.max(0, lp.energy - MATCH.drain * (1.35 - stamina / 20 * 0.7) * drain);
    }
    injuries(ctx, live, side, drain);
    computerManager(ctx, live, side);
  }
}

/** Advances the match by one minute (or across a break) and returns the events it produced. */
export function stepMatch(ctx: MatchContext, live: LiveMatch): MatchEvent[] {
  const before = live.events.length;
  switch (live.period) {
    case 'full':
      return [];
    case 'pre':
      live.period = 'first';
      push(ctx, live, { side: 'home', kind: 'kickoff', key: true, text: say(live.rng, 'kickoff', { t: teamName(ctx, live, 'home'), s: ctx.clubs[live.home.clubId]?.stadium ?? 'the stadium' }) });
      return live.events.slice(before);
    case 'half':
      live.period = 'second';
      live.minute = 45;
      push(ctx, live, { side: 'away', kind: 'kickoff', key: true, text: say(live.rng, 'secondHalf', {}) });
      return live.events.slice(before);
    default:
      break;
  }
  live.minute++;
  playMinute(ctx, live);
  if (live.period === 'first' && live.minute >= 45 + live.stoppage[0]) {
    live.period = 'half';
    push(ctx, live, { side: null, kind: 'halftime', key: true, text: say(live.rng, 'halftime', { s: scoreLine(ctx, live) }) });
  } else if (live.period === 'second' && live.minute >= 90 + live.stoppage[1]) {
    live.period = 'full';
    finishRatings(live);
    push(ctx, live, { side: null, kind: 'fulltime', key: true, text: say(live.rng, 'fulltime', { s: scoreLine(ctx, live) }) });
  }
  return live.events.slice(before);
}

function finishRatings(live: LiveMatch): void {
  const [h, a] = live.score;
  for (const lp of Object.values(live.players)) {
    if (lp.off === null) lp.off = live.minute;
    const diff = lp.side === 'home' ? h - a : a - h;
    lp.rating += diff > 0 ? 0.3 : diff < 0 ? -0.3 : 0;
    if (diff >= 0 && (lp.side === 'home' ? a : h) === 0) lp.rating += 0.3; // clean sheet
    lp.rating = Math.round(Math.max(3, Math.min(10, lp.rating)) * 10) / 10;
  }
  for (const side of ['home', 'away'] as const) {
    const total = live.home.possessionTotal + live.away.possessionTotal;
    live[side].stats.possession = total > 0 ? Math.round((live[side].possessionTotal / total) * 100) : 50;
  }
}

/** Plays the whole match at once (no commentary). */
export function playToEnd(ctx: MatchContext, live: LiveMatch): void {
  let guard = 0;
  while (live.period !== 'full' && guard++ < 200) stepMatch(ctx, live);
}

/** Possession so far, for the live stats panel. */
export function livePossession(live: LiveMatch): [number, number] {
  const total = live.home.possessionTotal + live.away.possessionTotal;
  if (total === 0) return [50, 50];
  const home = Math.round((live.home.possessionTotal / total) * 100);
  return [home, 100 - home];
}

export function injuryEnd(date: ISODate, days: number): ISODate {
  return addDays(date, days);
}

