import { addDays, formatLong, type ISODate, monthDay, onYear, yearOf } from './dates.ts';
import { blockedRangesForSeason, nextWeekday, previousWeekday, roundRobin, scheduleRoundDates } from './fixtures.ts';
import { addNews, clubLink, competitionLink, playerLink } from './news.ts';
import {
  currentSeasonOf, getClub, getCompetition, seasonFixtures, seasonTable, squadIndex,
} from './queries.ts';
import { simulateScore } from './quicksim.ts';
import { injuryEnd, kickOff, type LiveMatch, type MatchContext, playToEnd } from './match.ts';
import { autoTactics, bestLineup, readyTactics, type Tactics } from './tactics.ts';
import { chance, createRng, forkRng } from './rng.ts';
import type { LeagueRules } from './rules.ts';
import { pickBestLineup } from './selection.ts';
import type {
  CompetitionSeason, Fixture, GameState, Id, MatchResult, Player, PlayerSeasonStats, World,
} from './types.ts';
import { type PackFixture, type WorldPack, worldFromPack } from './pack.ts';
import { developmentDay } from './development.ts';
import { board, boardAfterMatch, boardDay, boardTarget } from './board.ts';
import { initEconomy } from './finance.ts';
import { learnFromMatch, scoutingDay } from './scouting.ts';
import { financesOf, transferDay } from './transfers.ts';
import { createDemoWorld } from './worldgen.ts';

export const SAVE_VERSION = 6;
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
    manager: { name: options.managerName, clubId: null, tactics: null },
    counters: { fixture: 0, news: 0, season: 0 },
    finances: {},
    transfers: { bids: [], history: [], counter: 0 },
  };
  // Budgets are set from the squads clubs start with.
  for (const club of Object.values(world.clubs)) financesOf(state, club.id);
  initEconomy(state);
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

/** Rounds each half plays after a split: a single round-robin. */
function splitRounds(rules: LeagueRules, clubCount: number): number {
  if (!rules.split) return 0;
  const size = Math.ceil(clubCount / rules.split.groups);
  return size % 2 === 0 ? size - 1 : size;
}

/**
 * Fixture list for a generated season: a shuffled round-robin spread across the season window.
 * Leagues that split get dates kept back for the rounds after the split.
 */
function generateFixtures(
  state: GameState, competitionId: Id, startYear: number, clubIds: Id[],
): { fixtures: PackFixture[]; splitDates: ISODate[] } {
  const { rules } = getCompetition(state, competitionId);
  const { season: calendar, rounds: legs } = rules;
  const endYear = calendar.calendar === 'aug-may' ? startYear + 1 : startYear;
  const startDate = nextWeekday(onYear(calendar.start, startYear), 6);
  const endDate = previousWeekday(onYear(calendar.end, endYear), 6);
  let rounds = roundRobin(state.rng, clubIds, legs);
  if (rules.split) rounds = rounds.slice(0, rules.split.after);
  const blocked = blockedRangesForSeason(calendar.blocked, startYear, calendar.calendar);
  const dates = scheduleRoundDates(startDate, endDate, rounds.length + splitRounds(rules, clubIds.length), blocked);
  const fixtures = rounds.flatMap((pairings, roundIndex) =>
    pairings.map(([homeId, awayId]) => ({
      competitionId, round: roundIndex + 1, date: dates[roundIndex] as ISODate, homeId, awayId,
    })),
  );
  return { fixtures, splitDates: dates.slice(rounds.length) };
}

function addFixture(state: GameState, seasonId: Id, plan: PackFixture): Fixture {
  state.counters.fixture++;
  const fixture: Fixture = {
    id: `f${state.counters.fixture}`,
    competitionId: plan.competitionId,
    seasonId,
    round: plan.round,
    date: plan.date,
    homeId: plan.homeId,
    awayId: plan.awayId,
    result: null,
  };
  state.fixtures[fixture.id] = fixture;
  (state.fixturesByDate[fixture.date] ??= []).push(fixture.id);
  return fixture;
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
  const generated = realFixtures ? null : generateFixtures(state, competitionId, startYear, clubIds);
  const planned = realFixtures ?? generated?.fixtures ?? [];

  const fixtureIds: Id[] = [];
  let startDate = planned[0]?.date ?? state.date;
  let endDate = startDate;
  for (const plan of planned) {
    const fixture = addFixture(state, id, plan);
    fixtureIds.push(fixture.id);
    if (fixture.date < startDate) startDate = fixture.date;
    if (fixture.date > endDate) endDate = fixture.date;
  }

  const season: CompetitionSeason = {
    id, competitionId, label, startDate, endDate, clubIds: [...clubIds], fixtureIds, status: 'scheduled', final: null,
  };
  if (competition.rules.split) {
    season.split = null;
    season.splitDates = generated?.splitDates ?? [];
    const last = season.splitDates[season.splitDates.length - 1];
    if (last && last > season.endDate) season.endDate = last;
  }
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

export function matchContext(state: GameState): MatchContext {
  return { players: state.world.players, clubs: state.world.clubs };
}

/**
 * The tactics a club takes into a match. The manager's saved selection is used (with
 * unavailable players replaced); computer clubs pick their strongest formation and set their
 * mentality by how strong they are compared with the opposition.
 */
export function matchTactics(state: GameState, clubId: Id, opponentId: Id, home: boolean, squads = squadIndex(state)): Tactics {
  const squad = squads.get(clubId) ?? [];
  if (clubId === state.manager.clubId) {
    const saved = state.manager.tactics ?? autoTactics(squad, state.date);
    return readyTactics(saved, squad, state.date);
  }
  const tactics = autoTactics(squad, state.date);
  const opponent = autoTactics(squads.get(opponentId) ?? [], state.date);
  const strength = (t: Tactics, players: readonly Player[]) => bestLineup(players.filter((p) => t.lineup.includes(p.id)), t.formation).strength;
  const ratio = strength(tactics, squad) / Math.max(1, strength(opponent, squads.get(opponentId) ?? []));
  const edge = ratio + (home ? 0.03 : -0.03);
  tactics.instructions.mentality = edge > 1.08 ? 'positive' : edge < 0.9 ? 'cautious' : 'balanced';
  return tactics;
}

/** Starts a fixture in the match engine. */
export function startMatch(state: GameState, fixture: Fixture, commentary: boolean): LiveMatch {
  const squads = squadIndex(state);
  return kickOff(matchContext(state), {
    fixtureId: fixture.id,
    date: state.date,
    home: { clubId: fixture.homeId, tactics: matchTactics(state, fixture.homeId, fixture.awayId, true, squads), human: fixture.homeId === state.manager.clubId },
    away: { clubId: fixture.awayId, tactics: matchTactics(state, fixture.awayId, fixture.homeId, false, squads), human: fixture.awayId === state.manager.clubId },
    rng: state.rng,
    commentary,
  });
}

function statsEntry(state: GameState, player: Player, fixture: Fixture, clubId: Id): PlayerSeasonStats | null {
  const season = state.seasons[fixture.seasonId];
  if (!season) return null;
  let entry = player.stats.find((s) => s.season === season.label && s.competitionId === fixture.competitionId && s.clubId === clubId);
  if (!entry) {
    entry = {
      season: season.label, competitionId: fixture.competitionId, clubId, apps: 0, goals: 0, assists: 0, ratingTotal: 0, yellow: 0, red: 0,
    };
    player.stats.push(entry);
  }
  return entry;
}

/** Suspensions: a red card is a one-match ban, as is every fifth booking of the season. */
const YELLOWS_FOR_BAN = 5;

/** Writes a finished match into the game: result, player stats, fitness, injuries, bans and news. */
export function completeMatch(state: GameState, fixture: Fixture, live: LiveMatch): MatchResult {
  const human = involvesHuman(state, fixture);
  const result: MatchResult = {
    homeGoals: live.score[0],
    awayGoals: live.score[1],
    goals: live.goals,
    stats: { home: live.home.stats, away: live.away.stats },
  };
  if (human) {
    result.lineups = {
      home: live.home.tactics.lineup.filter((id): id is Id => id !== null),
      away: live.away.tactics.lineup.filter((id): id is Id => id !== null),
    };
    result.ratings = Object.fromEntries(Object.values(live.players).map((lp) => [lp.id, lp.rating]));
  }
  fixture.result = result;

  // Bans served: anyone suspended at either club sat this one out.
  for (const player of Object.values(state.world.players)) {
    if (player.suspension > 0 && (player.clubId === fixture.homeId || player.clubId === fixture.awayId)) player.suspension--;
  }

  for (const lp of Object.values(live.players)) {
    const player = state.world.players[lp.id];
    if (!player) continue;
    const clubId = lp.side === 'home' ? fixture.homeId : fixture.awayId;
    const entry = statsEntry(state, player, fixture, clubId);
    if (entry) {
      entry.apps++;
      entry.goals += lp.goals;
      entry.assists += lp.assists;
      entry.ratingTotal += lp.rating;
      if (lp.yellow > 0 && !lp.sentOff) entry.yellow++;
      if (lp.sentOff) entry.red++;
      if (lp.sentOff) player.suspension += 1;
      else if (lp.yellow > 0 && entry.yellow % YELLOWS_FOR_BAN === 0) player.suspension += 1;
    }
    player.condition = Math.max(30, Math.round(lp.energy * 100));
    player.form = [...player.form, lp.rating].slice(-5);
    const injury = live.injuries[lp.id];
    if (injury) player.injury = { name: injury.name, until: injuryEnd(state.date, injury.days) };
  }

  if (human) {
    reportHumanResult(state, fixture, result, live);
    const home = fixture.homeId === state.manager.clubId;
    boardAfterMatch(state, home ? result.homeGoals : result.awayGoals, home ? result.awayGoals : result.homeGoals);
    const theirSide = fixture.homeId === state.manager.clubId ? 'away' : 'home';
    learnFromMatch(state, Object.values(live.players).filter((lp) => lp.side === theirSide).map((lp) => lp.id));
  }
  afterResults(state, [fixture.seasonId]);
  return result;
}

function reportHumanResult(state: GameState, fixture: Fixture, result: MatchResult, live: LiveMatch): void {
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
  const mySide = fixture.homeId === state.manager.clubId ? 'home' : 'away';
  const ours = mySide === 'home' ? result.homeGoals - result.awayGoals : result.awayGoals - result.homeGoals;
  const verdict = ours > 0 ? 'A win for your side.' : ours === 0 ? 'The points are shared.' : 'A defeat for your side.';
  const s = result.stats;
  const statsLine = s
    ? `Possession ${s.home.possession}%–${s.away.possession}% · Shots ${s.home.shots}–${s.away.shots} · On target ${s.home.onTarget}–${s.away.onTarget} · Corners ${s.home.corners}–${s.away.corners}`
    : '';
  const mine = Object.values(live.players).filter((lp) => lp.side === mySide);
  const best = [...mine].sort((a, b) => b.rating - a.rating)[0];
  const bestPlayer = best ? state.world.players[best.id] : undefined;
  const news: string[] = [];
  for (const lp of mine) {
    const player = state.world.players[lp.id];
    if (!player) continue;
    const injury = live.injuries[lp.id];
    if (injury) news.push(`${playerLink(player)} picked up an injury (${injury.name.toLowerCase()}) and is out for about ${Math.max(1, Math.round(injury.days / 7))} week(s).`);
    if (player.suspension > 0) news.push(`${playerLink(player)} is suspended for the next match.`);
  }
  addNews(state, {
    category: 'result',
    title: `${home.shortName} ${result.homeGoals}-${result.awayGoals} ${away.shortName}`,
    body: [
      `${clubLink(home)} ${result.homeGoals}-${result.awayGoals} ${clubLink(away)}`,
      `${competitionLink(competition)}, round ${fixture.round}. ${verdict}`,
      lines.length > 0 ? `Goals:\n${lines.join('\n')}` : 'No goals.',
      statsLine,
      bestPlayer && best ? `Your best player: ${playerLink(bestPlayer)} (${best.rating.toFixed(1)}).` : '',
      ...news,
    ].filter(Boolean).join('\n\n'),
  });
}

/** Marks seasons as started and finishes any whose last fixture has been played. */
function afterResults(state: GameState, seasonIds: Iterable<Id>): void {
  for (const seasonId of new Set(seasonIds)) {
    const season = state.seasons[seasonId];
    if (!season || season.status === 'finished') continue;
    if (season.status === 'scheduled') season.status = 'inProgress';
    if (!seasonFixtures(state, season).every((f) => f.result !== null)) continue;
    if (getCompetition(state, season.competitionId).rules.split && !season.split) splitLeague(state, season);
    else finishSeason(state, season);
  }
}

/**
 * The split: once every club has met every other three times, the top and bottom halves play
 * each other once more. Home games go to whoever has had fewer so far.
 */
function splitLeague(state: GameState, season: CompetitionSeason): void {
  const competition = getCompetition(state, season.competitionId);
  const groupCount = competition.rules.split?.groups ?? 2;
  const order = seasonTable(state, season).map((r) => r.clubId);
  const size = Math.ceil(order.length / groupCount);
  const groups: Id[][] = [];
  for (let g = 0; g < groupCount; g++) groups.push(order.slice(g * size, (g + 1) * size));

  const fixtures = seasonFixtures(state, season);
  const homeGames = new Map<Id, number>();
  for (const f of fixtures) homeGames.set(f.homeId, (homeGames.get(f.homeId) ?? 0) + 1);
  const firstRound = Math.max(0, ...fixtures.map((f) => f.round)) + 1;
  const needed = splitRounds(competition.rules, order.length);
  let dates = (season.splitDates ?? []).filter((d) => d > state.date);
  if (dates.length < needed) {
    // Real fixture lists don't include the rounds after the split: play them weekly.
    dates = [];
    let d = nextWeekday(addDays(state.date, 1), 6);
    for (let i = 0; i < needed; i++, d = addDays(d, 7)) dates.push(d);
  }

  for (const group of groups) {
    roundRobin(state.rng, group, 1).forEach((pairings, i) => {
      for (const [a, b] of pairings) {
        const aHome = (homeGames.get(a) ?? 0) <= (homeGames.get(b) ?? 0);
        const [homeId, awayId] = aHome ? [a, b] : [b, a];
        homeGames.set(homeId, (homeGames.get(homeId) ?? 0) + 1);
        const fixture = addFixture(state, season.id, {
          competitionId: competition.id, round: firstRound + i, date: dates[i] as ISODate, homeId, awayId,
        });
        season.fixtureIds.push(fixture.id);
      }
    });
  }
  season.split = { groups };
  const last = dates[needed - 1];
  if (last && last > season.endDate) season.endDate = last;

  const humanClub = state.manager.clubId;
  const humanHere = humanClub !== null && order.includes(humanClub);
  addNews(state, {
    category: 'competition',
    title: `The ${competition.shortName} splits`,
    body: [
      `After ${firstRound - 1} rounds the ${competitionLink(competition)} divides in two. Each half plays its remaining ${needed} games among itself, and no club can move out of its half.`,
      ...groups.map((g, i) => `${i === 0 ? 'Top' : 'Bottom'} ${g.length}: ${listClubs(state, g)}.`),
      humanHere ? `Your side are in the ${groups[0]?.includes(humanClub) ? 'top' : 'bottom'} half.` : '',
    ].filter(Boolean).join('\n\n'),
    important: humanHere,
  });
}

/**
 * Plays every unplayed fixture scheduled for `date`, except `exceptId` (the manager's match
 * when it is being watched live). Playable leagues use the full match engine; shadow leagues
 * get a result from team strength alone.
 */
export function playFixtures(state: GameState, date: ISODate, exceptId?: Id): Fixture[] {
  const ids = state.fixturesByDate[date];
  if (!ids || ids.length === 0) return [];
  const squads = squadIndex(state);
  const strength = new Map<Id, number>();
  const strengthOf = (clubId: Id): number => {
    let value = strength.get(clubId);
    if (value === undefined) strength.set(clubId, (value = pickBestLineup(squads.get(clubId) ?? []).strength));
    return value;
  };

  const played: Fixture[] = [];
  const touched: Id[] = [];
  for (const id of ids) {
    const fixture = state.fixtures[id];
    if (!fixture || fixture.result || fixture.id === exceptId) continue;
    const competition = getCompetition(state, fixture.competitionId);
    if (competition.mode === 'playable') {
      const live = startMatch(state, fixture, false);
      playToEnd(matchContext(state), live);
      completeMatch(state, fixture, live);
    } else {
      const [homeGoals, awayGoals] = simulateScore(state.rng, strengthOf(fixture.homeId), strengthOf(fixture.awayId));
      fixture.result = { homeGoals, awayGoals, goals: [] };
      touched.push(fixture.seasonId);
    }
    played.push(fixture);
  }
  afterResults(state, touched);
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

/**
 * Semi-finals (best-placed club at home second) then a final, e.g. 3rd v 6th and 4th v 5th.
 * With an odd number of clubs the best-placed one waits in the final (Scotland: 3rd v 4th, then 2nd).
 */
function runPlayoff(
  state: GameState, order: readonly Id[], playoff: NonNullable<LeagueRules['promotionPlayoff']>,
): { winnerId: Id; lines: string[] } {
  const seeds = order.slice(playoff.from - 1, playoff.to);
  const names = (id: Id) => clubLink(getClub(state, id));
  const finalists: Id[] = [];
  const lines: string[] = [];
  const bye = seeds.length % 2 === 1 ? (seeds.shift() as Id) : null;
  const versus = playoff.versusPlace !== undefined;
  for (let i = 0; i < seeds.length / 2; i++) {
    const higher = seeds[i] as Id;
    const lower = seeds[seeds.length - 1 - i] as Id;
    const winner = playTie(state, lower, higher, 2);
    finalists.push(winner);
    lines.push(`${bye ? 'Quarter-final' : 'Semi-final'}: ${names(higher)} v ${names(lower)} — ${names(winner)} go through.`);
  }
  if (bye) finalists.unshift(bye);
  const [a, b] = finalists as [Id, Id];
  // In a two-legged final the lower-placed club is at home first.
  const winnerId = (playoff.finalLegs ?? 1) === 2 ? playTie(state, b, a, 2) : playTie(state, a, b, 1);
  lines.push(
    `${bye ? 'Semi-final' : 'Final'}: ${names(a)} v ${names(b)} — ${names(winnerId)} ${versus ? 'go through to the play-off final' : 'win promotion'}.`,
  );
  return { winnerId, lines };
}

/**
 * Play-off finals between leagues (Scotland: the Championship's play-off winner v the
 * Premiership's 11th-placed club), played once both seasons are over.
 */
function settleTierPlayoffs(state: GameState, nationId: Id): void {
  for (const competition of Object.values(state.world.competitions)) {
    const { promotionPlayoff, promotion } = competition.rules;
    if (competition.nationId !== nationId || !promotionPlayoff?.versusPlace || !promotion) continue;
    const lower = currentSeasonOf(state, competition.id);
    const upper = currentSeasonOf(state, promotion.to);
    const challengerId = lower?.final?.playoffQualifierId;
    if (!lower?.final || !challengerId || lower.final.playoffWinnerId || lower.final.playoffRelegatedId === null) continue;
    if (lower.final.playoffRelegatedId !== undefined || !upper?.final || upper.status !== 'finished') continue;
    const defenderId = upper.final.order[promotionPlayoff.versusPlace - 1];
    if (!defenderId) continue;
    const winnerId = playTie(state, challengerId, defenderId, 2);
    const challengerWon = winnerId === challengerId;
    if (challengerWon) {
      lower.final.playoffWinnerId = challengerId;
      lower.final.playoffRelegatedId = defenderId;
    } else {
      lower.final.playoffRelegatedId = null;
    }
    const upperCompetition = getCompetition(state, promotion.to);
    const human = state.manager.clubId;
    const winner = getClub(state, winnerId);
    addNews(state, {
      category: 'season',
      title: `${winner.shortName} win the ${upperCompetition.shortName} play-off final`,
      body: [
        `${clubLink(getClub(state, challengerId))} (${competition.shortName}) v ${clubLink(getClub(state, defenderId))} (${upperCompetition.shortName}), over two legs.`,
        challengerWon
          ? `${clubLink(winner)} are promoted to the ${competitionLink(upperCompetition)}; ${clubLink(getClub(state, defenderId))} go down.`
          : `${clubLink(winner)} stay in the ${competitionLink(upperCompetition)}.`,
      ].join('\n\n'),
      important: human === challengerId || human === defenderId,
    });
  }
}

function finishSeason(state: GameState, season: CompetitionSeason): void {
  const competition = getCompetition(state, season.competitionId);
  const table = seasonTable(state, season);
  const order = table.map((r) => r.clubId);
  const championId = order[0] as Id;
  season.final = { order, championId };
  season.status = 'finished';
  const playoff = competition.rules.promotionPlayoff ? runPlayoff(state, order, competition.rules.promotionPlayoff) : null;
  if (playoff) {
    if (competition.rules.promotionPlayoff?.versusPlace) season.final.playoffQualifierId = playoff.winnerId;
    else season.final.playoffWinnerId = playoff.winnerId;
  }

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
  settleTierPlayoffs(state, competition.nationId);
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
      const final = currentSeasonOf(state, competition.id)?.final;
      if (final?.playoffWinnerId) promoted.push(final.playoffWinnerId);
      for (const clubId of promoted) moves.push({ clubId, from: competition.id, to: promotion.to });
      // A club from the league above that lost a play-off final against this league's club.
      if (final?.playoffRelegatedId) moves.push({ clubId: final.playoffRelegatedId, from: promotion.to, to: competition.id });
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
/** Players recover fitness every day: quicker for the naturally fit, slower for older players. */
function recoverFitness(state: GameState): void {
  for (const player of Object.values(state.world.players)) {
    if (player.injury && player.injury.until <= state.date) player.injury = null;
    if (player.condition >= 100) continue;
    const age = yearOf(state.date) - yearOf(player.dateOfBirth);
    const rate = 4 + (player.attributes.fitness / 20) * 6 - Math.max(0, age - 30) * 0.4;
    player.condition = Math.min(100, Math.round(player.condition + rate));
  }
}

function dailyTasks(state: GameState): void {
  recoverFitness(state);
  developmentDay(state);
  transferDay(state);
  scoutingDay(state);
  boardDay(state);
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

/**
 * Board expectations from how strong the squad is compared with its league rivals (best XI),
 * so a big club with a third-best squad is asked for the top four, not the title.
 */
export function boardExpectation(state: GameState, clubId: Id): string {
  return boardTarget(state, clubId).text;
}

export function takeJob(state: GameState, clubId: Id): void {
  const club = getClub(state, clubId);
  state.manager.clubId = clubId;
  board(state);
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
