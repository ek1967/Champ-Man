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
import { abilityStars, estimateWage, generatePlayer, mainPosition, positionRating, roundMoney, shortName } from './players.ts';
import { getClub, squadOf } from './queries.ts';
import { createRng, hashString, normal, random, randInt, shuffle } from './rng.ts';
import { autoTactics, FORMATIONS } from './tactics.ts';
import { ABROAD, askingPrice, attractCeiling, formatMoney, sellerName, wageDemand, willingToJoin } from './transfers.ts';
import type { GameState, Id, Player } from './types.ts';

/** Countries scouts can travel to (the other countries planned for the game, plus France and Belgium). */
export const SCOUTING_COUNTRIES = ['esp', 'ita', 'ger', 'fra', 'ned', 'por', 'bel', 'cze', 'arg', 'bra', 'usa'] as const;

/** Days a trip abroad takes, and how long the players found stay available. */
const COUNTRY_TRIP_DAYS = 14;
const ABROAD_AVAILABLE_DAYS = 120;

export interface ScoutAssignment {
  id: Id;
  /** 'country': a trip abroad (targetId is a nation) to find players outside the simulated leagues. */
  kind: 'player' | 'club' | 'country';
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

/** Estimated ability in stars, and whether it's exact. */
export function estimatedAbility(state: GameState, player: Player): { stars: number; exact: boolean } {
  const k = knowledgeOf(state, player);
  if (k >= 100) return { stars: abilityStars(player.ca), exact: true };
  const offset = (noise(state, player, 'ca') - 0.5) * 2 * (1 - k / 100) * 22;
  return { stars: abilityStars(player.ca + offset), exact: false };
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

function assign(state: GameState, kind: ScoutAssignment['kind'], targetId: Id, days: number, label: string): ScoutResult {
  const s = scouting(state);
  if (s.assignments.some((a) => a.targetId === targetId)) return { ok: false, message: `A scout is already watching ${label}.` };
  const { scouts } = scoutingStaff(state);
  if (s.assignments.length >= scouts) {
    return { ok: false, message: `All ${scouts} of your scouts are busy. The next one is free on ${formatShort(s.assignments.map((a) => a.due).sort()[0]!)}.` };
  }
  s.counter++;
  const due = addDays(state.date, days);
  s.assignments.push({ id: `s${s.counter}`, kind, targetId, started: state.date, due });
  return { ok: true, message: `A scout is on the way to watch ${label}. Report due ${formatShort(due)}.` };
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

function writeReport(state: GameState, player: Player): void {
  const s = scouting(state);
  const { judgement } = scoutingStaff(state);
  s.knowledge[player.id] = 100;
  // Better scouts misjudge potential by less.
  const error = normal(createRng(hashString(`${state.seed}:${player.id}:report:${state.date}`)), 0, (21 - judgement) * 1.2);
  const potentialStars = abilityStars(Math.max(player.ca, player.pa + error));
  const grade = gradeFor(state, player);
  const age = ageOn(player.dateOfBirth, state.date);
  const prospect = age <= 21 && potentialStars >= 4 ? ' One for the future.' : '';
  const verdict = `${GRADE_TEXT[grade]}${prospect}`;
  s.reports[player.id] = { date: state.date, potentialStars, grade, verdict };
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

/**
 * A trip abroad: the scout finds four or five players at clubs in that country who would suit the
 * manager: first-team options for the weakest positions, one cheaper squad player and a prospect.
 * They're created now (the rest of the world isn't simulated) and kept for a few months.
 */
function writeCountryReport(state: GameState, nationId: Id): void {
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
  const targets: Array<{ position: Position; ca: number; age: number }> = [
    { position: weak[0] ?? 'MC', ca: level + randInt(state.rng, 0, 8), age: randInt(state.rng, 22, 28) },
    { position: weak[1] ?? 'ST', ca: level + randInt(state.rng, -3, 6), age: randInt(state.rng, 21, 29) },
    { position: weak[2] ?? 'DC', ca: level + randInt(state.rng, -6, 4), age: randInt(state.rng, 23, 31) },
    { position: others[0] ?? 'DC', ca: level - randInt(state.rng, 8, 14), age: randInt(state.rng, 22, 30) },
    { position: others[1] ?? 'AMC', ca: level - randInt(state.rng, 22, 32), age: randInt(state.rng, 17, 19) },
  ];
  const found: Player[] = [];
  const until = addDays(state.date, ABROAD_AVAILABLE_DAYS);
  for (const t of targets) {
    s.counter++;
    const player = generatePlayer(state.rng, {
      id: `abr-${s.counter}`,
      position: t.position,
      ca: Math.min(t.ca, ceiling, 190),
      age: t.age,
      nationId,
      namePool: nation.namePool,
      clubId: null,
      today: state.date,
    });
    player.abroad = { nationId, until, price: Math.max(100_000, roundMoney(player.value * 1.25)) };
    player.squadNumber = null;
    // Their contract with the club abroad (shown on their page; replaced when they sign).
    player.contract = { wage: estimateWage(player.ca), expires: `${yearOf(state.date) + randInt(state.rng, 1, 4)}-06-30` };
    state.world.players[player.id] = player;
    s.knowledge[player.id] = 85;
    found.push(player);
  }
  addNews(state, {
    category: 'transfer',
    title: `Scout report: ${found.length} players in ${nation.name}`,
    body: [
      `Your scout is back from ${nation.name} with ${found.length} players who could interest you:`,
      found
        .map((p) => `${playerLink(p)} (${mainPosition(p)}, ${ageOn(p.dateOfBirth, state.date)}, ${gradeFor(state, p)}) · their club wants about ${formatMoney(askingPrice(state, p))}`)
        .join('\n'),
      `Make offers from their pages. They are available until ${formatShort(until)}; deals go through when the window is open.`,
    ].join('\n\n'),
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
      writeCountryReport(state, a.targetId);
    } else if (state.world.clubs[a.targetId]) {
      writeClubReport(state, a.targetId);
    }
  }
}
