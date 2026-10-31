/**
 * Scouting (PLAN §3, §7.1): the manager only sees other clubs' players approximately until they
 * know them. Knowledge (0–100) comes from playing against a player, from players in the same
 * league (seen every week), and above all from sending scouts. What the screens show is derived
 * from knowledge: attribute ranges, estimated ability and a potential range.
 */
import type { AttributeKey } from './attributes.ts';
import { addDays, ageOn, formatShort, type ISODate } from './dates.ts';
import { addNews, clubLink, playerLink } from './news.ts';
import { abilityStars, mainPosition, positionRating, shortName } from './players.ts';
import { getClub, squadOf } from './queries.ts';
import { createRng, hashString, normal, random } from './rng.ts';
import { autoTactics, FORMATIONS } from './tactics.ts';
import { askingPrice, formatMoney, wageDemand, willingToJoin } from './transfers.ts';
import type { GameState, Id, Player } from './types.ts';

export interface ScoutAssignment {
  id: Id;
  kind: 'player' | 'club';
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

function sameLeague(state: GameState, clubId: Id | null): boolean {
  if (!clubId || !state.manager.clubId) return false;
  return state.world.clubs[clubId]?.leagueId === state.world.clubs[state.manager.clubId]?.leagueId;
}

function assign(state: GameState, kind: 'player' | 'club', targetId: Id, days: number, label: string): ScoutResult {
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
  addNews(state, {
    category: 'transfer',
    title: `Scout report: ${shortName(player)} (${grade})`,
    body: [
      `${playerLink(player)}, ${age}, ${mainPosition(player)}${club ? ` at ${clubLink(club)}` : ', free agent'}.`,
      `Ability ${abilityStars(player.ca)}★ · Potential about ${potentialStars}★`,
      `Verdict: ${verdict}`,
      club ? `${club.shortName} would want around ${formatMoney(askingPrice(state, player))}.` : 'Available on a free transfer.',
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

/** Opponents are seen at close quarters: everyone who played against the manager's side is better known. */
export function learnFromMatch(state: GameState, playerIds: readonly Id[]): void {
  if (!state.manager.clubId) return;
  const s = scouting(state);
  for (const id of playerIds) s.knowledge[id] = Math.min(80, Math.max(s.knowledge[id] ?? 0, 35) + 15);
}

/** The daily scouting tick: finished assignments become reports. */
export function scoutingDay(state: GameState): void {
  if (!state.scouting || !state.manager.clubId) return;
  const done = state.scouting.assignments.filter((a) => a.due <= state.date);
  if (done.length === 0) return;
  state.scouting.assignments = state.scouting.assignments.filter((a) => a.due > state.date);
  for (const a of done) {
    if (a.kind === 'player') {
      const player = state.world.players[a.targetId];
      if (player && !player.retired) writeReport(state, player);
    } else if (state.world.clubs[a.targetId]) {
      writeClubReport(state, a.targetId);
    }
  }
}
