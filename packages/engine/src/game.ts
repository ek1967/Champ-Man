import { addDays, formatLong, type ISODate, monthDay, onYear, yearOf } from './dates.ts';
import { blockedRangesForSeason, nextWeekday, previousWeekday, roundRobin, scheduleRoundDates } from './fixtures.ts';
import { addNews, clubLink, competitionLink, playerLink } from './news.ts';
import {
  currentSeasonOf, getClub, getCompetition, seasonFixtures, seasonTable, squadIndex,
} from './queries.ts';
import { simulateMatch, simulateScore } from './quicksim.ts';
import { chance, createRng, forkRng } from './rng.ts';
import { type Lineup, pickBestLineup } from './selection.ts';
import type { CompetitionSeason, Fixture, GameState, Id, MatchResult, World } from './types.ts';
import { type PackFixture, type WorldPack, worldFromPack } from './pack.ts';
import { createDemoWorld } from './worldgen.ts';

export const SAVE_VERSION = 1;
export const GAME_START_DATE: ISODate = '2026-06-15';

export interface NewGameOptions {
  seed: string;
  managerName: string;
  /** Real-world database; the made-up demo world is used when absent. */
  pack?: WorldPack;
}

export function createGame(options: NewGameOptions): GameState {
  const rng = createRng(options.seed);
  const demoRng = forkRng(rng);
  const world = options.pack
    ? worldFromPack(options.pack, options.seed, GAME_START_DATE)
    : createDemoWorld(demoRng, GAME_START_DATE);
  const state: GameState = {
    version: SAVE_VERSION,
    seed: options.seed,
    rng,
    date: GAME_START_DATE,
    world,
    seasons: {},
    currentSeason: {},
    fixtures: {},
    fixturesByDate: {},
    news: [],
    manager: { name: options.managerName, clubId: null },
    counters: { fixture: 0, news: 0, season: 0 },
  };
  for (const competition of Object.values(world.competitions)) {
    const fixtures = options.pack?.fixtures.filter((f) => f.competitionId === competition.id);
    createSeason(
      state,
      competition.id,
      yearOf(GAME_START_DATE),
      clubsInLeague(world, competition.id),
      fixtures && fixtures.length > 0 ? fixtures : undefined,
    );
  }
  return state;
}

export function clubsInLeague(world: World, competitionId: Id): Id[] {
  return Object.values(world.clubs).filter((c) => c.leagueId === competitionId).map((c) => c.id);
}

function seasonLabel(calendar: 'aug-may' | 'calendar', startYear: number): string {
  return calendar === 'aug-may' ? `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}` : `${startYear}`;
}

/** Fixture list for a generated season: a shuffled round-robin spread across the season window. */
function generateFixtures(state: GameState, competitionId: Id, startYear: number, clubIds: Id[]): PackFixture[] {
  const { season: calendar, rounds: legs } = getCompetition(state, competitionId).rules;
  const endYear = calendar.calendar === 'aug-may' ? startYear + 1 : startYear;
  const startDate = nextWeekday(onYear(calendar.start, startYear), 6);
  const endDate = previousWeekday(onYear(calendar.end, endYear), 6);
  const rounds = roundRobin(state.rng, clubIds, legs);
  const blocked = blockedRangesForSeason(calendar.blocked, startYear, calendar.calendar);
  const dates = scheduleRoundDates(startDate, endDate, rounds.length, blocked);
  return rounds.flatMap((pairings, roundIndex) =>
    pairings.map(([homeId, awayId]) => ({
      competitionId, round: roundIndex + 1, date: dates[roundIndex] as ISODate, homeId, awayId,
    })),
  );
}

/**
 * Sets up a competition's season. Uses the real fixture list when one is supplied
 * (the first season of a real-world pack), otherwise generates one.
 */
export function createSeason(
  state: GameState,
  competitionId: Id,
  startYear: number,
  clubIds: Id[],
  realFixtures?: readonly PackFixture[],
): CompetitionSeason {
  const competition = getCompetition(state, competitionId);
  const label = seasonLabel(competition.rules.season.calendar, startYear);
  const id = `${competitionId}:${label}`;
  const planned = realFixtures ?? generateFixtures(state, competitionId, startYear, clubIds);

  const fixtureIds: Id[] = [];
  let startDate = planned[0]?.date ?? state.date;
  let endDate = startDate;
  for (const plan of planned) {
    state.counters.fixture++;
    const fixture: Fixture = {
      id: `f${state.counters.fixture}`,
      competitionId,
      seasonId: id,
      round: plan.round,
      date: plan.date,
      homeId: plan.homeId,
      awayId: plan.awayId,
      result: null,
    };
    state.fixtures[fixture.id] = fixture;
    (state.fixturesByDate[fixture.date] ??= []).push(fixture.id);
    fixtureIds.push(fixture.id);
    if (fixture.date < startDate) startDate = fixture.date;
    if (fixture.date > endDate) endDate = fixture.date;
  }

  const season: CompetitionSeason = {
    id, competitionId, label, startDate, endDate, clubIds: [...clubIds], fixtureIds, status: 'scheduled', final: null,
  };
  state.counters.season++;
  state.seasons[id] = season;
  state.currentSeason[competitionId] = id;
  return season;
}

function involvesHuman(state: GameState, fixture: Fixture): boolean {
  const clubId = state.manager.clubId;
  return clubId !== null && (fixture.homeId === clubId || fixture.awayId === clubId);
}

export function humanFixtureOn(state: GameState, date: ISODate): Fixture | null {
  for (const id of state.fixturesByDate[date] ?? []) {
    const fixture = state.fixtures[id];
    if (fixture && fixture.result === null && involvesHuman(state, fixture)) return fixture;
  }
  return null;
}

function recordStats(state: GameState, fixture: Fixture, result: MatchResult): void {
  const season = state.seasons[fixture.seasonId];
  if (!season || !result.lineups) return;
  const statsFor = (playerId: Id, clubId: Id) => {
    const player = state.world.players[playerId];
    if (!player) return null;
    let entry = player.stats.find(
      (s) => s.season === season.label && s.competitionId === fixture.competitionId && s.clubId === clubId,
    );
    if (!entry) {
      entry = { season: season.label, competitionId: fixture.competitionId, clubId, apps: 0, goals: 0, assists: 0 };
      player.stats.push(entry);
    }
    return entry;
  };
  for (const id of result.lineups.home) {
    const s = statsFor(id, fixture.homeId);
    if (s) s.apps++;
  }
  for (const id of result.lineups.away) {
    const s = statsFor(id, fixture.awayId);
    if (s) s.apps++;
  }
  for (const goal of result.goals) {
    if (goal.scorerId) {
      const s = statsFor(goal.scorerId, goal.clubId);
      if (s) s.goals++;
    }
    if (goal.assistId) {
      const s = statsFor(goal.assistId, goal.clubId);
      if (s) s.assists++;
    }
  }
}

function reportHumanResult(state: GameState, fixture: Fixture, result: MatchResult): void {
  const home = getClub(state, fixture.homeId);
  const away = getClub(state, fixture.awayId);
  const competition = getCompetition(state, fixture.competitionId);
  const lines = result.goals.map((g) => {
    const club = getClub(state, g.clubId);
    const scorer = g.scorerId ? state.world.players[g.scorerId] : undefined;
    const assist = g.assistId ? state.world.players[g.assistId] : undefined;
    const who = scorer ? playerLink(scorer) : 'Own goal';
    const helper = assist ? ` (assist ${playerLink(assist)})` : '';
    return `${g.minute}' ${who}${helper} — ${club.shortName}`;
  });
  const ours = fixture.homeId === state.manager.clubId ? result.homeGoals - result.awayGoals : result.awayGoals - result.homeGoals;
  const verdict = ours > 0 ? 'A win for your side.' : ours === 0 ? 'The points are shared.' : 'A defeat for your side.';
  addNews(state, {
    category: 'result',
    title: `${home.shortName} ${result.homeGoals}-${result.awayGoals} ${away.shortName}`,
    body: [
      `${clubLink(home)} ${result.homeGoals}-${result.awayGoals} ${clubLink(away)}`,
      `${competitionLink(competition)}, round ${fixture.round}. ${verdict}`,
      lines.length > 0 ? `Goals:\n${lines.join('\n')}` : 'No goals.',
    ].join('\n\n'),
  });
}

/** Plays every unplayed fixture scheduled for `date`. */
export function playFixtures(state: GameState, date: ISODate): Fixture[] {
  const ids = state.fixturesByDate[date];
  if (!ids || ids.length === 0) return [];
  const squads = squadIndex(state);
  const lineups = new Map<Id, Lineup>();
  const lineupFor = (clubId: Id): Lineup => {
    let lineup = lineups.get(clubId);
    if (!lineup) lineups.set(clubId, (lineup = pickBestLineup(squads.get(clubId) ?? [])));
    return lineup;
  };

  const played: Fixture[] = [];
  const touched = new Set<Id>();
  for (const id of ids) {
    const fixture = state.fixtures[id];
    if (!fixture || fixture.result) continue;
    const competition = getCompetition(state, fixture.competitionId);
    const home = lineupFor(fixture.homeId);
    const away = lineupFor(fixture.awayId);
    let result: MatchResult;
    if (competition.mode === 'playable') {
      result = simulateMatch(
        state.rng,
        { clubId: fixture.homeId, lineup: home },
        { clubId: fixture.awayId, lineup: away },
        state.world.players,
      );
      recordStats(state, fixture, result);
      // Line-ups are only kept for the human's matches, to keep saves small.
      if (!involvesHuman(state, fixture)) delete result.lineups;
    } else {
      const [homeGoals, awayGoals] = simulateScore(state.rng, home.strength, away.strength);
      result = { homeGoals, awayGoals, goals: [] };
    }
    fixture.result = result;
    played.push(fixture);
    touched.add(fixture.seasonId);
    if (involvesHuman(state, fixture)) reportHumanResult(state, fixture, result);
  }

  for (const seasonId of touched) {
    const season = state.seasons[seasonId];
    if (!season) continue;
    if (season.status === 'scheduled') season.status = 'inProgress';
    if (seasonFixtures(state, season).every((f) => f.result !== null)) finishSeason(state, season);
  }
  return played;
}

function listClubs(state: GameState, ids: readonly Id[]): string {
  return ids.map((id) => clubLink(getClub(state, id))).join(', ');
}

/** Strength of a club's best XI, used for matches outside the full simulation. */
function clubStrength(state: GameState, clubId: Id): number {
  return pickBestLineup(squadIndex(state).get(clubId) ?? []).strength;
}

/** One tie decided by strength alone; level ties go to penalties (a coin weighted slightly by strength). */
function playTie(state: GameState, homeId: Id, awayId: Id, legs: 1 | 2): Id {
  const home = clubStrength(state, homeId);
  const away = clubStrength(state, awayId);
  let homeGoals = 0;
  let awayGoals = 0;
  const [h1, a1] = simulateScore(state.rng, home, away);
  homeGoals += h1;
  awayGoals += a1;
  if (legs === 2) {
    const [h2, a2] = simulateScore(state.rng, away, home);
    homeGoals += a2;
    awayGoals += h2;
  }
  if (homeGoals !== awayGoals) return homeGoals > awayGoals ? homeId : awayId;
  return chance(state.rng, 0.5 + (home - away) / 400) ? homeId : awayId;
}

/** Semi-finals (best-placed club at home second) then a final, e.g. 3rd v 6th and 4th v 5th. */
function runPlayoff(state: GameState, order: readonly Id[], from: number, to: number): { winnerId: Id; lines: string[] } {
  const seeds = order.slice(from - 1, to);
  const names = (id: Id) => clubLink(getClub(state, id));
  const finalists: Id[] = [];
  const lines: string[] = [];
  for (let i = 0; i < seeds.length / 2; i++) {
    const higher = seeds[i] as Id;
    const lower = seeds[seeds.length - 1 - i] as Id;
    const winner = playTie(state, lower, higher, 2);
    finalists.push(winner);
    lines.push(`Semi-final: ${names(higher)} v ${names(lower)} — ${names(winner)} go through.`);
  }
  const [a, b] = finalists as [Id, Id];
  const winnerId = playTie(state, a, b, 1);
  lines.push(`Final: ${names(a)} v ${names(b)} — ${names(winnerId)} win promotion.`);
  return { winnerId, lines };
}

function finishSeason(state: GameState, season: CompetitionSeason): void {
  const competition = getCompetition(state, season.competitionId);
  const table = seasonTable(state, season);
  const order = table.map((r) => r.clubId);
  const championId = order[0] as Id;
  season.final = { order, championId };
  season.status = 'finished';
  const playoff = competition.rules.promotionPlayoff
    ? runPlayoff(state, order, competition.rules.promotionPlayoff.from, competition.rules.promotionPlayoff.to)
    : null;
  if (playoff) season.final.playoffWinnerId = playoff.winnerId;

  const champion = getClub(state, championId);
  const humanHere = state.manager.clubId !== null && order.includes(state.manager.clubId);
  const lines = [`${clubLink(champion)} finish top of the ${competitionLink(competition)} with ${table[0]?.points ?? 0} points.`];
  const { promotion, relegation } = competition.rules;
  if (promotion) lines.push(`Promoted: ${listClubs(state, order.slice(0, promotion.places))}.`);
  if (playoff) lines.push(`Promotion play-offs:\n${playoff.lines.join('\n')}`);
  if (relegation) lines.push(`Relegated: ${listClubs(state, order.slice(-relegation.places))}.`);
  if (humanHere) {
    const position = order.indexOf(state.manager.clubId as Id) + 1;
    lines.push(`Your side finished in position ${position}.`);
  }
  addNews(state, {
    category: 'season',
    title: `${champion.shortName} win the ${competition.shortName}`,
    body: lines.join('\n\n'),
    important: competition.mode === 'playable' || humanHere,
  });
}

/**
 * Moves clubs between tiers and sets up next season for every league in a nation.
 * Runs on the top division's rollover date, once all of the nation's seasons are finished.
 */
function rolloverNation(state: GameState, nationId: Id): void {
  const competitions = Object.values(state.world.competitions)
    .filter((c) => c.nationId === nationId)
    .sort((a, b) => a.tier - b.tier);
  const membership = new Map<Id, Id[]>();
  const finals = new Map<Id, Id[]>();
  for (const competition of competitions) {
    const season = currentSeasonOf(state, competition.id);
    if (!season || season.status !== 'finished' || !season.final) return;
    membership.set(competition.id, [...season.clubIds]);
    finals.set(competition.id, season.final.order);
  }

  const moves: Array<{ clubId: Id; from: Id; to: Id }> = [];
  for (const competition of competitions) {
    const order = finals.get(competition.id) ?? [];
    const { promotion, relegation } = competition.rules;
    if (relegation && membership.has(relegation.to)) {
      for (const clubId of order.slice(-relegation.places)) moves.push({ clubId, from: competition.id, to: relegation.to });
    }
    if (promotion && membership.has(promotion.to)) {
      const promoted = order.slice(0, promotion.places);
      const playoffWinner = currentSeasonOf(state, competition.id)?.final?.playoffWinnerId;
      if (playoffWinner) promoted.push(playoffWinner);
      for (const clubId of promoted) moves.push({ clubId, from: competition.id, to: promotion.to });
    }
  }
  for (const move of moves) {
    const from = membership.get(move.from) ?? [];
    membership.set(move.from, from.filter((id) => id !== move.clubId));
    membership.get(move.to)?.push(move.clubId);
    getClub(state, move.clubId).leagueId = move.to;
  }

  const startYear = yearOf(state.date);
  for (const competition of competitions) {
    const season = createSeason(state, competition.id, startYear, membership.get(competition.id) ?? []);
    const humanClub = state.manager.clubId;
    if (humanClub && season.clubIds.includes(humanClub)) {
      const arrivals = moves.filter((m) => m.to === competition.id).map((m) => m.clubId);
      addNews(state, {
        category: 'season',
        title: `${competition.shortName} ${season.label} fixtures released`,
        body: [
          `The ${competitionLink(competition)} ${season.label} season starts on ${formatLong(season.startDate)}.`,
          arrivals.length > 0 ? `New this season: ${listClubs(state, arrivals)}.` : '',
        ].filter(Boolean).join('\n\n'),
        important: true,
      });
    }
  }
}

/** Once-a-day jobs that don't depend on matches. */
function dailyTasks(state: GameState): void {
  const md = monthDay(state.date);
  const nations = new Set<Id>();
  for (const competition of Object.values(state.world.competitions)) {
    if (competition.tier === 1 && competition.rules.season.rollover === md) nations.add(competition.nationId);
  }
  for (const nationId of nations) rolloverNation(state, nationId);
}

/** Advances one day and plays that day's fixtures. Used by the harness and holiday mode. */
export function advanceDay(state: GameState): void {
  state.date = addDays(state.date, 1);
  dailyTasks(state);
  playFixtures(state, state.date);
}

export type StopReason = 'matchDay' | 'matchPlayed' | 'news' | 'week';

/**
 * The Continue button: moves time forward until the manager has something to look at.
 * Stops on the morning of their match, after playing it, on important news, or after a week.
 */
export function continueGame(state: GameState): StopReason {
  if (humanFixtureOn(state, state.date)) {
    playFixtures(state, state.date);
    return 'matchPlayed';
  }
  const newsBefore = state.counters.news;
  for (let day = 0; day < 7; day++) {
    state.date = addDays(state.date, 1);
    dailyTasks(state);
    if (humanFixtureOn(state, state.date)) return 'matchDay';
    playFixtures(state, state.date);
    const fresh = state.news.slice(0, state.counters.news - newsBefore);
    if (fresh.some((n) => n.important)) return 'news';
  }
  return 'week';
}

/** Board expectations from the club's size relative to its league rivals. */
export function boardExpectation(state: GameState, clubId: Id): string {
  const club = getClub(state, clubId);
  const rivals = Object.values(state.world.clubs)
    .filter((c) => c.leagueId === club.leagueId)
    .sort((a, b) => b.reputation - a.reputation);
  const rank = rivals.findIndex((c) => c.id === clubId) + 1;
  if (rank <= 2) return 'win the title';
  if (rank <= 5) return 'finish in the top four';
  if (rank <= 12) return 'finish in the top half';
  return 'avoid relegation';
}

export function takeJob(state: GameState, clubId: Id): void {
  const club = getClub(state, clubId);
  state.manager.clubId = clubId;
  const competition = getCompetition(state, club.leagueId);
  addNews(state, {
    category: 'welcome',
    title: `${state.manager.name} appointed at ${club.shortName}`,
    body: [
      `${clubLink(club)} have appointed ${state.manager.name} as their new manager.`,
      `The board expect you to ${boardExpectation(state, clubId)} in the ${competitionLink(competition)} this season.`,
      'Press Continue (or the space bar) to move the game on. The season starts in August.',
    ].join('\n\n'),
    important: true,
  });
}
