import type { Attributes, HiddenAttributes, Position } from './attributes.ts';
import type { ISODate } from './dates.ts';
import type { LeagueRules } from './rules.ts';
import type { Rng } from './rng.ts';
import type { Tactics } from './tactics.ts';

export type Id = string;

export interface Nation {
  id: Id;
  name: string;
  /** Three-letter code shown in tables, e.g. 'ENG'. */
  code: string;
  /** Which name pool generated players from this nation use. */
  namePool: string;
}

export interface Club {
  id: Id;
  name: string;
  shortName: string;
  nationId: Id;
  /** 1–100: how big the club is. Drives finances, attraction and expectations. */
  reputation: number;
  stadium: string;
  founded: number;
  colours: { primary: string; secondary: string };
  /** Competition the club's league football is played in. */
  leagueId: Id;
}

export interface Contract {
  /** Weekly wage, in euros. */
  wage: number;
  expires: ISODate;
}

export interface PlayerSeasonStats {
  season: string;
  competitionId: Id;
  clubId: Id;
  apps: number;
  goals: number;
  assists: number;
  /** Sum of match ratings; average = ratingTotal / apps. */
  ratingTotal: number;
  yellow: number;
  red: number;
}

export interface Injury {
  name: string;
  /** First day the player is fit again. */
  until: ISODate;
}

export interface Player {
  id: Id;
  firstName: string;
  lastName: string;
  /** Single-name players (common in Brazil), shown instead of first + last. */
  knownAs?: string;
  nationId: Id;
  dateOfBirth: ISODate;
  clubId: Id | null;
  /** Familiarity 1–20 per position the player can play. The highest is their main position. */
  positions: Partial<Record<Position, number>>;
  foot: 'L' | 'R' | 'B';
  attributes: Attributes;
  hidden: HiddenAttributes;
  /** Current Ability, 1–200 (hidden). */
  ca: number;
  /** Potential Ability, 1–200 (hidden). */
  pa: number;
  contract: Contract | null;
  /** Estimated transfer value in euros. */
  value: number;
  squadNumber: number | null;
  stats: PlayerSeasonStats[];
  /** Match fitness, 0–100. Drops after matches and recovers day by day. */
  condition: number;
  injury: Injury | null;
  /** Matches still to sit out through suspension. */
  suspension: number;
  /** Match ratings from the last five games, oldest first. */
  form: number[];
}

export interface Competition {
  id: Id;
  name: string;
  shortName: string;
  nationId: Id;
  /** 1 = top division. */
  tier: number;
  /**
   * 'playable': full simulation, can be managed in.
   * 'shadow': background league that exists for promotion and relegation (PLAN §3.1).
   */
  mode: 'playable' | 'shadow';
  rules: LeagueRules;
}

export interface World {
  nations: Record<Id, Nation>;
  clubs: Record<Id, Club>;
  players: Record<Id, Player>;
  competitions: Record<Id, Competition>;
}

export interface GoalEvent {
  minute: number;
  clubId: Id;
  /** null = own goal. */
  scorerId: Id | null;
  assistId: Id | null;
}

export interface TeamMatchStats {
  /** Share of possession, 0–100. */
  possession: number;
  shots: number;
  onTarget: number;
  corners: number;
  fouls: number;
  yellow: number;
  red: number;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  goals: GoalEvent[];
  /** Starting XIs, kept only for the human's matches. */
  lineups?: { home: Id[]; away: Id[] };
  stats?: { home: TeamMatchStats; away: TeamMatchStats };
  /** Match ratings (1–10) of everyone who played, kept only for the human's matches. */
  ratings?: Record<Id, number>;
}

export interface Fixture {
  id: Id;
  competitionId: Id;
  seasonId: Id;
  round: number;
  date: ISODate;
  homeId: Id;
  awayId: Id;
  result: MatchResult | null;
}

export interface CompetitionSeason {
  id: Id;
  competitionId: Id;
  /** '2026-27' for Aug–May leagues, '2026' for calendar-year leagues. */
  label: string;
  startDate: ISODate;
  endDate: ISODate;
  clubIds: Id[];
  fixtureIds: Id[];
  status: 'scheduled' | 'inProgress' | 'finished';
  final: {
    order: Id[];
    championId: Id;
    /** Winner of the promotion play-off, if the league has one. */
    playoffWinnerId?: Id;
  } | null;
}

export type NewsCategory = 'welcome' | 'result' | 'competition' | 'season' | 'club';

/**
 * News body text can contain entity links written as [[type:id|label]],
 * e.g. [[club:c3|Ashford United]]. The UI turns these into links.
 */
export interface NewsItem {
  id: Id;
  date: ISODate;
  category: NewsCategory;
  title: string;
  body: string;
  read: boolean;
  /** Important items stop Continue so the manager sees them. */
  important: boolean;
}

export interface Manager {
  name: string;
  clubId: Id | null;
  /** The manager's team selection and instructions; created when they first need one. */
  tactics: Tactics | null;
}

export interface GameState {
  /** Save format version, bumped when the shape changes. */
  version: number;
  seed: string;
  rng: Rng;
  date: ISODate;
  world: World;
  seasons: Record<Id, CompetitionSeason>;
  /** Latest season of each competition. */
  currentSeason: Record<Id, Id>;
  fixtures: Record<Id, Fixture>;
  fixturesByDate: Record<ISODate, Id[]>;
  news: NewsItem[];
  manager: Manager;
  counters: { fixture: number; news: number; season: number };
}

export type EntityType = 'club' | 'player' | 'competition' | 'nation';
