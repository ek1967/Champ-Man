/**
 * Competition rules live in data, not code (PLAN §7.4).
 * Each league describes its own season window, tie-breakers and movement between tiers.
 */

export type TieBreaker =
  | 'points'
  | 'goalDifference'
  | 'goalsFor'
  | 'wins'
  | 'awayGoalsFor'
  /** Head-to-head criteria are computed only among the clubs still tied. */
  | 'h2hPoints'
  | 'h2hGoalDifference'
  | 'h2hGoalsFor';

export type ZoneKind = 'champion' | 'continental' | 'promotion' | 'playoff' | 'relegation';

export interface TableZone {
  /** 1-based positions, inclusive. */
  from: number;
  to: number;
  kind: ZoneKind;
  label: string;
}

export interface LeagueRules {
  format: 'league';
  /** Times each pair meets: 2 = home and away. */
  rounds: number;
  points: { win: number; draw: number; loss: number };
  tieBreakers: TieBreaker[];
  season: {
    /** 'aug-may' seasons are labelled '2026-27'; 'calendar' seasons '2026'. */
    calendar: 'aug-may' | 'calendar';
    /** First round is played on or after this date ('MM-DD'). */
    start: string;
    /** Last round is played on or before this date ('MM-DD', in the following year for aug-may). */
    end: string;
    /** Date the next season is set up and clubs move between tiers ('MM-DD'). */
    rollover: string;
    /** Weekends kept free for international matches: ['MM-DD', 'MM-DD'] ranges. */
    blocked: Array<[string, string]>;
  };
  /** Bottom N go down to `to`. */
  relegation?: { places: number; to: string };
  /** Top N go up to `to`. */
  promotion?: { places: number; to: string };
  /**
   * Positions `from`–`to` play off for one more promotion place (e.g. 3rd–6th in the Championship):
   * two-legged semi-finals, then a one-off final. With an odd number of clubs the best-placed one
   * goes straight to the final (Scotland: 3rd v 4th, then 2nd v the winner).
   */
  promotionPlayoff?: {
    from: number;
    to: number;
    /** Legs in the final; 1 (a one-off at a neutral ground) unless set. */
    finalLegs?: 1 | 2;
    /**
     * The winner then plays the club finishing in this place in the league above, over two legs,
     * for a place in that league (Scotland: the Premiership's 11th-placed club).
     */
    versusPlace?: number;
  };
  /**
   * After `after` rounds the league splits into `groups` equal halves by position; each half plays
   * a single round-robin and clubs can't leave their half (the Scottish Premiership's split).
   */
  split?: { after: number; groups: number };
  zones: TableZone[];
}

/** International windows used by European leagues (approximate FIFA calendar). */
export const EUROPEAN_INTERNATIONAL_BREAKS: Array<[string, string]> = [
  ['09-01', '09-09'],
  ['10-05', '10-13'],
  ['11-09', '11-17'],
  ['03-22', '03-30'],
];

export const ENGLISH_STYLE_TIEBREAKERS: TieBreaker[] = [
  'points', 'goalDifference', 'goalsFor', 'h2hPoints', 'awayGoalsFor',
];

export const HEAD_TO_HEAD_FIRST_TIEBREAKERS: TieBreaker[] = [
  'points', 'h2hPoints', 'h2hGoalDifference', 'goalDifference', 'goalsFor',
];
