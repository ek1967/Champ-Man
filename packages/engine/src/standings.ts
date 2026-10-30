import type { LeagueRules, TieBreaker } from './rules.ts';
import type { Fixture, Id } from './types.ts';

export type FormResult = 'W' | 'D' | 'L';

export interface TableRow {
  clubId: Id;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  awayGoalsFor: number;
  /** Most recent last, up to five results. */
  form: FormResult[];
}

function emptyRow(clubId: Id): TableRow {
  return {
    clubId, played: 0, won: 0, drawn: 0, lost: 0,
    goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, awayGoalsFor: 0, form: [],
  };
}

function addResult(row: TableRow, scored: number, conceded: number, away: boolean, rules: LeagueRules): void {
  row.played++;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  if (away) row.awayGoalsFor += scored;
  let result: FormResult;
  if (scored > conceded) {
    row.won++;
    row.points += rules.points.win;
    result = 'W';
  } else if (scored === conceded) {
    row.drawn++;
    row.points += rules.points.draw;
    result = 'D';
  } else {
    row.lost++;
    row.points += rules.points.loss;
    result = 'L';
  }
  row.form.push(result);
  if (row.form.length > 5) row.form.shift();
}

/** Builds rows for the given clubs from played fixtures (in date order). */
export function tallyRows(clubIds: readonly Id[], fixtures: readonly Fixture[], rules: LeagueRules): Map<Id, TableRow> {
  const rows = new Map<Id, TableRow>();
  for (const id of clubIds) rows.set(id, emptyRow(id));
  const played = fixtures.filter((f) => f.result !== null).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const f of played) {
    const home = rows.get(f.homeId);
    const away = rows.get(f.awayId);
    if (!home || !away || !f.result) continue;
    addResult(home, f.result.homeGoals, f.result.awayGoals, false, rules);
    addResult(away, f.result.awayGoals, f.result.homeGoals, true, rules);
  }
  return rows;
}

function isHeadToHead(tb: TieBreaker): boolean {
  return tb.startsWith('h2h');
}

function criterionValue(tb: TieBreaker, row: TableRow): number {
  switch (tb) {
    case 'points':
    case 'h2hPoints':
      return row.points;
    case 'goalDifference':
    case 'h2hGoalDifference':
      return row.goalDifference;
    case 'goalsFor':
    case 'h2hGoalsFor':
      return row.goalsFor;
    case 'wins':
      return row.won;
    case 'awayGoalsFor':
      return row.awayGoalsFor;
  }
}

/**
 * Orders tied clubs by the remaining tie-breakers. Head-to-head criteria use a mini-table of
 * matches among the clubs still level, which is how LaLiga and Serie A apply them.
 * Clubs still level after every criterion are ordered by name for a stable result.
 */
function rankGroup(
  group: TableRow[],
  criteria: readonly TieBreaker[],
  fixtures: readonly Fixture[],
  rules: LeagueRules,
  nameOf: (id: Id) => string,
): TableRow[] {
  if (group.length <= 1) return group;
  const [criterion, ...rest] = criteria;
  if (!criterion) return [...group].sort((a, b) => nameOf(a.clubId).localeCompare(nameOf(b.clubId)));

  let source: Map<Id, TableRow> | null = null;
  if (isHeadToHead(criterion)) {
    const ids = new Set(group.map((r) => r.clubId));
    const between = fixtures.filter((f) => ids.has(f.homeId) && ids.has(f.awayId));
    source = tallyRows([...ids], between, rules);
  }
  const valueOf = (row: TableRow): number => criterionValue(criterion, source?.get(row.clubId) ?? row);

  const sorted = [...group].sort((a, b) => valueOf(b) - valueOf(a));
  const result: TableRow[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && valueOf(sorted[j] as TableRow) === valueOf(sorted[i] as TableRow)) j++;
    result.push(...rankGroup(sorted.slice(i, j), rest, fixtures, rules, nameOf));
    i = j;
  }
  return result;
}

export function computeTable(
  clubIds: readonly Id[],
  fixtures: readonly Fixture[],
  rules: LeagueRules,
  nameOf: (id: Id) => string = (id) => id,
): TableRow[] {
  const rows = tallyRows(clubIds, fixtures, rules);
  return rankGroup([...rows.values()], rules.tieBreakers, fixtures, rules, nameOf);
}
