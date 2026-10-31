import type { Attributes, HiddenAttributes, Position } from './attributes.ts';
import type { ISODate } from './dates.ts';
import type { LeagueRules } from './rules.ts';
import type { Rng } from './rng.ts';
import type { BoardState } from './board.ts';
import type { OwnerKind } from './finance.ts';
import type { ScoutingState } from './scouting.ts';
import type { Tactics } from './tactics.ts';

export type Id = string;

export interface Nation {
  id: Id;
  name: string;
  /** Three-letter code shown in tables, e.g. 'ENG'. */
  code: string;
  /** Which name pool generated players from this nation use. */
  namePool: string;
  /** How much money its clubs have compared with English clubs of the same size (1 when unset). */
  wealth?: number;
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
  /** Who owns the club, which decides how it spends (guessed from its size when not given). */
  owner?: OwnerKind;
  /** Cash in the bank at the start of the game, in euros (estimated when not given). */
  startingCash?: number;
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
  /** Put up for sale by their club. */
  transferListed: boolean;
  /** Retired players stay in the world for history but play no further part. */
  retired?: boolean;
  /** Current Ability at the start of each month, oldest first (last three years). */
  abilityHistory: Array<[ISODate, number]>;
  /** Fraction of an ability point carried between monthly updates. */
  growthCarry: number;
  /** Set while the player is on loan: their parent club, the last day of the loan and any option to buy. */
  loan?: { fromId: Id; until: ISODate; option?: LoanOption | null } | null;
  /**
   * A player found by the manager's scouts at a club abroad (outside the simulated leagues).
   * They have no club in the game; they can be bought until `until`, then the trail goes cold.
   */
  abroad?: { nationId: Id; until: ISODate; /** What their club wants, fixed when the scout found them. */ price: number } | null;
}

/**
 * A fee agreed when a loan is arranged. With an option the borrowing club may buy the player for
 * it at any time during the loan; with an obligation the move becomes permanent when the loan ends.
 */
export interface LoanOption {
  fee: number;
  obligatory: boolean;
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
    /** Club promoted through the play-off, if the league has one. */
    playoffWinnerId?: Id;
    /** Winner of the play-off in this league, waiting to play the club from the league above. */
    playoffQualifierId?: Id;
    /** The club from the league above that lost the play-off and goes down (null: it won). */
    playoffRelegatedId?: Id | null;
  } | null;
  /** Set once a league with a split has divided: the clubs in each half, top half first. */
  split?: { groups: Id[][] } | null;
  /** Match dates kept for the rounds after the split. */
  splitDates?: ISODate[];
}

export type NewsCategory = 'welcome' | 'result' | 'competition' | 'season' | 'club' | 'transfer';

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
  /** A transfer offer the manager can act on from the inbox. */
  bidId?: Id;
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
  finances: Record<Id, ClubFinances>;
  transfers: TransferMarket;
  /** What the manager knows about other clubs' players; created when first needed. */
  scouting?: ScoutingState;
  /** The board's view of the manager, budgets requests and facilities; created when first needed. */
  board?: BoardState;
  /** TV and prize money per league each season; set up when the game is created. */
  economy?: { tv: Record<Id, number> };
}

export interface ClubFinances {
  /** Money available for transfer fees, in euros. */
  transferBudget: number;
  /** The most the club will pay in wages per week, in euros. */
  wageBudget: number;
  /** Cash in the bank (can go negative: an overdraft). */
  cash?: number;
  /** The club's own income each season (matchday, commercial), before TV money. */
  ownIncome?: number;
  /** Transfer money this financial year. */
  season?: { spent: number; received: number };
  /** Last year's accounts. */
  accounts?: {
    year: string;
    income: number;
    wages: number;
    costs: number;
    /** Owner money in (+) or debt repayments (−). */
    funding: number;
    transfersSpent: number;
    transfersReceived: number;
    cash: number;
  };
}

export type BidStatus =
  | 'pending' // waiting for the selling club
  | 'countered' // the seller named a higher price
  | 'rejected'
  | 'accepted' // fee agreed; the buyer now needs to agree terms with the player
  | 'agreed' // everything agreed; the player moves when the window opens (`moveOn`)
  | 'completed'
  | 'collapsed' // fee agreed but the player turned the move down, or the window shut
  | 'withdrawn';

export interface Bid {
  id: Id;
  playerId: Id;
  buyerId: Id;
  sellerId: Id;
  fee: number;
  status: BidStatus;
  /** The price the seller wants when they counter. */
  asking?: number;
  created: ISODate;
  /** When the other side will answer. */
  respondOn: ISODate;
  /** Short explanation for the manager. */
  note?: string;
  /** A loan rather than a permanent move; the player returns after `loanUntil`. */
  kind?: 'transfer' | 'loan';
  loanUntil?: ISODate;
  /** Option or obligation to buy at the end of a loan. */
  option?: LoanOption;
  /** Who opened the talks; a loan the manager offered out is 'seller'. */
  initiator?: 'buyer' | 'seller';
  /**
   * Hidden limit of the computer club in the talks: the least a seller will really take, or the
   * most a buyer will pay. The asking price or opening offer is only their starting position.
   */
  limit?: number;
  /** Rounds of offers and counter-offers so far. */
  round?: number;
  /** The seller's last counter-offer, which their next counter comes down from. */
  lastAsk?: number;
  /** Agreed terms, and the day the player moves. */
  wage?: number;
  years?: number;
  moveOn?: ISODate;
}

export interface TransferRecord {
  date: ISODate;
  playerId: Id;
  fromId: Id | null;
  toId: Id | null;
  fee: number;
  /** 'import': signed from a club outside the simulated leagues. */
  kind: 'transfer' | 'free' | 'released' | 'import' | 'loan' | 'loanReturn';
}

export interface TransferMarket {
  bids: Bid[];
  history: TransferRecord[];
  counter: number;
}

export type EntityType = 'club' | 'player' | 'competition' | 'nation';
