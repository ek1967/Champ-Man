import { addDays, dayOfWeek, type ISODate, onYear } from './dates.ts';
import { type Rng, shuffle } from './rng.ts';
import type { Id } from './types.ts';

export type Pairing = readonly [home: Id, away: Id];

/**
 * Round-robin schedule using the circle method.
 * Each "leg" is a full single round-robin; even legs are mirrored with home and away swapped,
 * so in a double round-robin every pair meets once at each ground.
 */
export function roundRobin(rng: Rng, clubIds: readonly Id[], legs = 2): Pairing[][] {
  const teams: Array<Id | null> = shuffle(rng, [...clubIds]);
  if (teams.length % 2 === 1) teams.push(null);
  const n = teams.length;
  const firstLeg: Pairing[][] = [];
  let ring = teams.slice();

  for (let round = 0; round < n - 1; round++) {
    const pairs: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i] ?? null;
      const b = ring[n - 1 - i] ?? null;
      if (a === null || b === null) continue;
      // The fixed club alternates each round; other slots alternate by position. As clubs rotate
      // through the slots this keeps home/away runs to three games at most.
      const aAtHome = i === 0 ? round % 2 === 0 : i % 2 === 0;
      pairs.push(aAtHome ? [a, b] : [b, a]);
    }
    firstLeg.push(pairs);
    // Keep the first team fixed, rotate the rest one place.
    ring = [ring[0] ?? null, ring[n - 1] ?? null, ...ring.slice(1, n - 1)];
  }

  const schedule: Pairing[][] = [];
  for (let leg = 0; leg < legs; leg++) {
    for (const pairs of firstLeg) {
      schedule.push(leg % 2 === 0 ? pairs : pairs.map(([h, a]) => [a, h] as const));
    }
  }
  return schedule;
}

function inRanges(date: ISODate, ranges: ReadonlyArray<readonly [ISODate, ISODate]>): boolean {
  return ranges.some(([from, to]) => date >= from && date <= to);
}

/** Turns ['MM-DD', 'MM-DD'] ranges into real dates for a season starting in `startYear`. */
export function blockedRangesForSeason(
  blocked: ReadonlyArray<readonly [string, string]>,
  startYear: number,
  calendar: 'aug-may' | 'calendar',
): Array<[ISODate, ISODate]> {
  // Aug–May seasons: months July–December belong to the start year, the rest to the next year.
  const yearFor = (md: string): number =>
    calendar === 'calendar' || Number(md.slice(0, 2)) >= 7 ? startYear : startYear + 1;
  return blocked.map(([from, to]) => [onYear(from, yearFor(from)), onYear(to, yearFor(to))]);
}

/**
 * Picks match dates for `roundCount` rounds between `start` and `end`.
 * Saturdays outside international breaks are used first, spread evenly across the season;
 * if there aren't enough, midweek (Wednesday) rounds are added, as real leagues do.
 */
export function scheduleRoundDates(
  start: ISODate,
  end: ISODate,
  roundCount: number,
  blocked: ReadonlyArray<readonly [ISODate, ISODate]> = [],
): ISODate[] {
  const saturdays: ISODate[] = [];
  const wednesdays: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (inRanges(d, blocked)) continue;
    const dow = dayOfWeek(d);
    if (dow === 6) saturdays.push(d);
    else if (dow === 3) wednesdays.push(d);
  }

  if (saturdays.length >= roundCount) {
    if (roundCount === 1) return [saturdays[0] as ISODate];
    const picked: ISODate[] = [];
    for (let i = 0; i < roundCount; i++) {
      picked.push(saturdays[Math.round((i * (saturdays.length - 1)) / (roundCount - 1))] as ISODate);
    }
    return picked;
  }

  const extraNeeded = roundCount - saturdays.length;
  if (extraNeeded > wednesdays.length) {
    throw new Error(`Cannot fit ${roundCount} rounds between ${start} and ${end}`);
  }
  // Spread the midweek rounds evenly through the season.
  const extras: ISODate[] = [];
  for (let i = 0; i < extraNeeded; i++) {
    extras.push(wednesdays[Math.floor(((i + 0.5) * wednesdays.length) / extraNeeded)] as ISODate);
  }
  return [...saturdays, ...extras].sort();
}

/** First date on or after `date` that falls on the given weekday (0 = Sunday). */
export function nextWeekday(date: ISODate, weekday: number): ISODate {
  let d = date;
  while (dayOfWeek(d) !== weekday) d = addDays(d, 1);
  return d;
}

/** Last date on or before `date` that falls on the given weekday. */
export function previousWeekday(date: ISODate, weekday: number): ISODate {
  let d = date;
  while (dayOfWeek(d) !== weekday) d = addDays(d, -1);
  return d;
}
