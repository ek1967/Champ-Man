/**
 * Hand corrections for the estimated Scottish ratings, applied after the estimates. Match by the
 * name shown in the review report (data/reports/scotland-2026-27-squads.md) and the club id.
 */
export interface ScottishOverride {
  name: string;
  club: string;
  /** Current Ability, 1–200 (England's Premier League sides average about 125–170 for their best XI). */
  ca?: number;
  /** Main position, e.g. 'DC', 'AML'. */
  position?: string;
}

export const SCOTTISH_OVERRIDES: ScottishOverride[] = [];
