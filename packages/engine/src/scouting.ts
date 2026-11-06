/**
 * Scouting (PLAN §3, §7.1): the manager only sees other clubs' players approximately until they
 * know them. Knowledge (0–100) comes from playing against a player, from players in the same
 * league (seen every week), and above all from sending scouts. What the screens show is derived
 * from knowledge: attribute ranges, estimated ability and a potential range.
 */
import type { AttributeKey } from './attributes.ts';
import { addDays, ageOn, formatShort, type ISODate, yearOf } from './dates.ts';
import { addNews, clubLink, playerLink } from './news.ts';
import type { Position } from './attributes.ts';
import { abilityStars, estimateValue, estimateWage, generatePlayer, mainPosition, positionRating, roundMoney, shortName } from './players.ts';
import { getClub, squadOf } from './queries.ts';
import { createRng, hashString, normal, random, randInt, shuffle } from './rng.ts';
import { autoTactics, FORMATIONS } from './tactics.ts';
import { ABROAD, askingPrice, attractCeiling, availableBudget, formatMoney, sellerName, wageDemand, willingToJoin } from './transfers.ts';
import type { GameState, Id, Player } from './types.ts';

/** Countries scouts can travel to (the other countries planned for the game, plus France and Belgium). */
export const SCOUTING_COUNTRIES = ['esp', 'ita', 'ger', 'fra', 'ned', 'por', 'bel', 'cze', 'arg', 'bra', 'usa'] as const;

/** Days a trip abroad takes, and how long the players found stay available. */
const COUNTRY_TRIP_DAYS = 14;
const ABROAD_AVAILABLE_DAYS = 120;

/** What the manager wants a scout to find. */
export type ScoutNeed = 'first' | 'backup' | 'future';

export interface ScoutCriteria {
  /** A position, or 'any' for the weakest places in the side. */
  position: Position | 'any';
  /** First-team ready, a squad backup, or a prospect for the future. */
  need: ScoutNeed;
  /** 'league' (the manager's own), 'all' (every league in the game), a nation with leagues in the game, or a country abroad. */
  where: string;
  /** Most the club should pay in fees; the money free to spend when not given. */
  maxFee?: number;
  /** Ability and potential the player should have, in stars (0.5–5). */
  minAbility?: number;
  minPotential?: number;
}

/** Stars to one decimal place (2.3★), for comparing players more finely than the half-star display. */
export function preciseStars(ability: number): number {
  return Math.round(Math.max(0.5, Math.min(5, (ability - 60) / 25)) * 10) / 10;
}

/** Current Ability for a star rating (the inverse of abilityStars). */
export function abilityForStars(stars: number): number {
  return 60 + stars * 25;
}

/** The most a brief allows in fees: its own limit, or the money the manager has free. */
export function briefMaxFee(state: GameState, c: ScoutCriteria): number {
  if (c.maxFee !== undefined) return c.maxFee;
  const clubId = state.manager.clubId;
  return clubId ? Math.max(250_000, availableBudget(state, clubId)) : 0;
}

export interface PositionComparison {
  position: Position;
  /** The player's rating at the position (as the scouts see it), in stars. */
  stars: number;
  exact: boolean;
  /** The manager's players best suited to the position, best first. */
  squad: Array<{ id: Id; name: string; stars: number; inSide: boolean }>;
}

/**
 * How a player compares with the manager's own players in a position (their main one unless
 * given): the scouts' view of them against the manager's best options there.
 */
export function positionComparison(state: GameState, player: Player, position: Position = mainPosition(player)): PositionComparison | null {
  const clubId = state.manager.clubId;
  if (!clubId) return null;
  const squad = squadOf(state, clubId).filter((p) => p.id !== player.id);
  const tactics = state.manager.tactics ?? autoTactics(squad, state.date);
  const inSide = new Set(tactics.lineup.filter((id): id is Id => !!id));
  const mine = squad
    .map((p) => ({ p, rating: positionRating(p, position) }))
    .filter((x) => (x.p.positions[position] ?? 0) >= 12)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 4)
    .map(({ p, rating }) => ({ id: p.id, name: shortName(p), stars: preciseStars(rating), inSide: inSide.has(p.id) }));
  const factor = player.ca > 0 ? positionRating(player, position) / player.ca : 1;
  // As well as the scouts know the player: exact when fully scouted, otherwise their estimate.
  const known = knowledgeOf(state, player) >= 100;
  const offset = known ? 0 : (estimatedAbilityValue(state, player) - player.ca);
  const stars = preciseStars((player.ca + offset) * factor);
  return { position, stars, exact: known, squad: mine };
}

/** "At left-back you have Tierney 3★ (in your side), Ralston 2★; this player is 3.5★ there." */
export function comparisonLine(state: GameState, player: Player, position?: Position): string {
  const c = positionComparison(state, player, position);
  if (!c) return '';
  const where = POSITION_WORDS[c.position][0];
  const theirs = `${c.exact ? '' : 'about '}${c.stars}★`;
  if (c.squad.length === 0) return `You have nobody who plays ${where}; this player is ${theirs} there.`;
  const list = c.squad.map((m) => `${m.name} ${m.stars}★${m.inSide ? ' (in your side)' : ''}`).join(', ');
  return `At ${where} you have ${list}; this player is ${theirs} there.`;
}

export const SCOUT_NEED_LABELS: Record<ScoutNeed, string> = {
  first: 'first-team ready',
  backup: 'squad backup',
  future: 'one for the future',
};

/** A search's results, for the Scouting screen. */
export interface ScoutSearch {
  date: ISODate;
  criteria: ScoutCriteria;
  label: string;
  playerIds: Id[];
  /** The position each player was found for (same order). */
  positions?: Position[];
}

export interface ScoutAssignment {
  id: Id;
  /**
   * 'search': look for players matching `criteria` in the leagues in the game.
   * 'country': a trip abroad (targetId is a nation) to find players outside the simulated leagues.
   */
  kind: 'player' | 'club' | 'country' | 'search';
  criteria?: ScoutCriteria;
  targetId: Id;
  started: ISODate;
  due: ISODate;
}

export interface ScoutReport {
  date: ISODate;
  /** The scout's view of the player's potential, in stars (may be a little off). */
  potentialStars: number;
  grade: 'A' | 'B' | 'C' | 'D';
  verdict: string;
}

export interface ScoutingState {
  knowledge: Record<Id, number>;
  assignments: ScoutAssignment[];
  shortlist: Id[];
  reports: Record<Id, ScoutReport>;
  counter: number;
  /** Latest searches first. */
  searches?: ScoutSearch[];
}

export function scouting(state: GameState): ScoutingState {
  state.scouting ??= { knowledge: {}, assignments: [], shortlist: [], reports: {}, counter: 0 };
  return state.scouting;
}

/** Scouting staff from club size: how many assignments at once, and how good their judgement is. */
export function scoutingStaff(state: GameState): { scouts: number; judgement: number } {
  const club = state.manager.clubId ? state.world.clubs[state.manager.clubId] : undefined;
  const rep = club?.reputation ?? 40;
  return { scouts: 1 + Math.floor(rep / 30), judgement: Math.round(6 + (rep / 100) * 13) };
}

const isMine = (state: GameState, player: Player): boolean =>
  !!state.manager.clubId && (player.clubId === state.manager.clubId || player.loan?.fromId === state.manager.clubId);

/** How well the manager knows a player, 0–100. */
export function knowledgeOf(state: GameState, player: Player): number {
  if (!state.manager.clubId || isMine(state, player)) return 100;
  const known = state.scouting?.knowledge[player.id] ?? 0;
  const myLeague = state.world.clubs[state.manager.clubId]?.leagueId;
  const club = player.clubId ? state.world.clubs[player.clubId] : undefined;
  const base = club && club.leagueId === myLeague ? 35 : 10;
  return Math.max(known, base);
}

/** A stable pseudo-random number in [0, 1) for this player and purpose, so estimates don't jump about. */
function noise(state: GameState, player: Player, purpose: string): number {
  return random(createRng(hashString(`${state.seed}:${player.id}:${purpose}`)));
}

/** The scouts' estimate of a player's Current Ability (exact for players they know fully). */
function estimatedAbilityValue(state: GameState, player: Player): number {
  const k = knowledgeOf(state, player);
  if (k >= 100) return player.ca;
  return player.ca + (noise(state, player, 'ca') - 0.5) * 2 * (1 - k / 100) * 22;
}

/** Estimated ability in stars, and whether it's exact. */
export function estimatedAbility(state: GameState, player: Player): { stars: number; exact: boolean } {
  const k = knowledgeOf(state, player);
  return { stars: abilityStars(estimatedAbilityValue(state, player)), exact: k >= 100 };
}

/** Potential as a star range: narrow when well known, wide when not. */
export function estimatedPotential(state: GameState, player: Player): { min: number; max: number } {
  const report = state.scouting?.reports[player.id];
  const k = knowledgeOf(state, player);
  if (isMine(state, player)) {
    // Your own coaches' view: close to the truth, never exact.
    const s = abilityStars(player.pa + (noise(state, player, 'pa-own') - 0.5) * 8);
    return { min: s, max: s };
  }
  if (report && k >= 90) return { min: report.potentialStars, max: report.potentialStars };
  const centre = player.pa + (noise(state, player, 'pa') - 0.5) * 2 * (1 - k / 100) * 30;
  const half = (1 - k / 100) * 1.5;
  const clamp = (x: number) => Math.max(0.5, Math.min(5, Math.round(x * 2) / 2));
  const stars = (ca: number) => (ca - 60) / 25;
  return { min: clamp(stars(centre) - half), max: clamp(stars(centre) + half) };
}

/** An attribute as the manager sees it: exact, or a range that contains the true value. */
export function attributeView(state: GameState, player: Player, key: AttributeKey): { low: number; high: number } {
  const value = player.attributes[key];
  const k = knowledgeOf(state, player);
  const width = Math.round((1 - k / 100) * 6);
  if (width <= 0) return { low: value, high: value };
  const shift = Math.floor(noise(state, player, key) * (width + 1));
  const low = Math.max(1, value - shift);
  const high = Math.min(20, low + width);
  return { low, high };
}

// ---------- Assignments ----------

export type ScoutResult = { ok: boolean; message: string };

export function activeAssignments(state: GameState): ScoutAssignment[] {
  return scouting(state).assignments;
}

export function scoutPlayer(state: GameState, playerId: Id): ScoutResult {
  const player = state.world.players[playerId];
  if (!player || !state.manager.clubId) return { ok: false, message: 'Nobody to scout.' };
  if (isMine(state, player)) return { ok: false, message: 'Your coaches already know your own players.' };
  return assign(state, 'player', playerId, sameLeague(state, player.clubId) ? 3 : 6, shortName(player));
}

export function scoutClub(state: GameState, clubId: Id): ScoutResult {
  if (clubId === state.manager.clubId) return { ok: false, message: 'Your coaches already know your own squad.' };
  const club = getClub(state, clubId);
  return assign(state, 'club', clubId, sameLeague(state, clubId) ? 8 : 12, club.shortName);
}

/** Sends a scout to a country to find players at clubs there who could improve the squad. */
export function scoutCountry(state: GameState, nationId: Id): ScoutResult {
  const nation = state.world.nations[nationId];
  if (!nation || !state.manager.clubId) return { ok: false, message: 'Nowhere to scout.' };
  return assign(state, 'country', nationId, COUNTRY_TRIP_DAYS, `players in ${nation.name}`);
}

const POSITION_WORDS: Record<Position, [string, string]> = {
  GK: ['goalkeeper', 'goalkeepers'], DC: ['centre-back', 'centre-backs'], DL: ['left-back', 'left-backs'], DR: ['right-back', 'right-backs'],
  WBL: ['left wing-back', 'left wing-backs'], WBR: ['right wing-back', 'right wing-backs'], DM: ['defensive midfielder', 'defensive midfielders'],
  MC: ['central midfielder', 'central midfielders'], ML: ['left midfielder', 'left midfielders'], MR: ['right midfielder', 'right midfielders'],
  AML: ['left winger', 'left wingers'], AMR: ['right winger', 'right wingers'], AMC: ['attacking midfielder', 'attacking midfielders'],
  ST: ['striker', 'strikers'],
};

/** "left-backs, first-team ready, in Scotland". */
export function describeSearch(state: GameState, c: ScoutCriteria): string {
  const what = c.position === 'any' ? 'players for your weakest positions' : POSITION_WORDS[c.position][1];
  const targets = [
    c.minAbility ? `${c.minAbility}★+ now` : '',
    c.minPotential ? `${c.minPotential}★+ potential` : '',
    c.maxFee !== undefined ? `up to ${formatMoney(c.maxFee)}` : '',
  ].filter(Boolean);
  return `${what} (${[SCOUT_NEED_LABELS[c.need], ...targets].join(', ')}) ${whereLabel(state, c.where)}`;
}

function whereLabel(state: GameState, where: string): string {
  if (where === 'league') {
    const club = state.manager.clubId ? state.world.clubs[state.manager.clubId] : undefined;
    return `in the ${club ? state.world.competitions[club.leagueId]?.name ?? 'league' : 'league'}`;
  }
  if (where === 'all') return 'in every league in the game';
  return `in ${state.world.nations[where]?.name ?? where}`;
}

/** Nations whose leagues are in the game (searched among real clubs). */
export function nationsInGame(state: GameState): Array<{ id: Id; name: string }> {
  const ids = [...new Set(Object.values(state.world.competitions).map((c) => c.nationId))];
  return ids.map((id) => ({ id, name: state.world.nations[id]?.name ?? id }));
}

/**
 * Sends a scout to find players: a position (or the weakest places in the side), what kind of
 * player, and where. Leagues in the game take a week (five days in your own league); a country
 * abroad takes two weeks.
 */
export function findPlayers(state: GameState, criteria: ScoutCriteria): ScoutResult {
  if (!state.manager.clubId) return { ok: false, message: 'You need a club to send scouts.' };
  const label = describeSearch(state, criteria);
  const key = `search:${criteria.position}:${criteria.need}:${criteria.where}`;
  const inGame = criteria.where === 'league' || criteria.where === 'all' || nationsInGame(state).some((n) => n.id === criteria.where);
  if (inGame) return assign(state, 'search', key, criteria.where === 'league' ? 5 : 7, label, criteria);
  if (!state.world.nations[criteria.where]) return { ok: false, message: 'Nowhere to scout.' };
  return assign(state, 'country', criteria.where, COUNTRY_TRIP_DAYS, label, criteria);
}

/** Countries a scout can be sent to in this world. */
export function scoutingCountries(state: GameState): Array<{ id: Id; name: string }> {
  return SCOUTING_COUNTRIES.filter((id) => state.world.nations[id]).map((id) => ({ id, name: state.world.nations[id]!.name }));
}

/** Players found abroad who can still be bought, newest first. */
export function playersAbroad(state: GameState): Player[] {
  return Object.values(state.world.players)
    .filter((p) => p.abroad && !p.retired && p.abroad.until >= state.date)
    .sort((a, b) => (a.abroad!.until < b.abroad!.until ? 1 : -1));
}

function sameLeague(state: GameState, clubId: Id | null): boolean {
  if (!clubId || !state.manager.clubId) return false;
  return state.world.clubs[clubId]?.leagueId === state.world.clubs[state.manager.clubId]?.leagueId;
}

function assign(state: GameState, kind: ScoutAssignment['kind'], targetId: Id, days: number, label: string, criteria?: ScoutCriteria): ScoutResult {
  const s = scouting(state);
  if (s.assignments.some((a) => a.targetId === targetId)) return { ok: false, message: `A scout is already watching ${label}.` };
  const { scouts } = scoutingStaff(state);
  if (s.assignments.length >= scouts) {
    return { ok: false, message: `All ${scouts} of your scouts are busy. The next one is free on ${formatShort(s.assignments.map((a) => a.due).sort()[0]!)}.` };
  }
  s.counter++;
  const due = addDays(state.date, days);
  s.assignments.push({ id: `s${s.counter}`, kind, targetId, started: state.date, due, ...(criteria ? { criteria } : {}) });
  const verb = kind === 'search' || kind === 'country' ? 'look for' : 'watch';
  return { ok: true, message: `A scout is on the way to ${verb} ${label}. Report due ${formatShort(due)}.` };
}

export function cancelAssignment(state: GameState, assignmentId: Id): void {
  const s = scouting(state);
  s.assignments = s.assignments.filter((a) => a.id !== assignmentId);
}

export function toggleShortlist(state: GameState, playerId: Id): boolean {
  const s = scouting(state);
  const on = !s.shortlist.includes(playerId);
  s.shortlist = on ? [...s.shortlist, playerId] : s.shortlist.filter((id) => id !== playerId);
  return on;
}

// ---------- Reports ----------

const GRADE_TEXT: Record<ScoutReport['grade'], string> = {
  A: 'Would walk into your first team.',
  B: 'Good enough to compete for a place.',
  C: 'A squad player for you.',
  D: 'Not good enough for your squad.',
};

/** Grades a player against the manager's current first-choice player in the same position. */
function gradeFor(state: GameState, player: Player): ScoutReport['grade'] {
  const clubId = state.manager.clubId!;
  const position = mainPosition(player);
  const squad = squadOf(state, clubId);
  const tactics = state.manager.tactics ?? autoTactics(squad, state.date);
  const slots = FORMATIONS[tactics.formation];
  const ratings = tactics.lineup
    .map((id, i) => ({ id, pos: slots[i]?.position }))
    .filter((x) => x.pos === position || (x.pos && x.pos.slice(-1) === position.slice(-1) && x.pos[0] === position[0]))
    .map((x) => {
      const p = squad.find((s) => s.id === x.id);
      return p && x.pos ? positionRating(p, x.pos) : 0;
    });
  const starter = ratings.length > 0 ? Math.min(...ratings) : Math.max(0, ...squad.map((p) => positionRating(p, position))) - 10;
  const diff = positionRating(player, position) - starter;
  if (diff >= 4) return 'A';
  if (diff >= -6) return 'B';
  if (diff >= -20) return 'C';
  return 'D';
}

/** A scout's full assessment of a player, kept as their report (no news item). */
function assess(state: GameState, player: Player): ScoutReport {
  const s = scouting(state);
  const { judgement } = scoutingStaff(state);
  s.knowledge[player.id] = 100;
  // Better scouts misjudge potential by less.
  const error = normal(createRng(hashString(`${state.seed}:${player.id}:report:${state.date}`)), 0, (21 - judgement) * 1.2);
  const potentialStars = abilityStars(Math.max(player.ca, player.pa + error));
  const grade = gradeFor(state, player);
  const age = ageOn(player.dateOfBirth, state.date);
  const prospect = age <= 21 && potentialStars >= 4 ? ' One for the future.' : '';
  const report = { date: state.date, potentialStars, grade, verdict: `${GRADE_TEXT[grade]}${prospect}` };
  s.reports[player.id] = report;
  return report;
}

function writeReport(state: GameState, player: Player): void {
  const { potentialStars, grade, verdict } = assess(state, player);
  const age = ageOn(player.dateOfBirth, state.date);
  const club = player.clubId ? state.world.clubs[player.clubId] : undefined;
  const willing = state.manager.clubId ? willingToJoin(state, player, state.manager.clubId) : { ok: true };
  const where = club ? ` at ${clubLink(club)}` : player.abroad ? `, at ${sellerName(state, ABROAD, player.id)}` : ', free agent';
  addNews(state, {
    category: 'transfer',
    title: `Scout report: ${shortName(player)} (${grade})`,
    body: [
      `${playerLink(player)}, ${age}, ${mainPosition(player)}${where}.`,
      `Ability ${abilityStars(player.ca)}★ · Potential about ${potentialStars}★`,
      `Verdict: ${verdict}`,
      comparisonLine(state, player),
      club || player.abroad ? `${club ? club.shortName : 'Their club'} would want around ${formatMoney(askingPrice(state, player))}.` : 'Available on a free transfer.',
      state.manager.clubId ? `Expected wage demand: ${formatMoney(wageDemand(state, player, state.manager.clubId))} a week.` : '',
      willing.ok ? '' : `Note: the player ${willing.reason}.`,
    ].filter(Boolean).join('\n\n'),
  });
}

/** Watching a whole club: everyone becomes reasonably well known; the best get a quick verdict. */
function writeClubReport(state: GameState, clubId: Id): void {
  const s = scouting(state);
  const squad = squadOf(state, clubId);
  for (const p of squad) s.knowledge[p.id] = Math.max(s.knowledge[p.id] ?? 0, 75);
  const graded = squad.map((p) => ({ p, grade: gradeFor(state, p) })).filter((x) => x.grade === 'A' || x.grade === 'B');
  const club = getClub(state, clubId);
  addNews(state, {
    category: 'transfer',
    title: `Scout report: ${club.shortName} squad`,
    body: [
      `Your scout has watched ${clubLink(club)} and now has a good idea of their ${squad.length} players.`,
      graded.length > 0
        ? `Worth a closer look:\n${graded.map(({ p, grade }) => `${playerLink(p)} (${mainPosition(p)}, ${grade})`).join('\n')}`
        : 'Nobody there would improve your squad.',
    ].join('\n\n'),
  });
}

/** The positions in the manager's best XI with the weakest players, weakest first. */
function weakestPositions(state: GameState): Position[] {
  const clubId = state.manager.clubId!;
  const squad = squadOf(state, clubId);
  const tactics = state.manager.tactics ?? autoTactics(squad, state.date);
  const slots = FORMATIONS[tactics.formation];
  return tactics.lineup
    .map((id, i) => {
      const p = squad.find((x) => x.id === id);
      const position = slots[i]!.position;
      return { position, rating: p ? positionRating(p, position) : 0 };
    })
    .sort((a, b) => a.rating - b.rating)
    .map((x) => x.position);
}

/** Rating of the manager's current first choice at a position (their best player there if it isn't in the side). */
function starterRatingAt(state: GameState, position: Position): number {
  const clubId = state.manager.clubId!;
  const squad = squadOf(state, clubId);
  const tactics = state.manager.tactics ?? autoTactics(squad, state.date);
  const slots = FORMATIONS[tactics.formation];
  const inSide = tactics.lineup
    .map((id, i) => ({ p: squad.find((x) => x.id === id), pos: slots[i]?.position }))
    .filter((x) => x.p && x.pos === position)
    .map((x) => positionRating(x.p!, position));
  if (inSide.length > 0) return Math.min(...inSide);
  return Math.max(0, ...squad.map((p) => positionRating(p, position)));
}

function bestXiLevel(state: GameState): number {
  const best = squadOf(state, state.manager.clubId!).map((p) => p.ca).sort((a, b) => b - a).slice(0, 11);
  return best.reduce((a, b) => a + b, 0) / Math.max(1, best.length);
}

/** Positions a search covers: the one asked for, or the three weakest in the side. */
function searchPositions(state: GameState, c: ScoutCriteria): Position[] {
  return c.position === 'any' ? [...new Set(weakestPositions(state))].slice(0, 3) : [c.position];
}

/**
 * A search of the leagues in the game. Scouts judge players by how they'd fit: first-team players
 * better than the current starter, backups a little below the starter and cheaper, prospects of 21
 * or under who could reach the side's level. Judgement isn't perfect (worse scouts misjudge more),
 * and only players who'd consider joining are put forward.
 */
function writeSearchReport(state: GameState, c: ScoutCriteria): void {
  const clubId = state.manager.clubId!;
  const me = getClub(state, clubId);
  const s = scouting(state);
  const { judgement } = scoutingStaff(state);
  const level = bestXiLevel(state);
  const positions = searchPositions(state, c);
  const starters = new Map(positions.map((p) => [p, starterRatingAt(state, p)]));
  const maxFee = briefMaxFee(state, c);
  const minCa = c.minAbility ? abilityForStars(c.minAbility) - 12 : 0;
  const minPa = c.minPotential ? abilityForStars(c.minPotential) - 12 : 0;
  const fuzz = (p: Player) => normal(createRng(hashString(`${state.seed}:${p.id}:search:${state.date}`)), 0, (21 - judgement) * 0.6);
  const scored: Array<{ p: Player; score: number; position: Position }> = [];
  for (const p of Object.values(state.world.players)) {
    if (!p.clubId || p.clubId === clubId || p.retired || p.loan) continue;
    const club = state.world.clubs[p.clubId];
    if (!club) continue;
    if (c.where === 'league' && club.leagueId !== me.leagueId) continue;
    if (c.where !== 'league' && c.where !== 'all' && club.nationId !== c.where) continue;
    const age = ageOn(p.dateOfBirth, state.date);
    let best: { position: Position; rating: number } | null = null;
    for (const position of positions) {
      const rating = positionRating(p, position);
      if (!best || rating > best.rating) best = { position, rating };
    }
    if (!best) continue;
    const starter = starters.get(best.position) ?? 0;
    const seen = best.rating + fuzz(p);
    // The scout's view of ability and potential against the brief (half a star either side rounds in).
    if (p.ca + fuzz(p) < minCa || p.pa + fuzz(p) * 2 < minPa) continue;
    const price = askingPrice(state, p);
    if (price > maxFee) continue;
    let score: number;
    if (c.need === 'first') {
      if (age > 31 || seen < starter + 1) continue;
      score = seen - starter - Math.max(0, age - 28);
    } else if (c.need === 'backup') {
      if (age > 33 || seen < starter - 14 || seen >= starter + 1) continue;
      score = seen - starter + 14;
    } else {
      const potential = p.pa + fuzz(p) * 2;
      if (age > 21 || potential < level - 6) continue;
      score = potential - level + (21 - age) * 2;
    }
    if (!willingToJoin(state, p, clubId).ok) continue;
    // Value for money: of two similar players, the cheaper is recommended first.
    score -= (price / Math.max(1, maxFee)) * (c.need === 'backup' ? 8 : 5);
    scored.push({ p, score, position: best.position });
  }
  // Scouts don't see everyone: pick from the best dozen.
  const shortlist = scored.sort((a, b) => b.score - a.score).slice(0, 12);
  const picked = shuffle(state.rng, shortlist).slice(0, 5).sort((a, b) => b.score - a.score);
  for (const { p } of picked) assess(state, p);
  const label = describeSearch(state, c);
  (s.searches ??= []).unshift({ date: state.date, criteria: c, label, playerIds: picked.map((x) => x.p.id), positions: picked.map((x) => x.position) });
  s.searches = s.searches.slice(0, 10);
  addNews(state, {
    category: 'transfer',
    title: picked.length > 0 ? `Scout report: ${picked.length} ${label}` : `Scout report: nobody found`,
    body: picked.length > 0
      ? [
          `Your scout has been looking for ${label} and recommends:`,
          picked
            .map(({ p, position }) => {
              const club = getClub(state, p.clubId!);
              return `${playerLink(p)} (${mainPosition(p)}, ${ageOn(p.dateOfBirth, state.date)}) at ${clubLink(club)}: grade ${s.reports[p.id]?.grade}, about ${formatMoney(askingPrice(state, p))}. ${comparisonLine(state, p, position)}`;
            })
            .join('\n\n'),
          'They are on the Scouting screen too.',
        ].join('\n\n')
      : `Your scout looked for ${label} but found nobody suitable who would join at that price. Try a higher fee, lower targets, another position or somewhere else.`,
    important: true,
  });
}

/**
 * A trip abroad: the scout finds five players at clubs in that country. Without a brief they suit
 * the manager's weakest positions (first-team options, a cheaper squad player and a prospect);
 * with one they match it. They're created now (the rest of the world isn't simulated) and kept
 * for a few months.
 */
function writeCountryReport(state: GameState, nationId: Id, criteria?: ScoutCriteria): void {
  const nation = state.world.nations[nationId];
  const clubId = state.manager.clubId;
  if (!nation || !clubId) return;
  const s = scouting(state);
  const squad = squadOf(state, clubId);
  const best = squad.map((p) => p.ca).sort((a, b) => b - a).slice(0, 11);
  const level = best.reduce((a, b) => a + b, 0) / Math.max(1, best.length);
  const ceiling = attractCeiling(state, getClub(state, clubId), 8);
  const weak = weakestPositions(state);
  const others = shuffle(state.rng, [...new Set(weak.slice(3))]);
  let targets: Array<{ position: Position; ca: number; age: number; future?: boolean }> = [
    { position: weak[0] ?? 'MC', ca: level + randInt(state.rng, 0, 8), age: randInt(state.rng, 22, 28) },
    { position: weak[1] ?? 'ST', ca: level + randInt(state.rng, -3, 6), age: randInt(state.rng, 21, 29) },
    { position: weak[2] ?? 'DC', ca: level + randInt(state.rng, -6, 4), age: randInt(state.rng, 23, 31) },
    { position: others[0] ?? 'DC', ca: level - randInt(state.rng, 8, 14), age: randInt(state.rng, 22, 30) },
    { position: others[1] ?? 'AMC', ca: level - randInt(state.rng, 22, 32), age: randInt(state.rng, 17, 19), future: true },
  ];
  if (criteria) {
    const positions = searchPositions(state, criteria);
    targets = Array.from({ length: 5 }, (_, i) => {
      const position = positions[i % positions.length]!;
      if (criteria.need === 'first') return { position, ca: level + randInt(state.rng, -1, 9), age: randInt(state.rng, 22, 29) };
      if (criteria.need === 'backup') return { position, ca: level - randInt(state.rng, 5, 14), age: randInt(state.rng, 21, 31) };
      return { position, ca: level - randInt(state.rng, 18, 32), age: randInt(state.rng, 17, 20), future: true };
    });
  }
  const found: Player[] = [];
  const until = addDays(state.date, ABROAD_AVAILABLE_DAYS);
  const maxFee = criteria ? briefMaxFee(state, criteria) : Infinity;
  const minCa = criteria?.minAbility ? abilityForStars(criteria.minAbility) : 0;
  const minPa = criteria?.minPotential ? abilityForStars(criteria.minPotential) : 0;
  for (const t of targets) {
    // Within the brief: at least the ability asked for, and cheap enough (scouts look for a lesser
    // player rather than one the club can't afford).
    let ca = Math.max(Math.min(t.ca, ceiling, 190), minCa);
    let player: Player | null = null;
    for (let attempt = 0; attempt < 6 && ca >= minCa; attempt++, ca -= 5) {
      s.counter++;
      const candidate = generatePlayer(state.rng, {
        id: `abr-${s.counter}`,
        position: t.position,
        ca,
        age: t.age,
        nationId,
        namePool: nation.namePool,
        clubId: null,
        today: state.date,
      });
      // A prospect the scout recommends has the potential to reach the side's level, and any target set.
      if (t.future) candidate.pa = Math.max(candidate.pa, Math.round(level + randInt(state.rng, -4, 12)));
      if (minPa > candidate.pa) {
        if (t.age > 23) continue;
        candidate.pa = minPa + randInt(state.rng, 0, 8);
      }
      candidate.value = estimateValue(candidate.ca, candidate.pa, t.age);
      if (Math.max(100_000, roundMoney(candidate.value * 1.25)) > maxFee) continue;
      player = candidate;
      break;
    }
    if (!player) continue;
    player.abroad = { nationId, until, price: Math.max(100_000, roundMoney(player.value * 1.25)) };
    player.squadNumber = null;
    // Their contract with the club abroad (shown on their page; replaced when they sign).
    player.contract = { wage: estimateWage(player.ca), expires: `${yearOf(state.date) + randInt(state.rng, 1, 4)}-06-30` };
    state.world.players[player.id] = player;
    s.knowledge[player.id] = 85;
    found.push(player);
  }
  if (criteria) {
    (s.searches ??= []).unshift({
      date: state.date, criteria, label: describeSearch(state, criteria), playerIds: found.map((p) => p.id), positions: found.map((p) => mainPosition(p)),
    });
    s.searches = s.searches.slice(0, 10);
  }
  addNews(state, {
    category: 'transfer',
    title: found.length > 0 ? `Scout report: ${found.length} players in ${nation.name}` : `Scout report: nobody found in ${nation.name}`,
    body: found.length > 0
      ? [
          `Your scout is back from ${nation.name} with ${found.length} players who could interest you:`,
          found
            .map((p) => `${playerLink(p)} (${mainPosition(p)}, ${ageOn(p.dateOfBirth, state.date)}, ${gradeFor(state, p)}) · their club wants about ${formatMoney(askingPrice(state, p))}. ${comparisonLine(state, p)}`)
            .join('\n\n'),
          `Make offers from their pages. They are available until ${formatShort(until)}; deals go through when the window is open.`,
        ].join('\n\n')
      : `Your scout found nobody in ${nation.name} who fits the brief at that price. Try a higher fee or lower targets.`,
    important: true,
  });
}

/** Players found abroad who weren't signed in time move elsewhere. */
function expireAbroad(state: GameState): void {
  for (const player of Object.values(state.world.players)) {
    if (!player.abroad || player.retired || player.abroad.until >= state.date) continue;
    if (state.transfers.bids.some((b) => b.playerId === player.id && b.status === 'agreed')) continue;
    player.retired = true;
    for (const bid of state.transfers.bids) {
      if (bid.playerId === player.id && ['pending', 'countered', 'accepted'].includes(bid.status)) {
        bid.status = 'collapsed';
        bid.note = 'Your scouts lost track of the player.';
      }
    }
  }
}

/** Opponents are seen at close quarters: everyone who played against the manager's side is better known. */
export function learnFromMatch(state: GameState, playerIds: readonly Id[]): void {
  if (!state.manager.clubId) return;
  const s = scouting(state);
  for (const id of playerIds) s.knowledge[id] = Math.min(80, Math.max(s.knowledge[id] ?? 0, 35) + 15);
}

/** The daily scouting tick: finished assignments become reports. */
export function scoutingDay(state: GameState): void {
  if (!state.scouting || !state.manager.clubId) return;
  expireAbroad(state);
  const done = state.scouting.assignments.filter((a) => a.due <= state.date);
  if (done.length === 0) return;
  state.scouting.assignments = state.scouting.assignments.filter((a) => a.due > state.date);
  for (const a of done) {
    if (a.kind === 'player') {
      const player = state.world.players[a.targetId];
      if (player && !player.retired) writeReport(state, player);
    } else if (a.kind === 'country') {
      writeCountryReport(state, a.targetId, a.criteria);
    } else if (a.kind === 'search' && a.criteria) {
      writeSearchReport(state, a.criteria);
    } else if (state.world.clubs[a.targetId]) {
      writeClubReport(state, a.targetId);
    }
  }
}
