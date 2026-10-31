/**
 * Ability estimates for Scottish players. There is no open source of match statistics for
 * Scotland (England uses Fantasy Premier League), so ratings come from what the squad lists and
 * Wikidata do say: the club's level, the player's age, squad number (first-choice players tend to
 * wear 1–11, academy players 40+) and whether they have played for a senior national team. Each
 * club is then shifted so its best eleven matches the level set for it in clubs.ts. The review
 * report lists every rating; corrections go in scotland/overrides.ts.
 */
import { createRng, hashString, random } from '@moc/engine';

export interface EstimateInput {
  id: string;
  age: number;
  number: number | null;
  seniorInternational: boolean;
  keeper: boolean;
  /** On loan from another club (often a bigger one). */
  loanedIn: boolean;
}

function ageAdjustment(age: number): number {
  if (age <= 17) return -26;
  if (age === 18) return -21;
  if (age === 19) return -15;
  if (age === 20) return -10;
  if (age === 21) return -6;
  if (age === 22) return -3;
  if (age === 23) return -1;
  if (age <= 30) return 0;
  if (age === 31) return -1;
  if (age === 32) return -3;
  if (age === 33) return -5;
  return -8;
}

function numberAdjustment(number: number | null, keeper: boolean): number {
  if (number === null) return -2;
  if (keeper) return number === 1 ? 5 : number >= 40 ? -12 : -4;
  if (number <= 11) return 3;
  if (number <= 25) return 0;
  if (number <= 39) return -4;
  return -10;
}

/** Ability relative to the club's level (0 = a typical first-team player there). */
export function relativeAbility(p: EstimateInput): number {
  const noise = (random(createRng(hashString(`sco-est:${p.id}`))) - 0.5) * 8;
  return ageAdjustment(p.age) + numberAdjustment(p.number, p.keeper) + (p.seniorInternational ? 7 : 0) + (p.loanedIn ? 2 : 0) + noise;
}

/** Room to grow by age; each save varies it further. */
export function headroomFor(age: number): number {
  if (age <= 19) return 26;
  if (age <= 21) return 18;
  if (age <= 23) return 11;
  if (age <= 25) return 6;
  if (age <= 27) return 3;
  return 0;
}

/**
 * Turns relative estimates into Current Ability so the best eleven average `xi`.
 * Returns abilities in the same order as `relative`.
 */
export function fitToLevel(relative: readonly number[], xi: number): number[] {
  if (relative.length === 0) return [];
  const best = [...relative].sort((a, b) => b - a).slice(0, 11);
  const shift = xi - best.reduce((a, b) => a + b, 0) / best.length;
  return relative.map((r) => Math.max(35, Math.min(195, Math.round(r + shift))));
}
