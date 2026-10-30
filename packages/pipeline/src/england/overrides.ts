import type { Position } from '@moc/engine';

/**
 * Hand corrections to the generated ratings, made after reading the review report
 * (data/reports/england-2026-27-ratings.md). Match on the name shown in the report and the club id.
 *
 * Example: { name: 'Moisés Caicedo', club: 'chelsea', ca: 165, note: 'Injured early season; elite DM' }
 */
export interface RatingOverride {
  name: string;
  club: string;
  /** Current Ability, 1–200. Attributes are regenerated to match. */
  ca?: number;
  /** Main position, e.g. 'DR' for a right-back the data marked as left-back. */
  main?: Position;
  note?: string;
}

export const OVERRIDES: RatingOverride[] = [];
