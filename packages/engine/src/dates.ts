/** Calendar dates are ISO strings ('2026-06-15'): sortable, readable and safe to save. */
export type ISODate = string;

const MS_PER_DAY = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function toDate(date: ISODate): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function fromDate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function makeDate(year: number, month: number, day: number): ISODate {
  return fromDate(new Date(Date.UTC(year, month - 1, day)));
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDate(new Date(toDate(date).getTime() + days * MS_PER_DAY));
}

export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: ISODate): number {
  return toDate(date).getUTCDay();
}

export function yearOf(date: ISODate): number {
  return Number(date.slice(0, 4));
}

/** 'MM-DD' part of a date, used for yearly recurring events. */
export function monthDay(date: ISODate): string {
  return date.slice(5);
}

/** Date in the given year for an 'MM-DD' string. */
export function onYear(md: string, year: number): ISODate {
  return `${year}-${md}`;
}

/** 'Mon 15 Jun 2026' */
export function formatLong(date: ISODate): string {
  const d = toDate(date);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** '15 Jun' */
export function formatShort(date: ISODate): string {
  const d = toDate(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function ageOn(dateOfBirth: ISODate, date: ISODate): number {
  const birth = toDate(dateOfBirth);
  const now = toDate(date);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}
