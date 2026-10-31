/** Read-only helpers the UI and harness use to look at the game state. */
import { type Position, POSITION_GROUP, POSITIONS } from './attributes.ts';
import { computeTable, type TableRow } from './standings.ts';
import { mainPosition } from './players.ts';
import type { Club, Competition, CompetitionSeason, Fixture, GameState, Id, Player } from './types.ts';

export function getClub(state: GameState, id: Id): Club {
  const club = state.world.clubs[id];
  if (!club) throw new Error(`Unknown club ${id}`);
  return club;
}

export function getCompetition(state: GameState, id: Id): Competition {
  const competition = state.world.competitions[id];
  if (!competition) throw new Error(`Unknown competition ${id}`);
  return competition;
}

export function currentSeasonOf(state: GameState, competitionId: Id): CompetitionSeason | null {
  const id = state.currentSeason[competitionId];
  return id ? (state.seasons[id] ?? null) : null;
}

export function seasonFixtures(state: GameState, season: CompetitionSeason): Fixture[] {
  return season.fixtureIds.map((id) => state.fixtures[id]).filter((f): f is Fixture => f !== undefined);
}

export function seasonTable(state: GameState, season: CompetitionSeason): TableRow[] {
  const competition = getCompetition(state, season.competitionId);
  const rows = computeTable(season.clubIds, seasonFixtures(state, season), competition.rules, (id) => getClub(state, id).name);
  // After a split, clubs stay in their half whatever their points.
  const groups = season.split?.groups;
  if (!groups) return rows;
  return groups.flatMap((group) => rows.filter((r) => group.includes(r.clubId)));
}

export function leaguePosition(state: GameState, clubId: Id): number | null {
  const club = getClub(state, clubId);
  const season = currentSeasonOf(state, club.leagueId);
  if (!season) return null;
  const index = seasonTable(state, season).findIndex((r) => r.clubId === clubId);
  return index < 0 ? null : index + 1;
}

/** Index of players by club, built once per call site that needs many squads. */
export function squadIndex(state: GameState): Map<Id, Player[]> {
  const index = new Map<Id, Player[]>();
  for (const player of Object.values(state.world.players)) {
    if (!player.clubId) continue;
    let list = index.get(player.clubId);
    if (!list) index.set(player.clubId, (list = []));
    list.push(player);
  }
  return index;
}

const POSITION_ORDER = new Map<Position, number>(POSITIONS.map((p, i) => [p, i]));

/** Squad sorted the conventional way: keepers, defenders, midfielders, attackers. */
export function squadOf(state: GameState, clubId: Id): Player[] {
  return Object.values(state.world.players)
    .filter((p) => p.clubId === clubId)
    .sort((a, b) => {
      const pa = POSITION_ORDER.get(mainPosition(a)) ?? 0;
      const pb = POSITION_ORDER.get(mainPosition(b)) ?? 0;
      return pa - pb || (a.squadNumber ?? 99) - (b.squadNumber ?? 99);
    });
}

export function positionGroupOf(player: Player): string {
  return POSITION_GROUP[mainPosition(player)];
}

export function clubFixtures(state: GameState, clubId: Id, seasonId?: Id): Fixture[] {
  const club = getClub(state, clubId);
  const season = seasonId ? state.seasons[seasonId] : currentSeasonOf(state, club.leagueId);
  if (!season) return [];
  return seasonFixtures(state, season)
    .filter((f) => f.homeId === clubId || f.awayId === clubId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function nextFixture(state: GameState, clubId: Id): Fixture | null {
  return clubFixtures(state, clubId).find((f) => f.result === null && f.date >= state.date) ?? null;
}

export interface ScorerRow {
  playerId: Id;
  clubId: Id;
  goals: number;
  assists: number;
  apps: number;
}

export function topScorers(state: GameState, season: CompetitionSeason, limit = 20): ScorerRow[] {
  const rows: ScorerRow[] = [];
  for (const player of Object.values(state.world.players)) {
    for (const s of player.stats) {
      if (s.season !== season.label || s.competitionId !== season.competitionId || s.goals === 0) continue;
      rows.push({ playerId: player.id, clubId: s.clubId, goals: s.goals, assists: s.assists, apps: s.apps });
    }
  }
  return rows.sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.apps - b.apps).slice(0, limit);
}

/** Every season a competition has had, newest first. */
export function seasonsOf(state: GameState, competitionId: Id): CompetitionSeason[] {
  return Object.values(state.seasons)
    .filter((s) => s.competitionId === competitionId)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
}

export function unreadNewsCount(state: GameState): number {
  return state.news.reduce((n, item) => n + (item.read ? 0 : 1), 0);
}
