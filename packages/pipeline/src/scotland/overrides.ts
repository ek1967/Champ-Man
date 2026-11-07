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
  /** Other positions the player is accomplished in. */
  also?: string[];
}

export const SCOTTISH_OVERRIDES: ScottishOverride[] = [
  { name: 'Kieran Tierney', club: 'celtic', position: 'DL' },
  { name: 'Colby Donovan', club: 'celtic', position: 'DR' },
  { name: 'Jordan Lotomba', club: 'celtic', position: 'DR' },
  { name: 'Landon Emenalo', club: 'celtic', position: 'DL', also: ['MC', 'DM'] },
  { name: 'Camilo Durán', club: 'celtic', also: ['AMR'] },
];
