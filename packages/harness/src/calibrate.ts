/**
 * Calibration harness (PLAN §7.2, §11): simulates many demo seasons headlessly and checks the
 * results look like real football. Run `npm run calibrate` for a report, add `--check` to fail
 * when a metric is out of range (used in CI), and `--seasons N` to change the sample size.
 */
import {
  advanceDay, createGame, DEMO_TOP_DIVISION, type GameState, seasonFixtures, seasonTable, seasonsOf, topScorers,
} from '@moc/engine';

interface Metric {
  label: string;
  value: number;
  min: number;
  max: number;
  format: (v: number) => string;
}

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
const num = (v: number): string => v.toFixed(2);
const int = (v: number): string => v.toFixed(1);

function argValue(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  const raw = index >= 0 ? process.argv[index + 1] : undefined;
  return raw ? Number(raw) : fallback;
}

const seasonCount = argValue('--seasons', 40);
const check = process.argv.includes('--check');

let matches = 0;
let goals = 0;
let homeWins = 0;
let draws = 0;
let goallessDraws = 0;
let championPoints = 0;
let bottomPoints = 0;
let pointsSpread = 0;
let topScorerGoals = 0;
let mostLikelyChampionWins = 0;
let favouriteRelegated = 0;
const started = performance.now();

for (let i = 0; i < seasonCount; i++) {
  const state: GameState = createGame({ seed: `calibrate-${i}`, managerName: 'Harness' });
  while (state.date < '2027-06-01') advanceDay(state);
  const season = seasonsOf(state, DEMO_TOP_DIVISION).find((s) => s.label === '2026-27');
  if (!season) throw new Error('Season missing');

  for (const fixture of seasonFixtures(state, season)) {
    const r = fixture.result;
    if (!r) throw new Error(`Unplayed fixture ${fixture.id}`);
    matches++;
    goals += r.homeGoals + r.awayGoals;
    if (r.homeGoals > r.awayGoals) homeWins++;
    else if (r.homeGoals === r.awayGoals) {
      draws++;
      if (r.homeGoals === 0) goallessDraws++;
    }
  }

  const table = seasonTable(state, season);
  const points = table.map((row) => row.points);
  championPoints += points[0] ?? 0;
  bottomPoints += points[points.length - 1] ?? 0;
  pointsSpread += (points[0] ?? 0) - (points[points.length - 1] ?? 0);
  topScorerGoals += topScorers(state, season, 1)[0]?.goals ?? 0;

  // How predictable is the title? Compare with the club that had the biggest reputation.
  const byReputation = [...season.clubIds].sort(
    (a, b) => (state.world.clubs[b]?.reputation ?? 0) - (state.world.clubs[a]?.reputation ?? 0),
  );
  if (table[0]?.clubId === byReputation[0]) mostLikelyChampionWins++;
  const relegated = table.slice(-3).map((r) => r.clubId);
  if (byReputation.slice(0, 10).some((id) => relegated.includes(id))) favouriteRelegated++;
}

const metrics: Metric[] = [
  { label: 'Goals per game', value: goals / matches, min: 2.5, max: 3.0, format: num },
  { label: 'Home wins', value: homeWins / matches, min: 0.41, max: 0.49, format: pct },
  { label: 'Draws', value: draws / matches, min: 0.21, max: 0.29, format: pct },
  { label: 'Away wins', value: (matches - homeWins - draws) / matches, min: 0.26, max: 0.34, format: pct },
  { label: '0-0 draws', value: goallessDraws / matches, min: 0.05, max: 0.1, format: pct },
  { label: 'Champions points', value: championPoints / seasonCount, min: 80, max: 98, format: int },
  { label: 'Bottom club points', value: bottomPoints / seasonCount, min: 15, max: 35, format: int },
  { label: 'Points spread (1st-20th)', value: pointsSpread / seasonCount, min: 50, max: 78, format: int },
  { label: 'Top scorer goals', value: topScorerGoals / seasonCount, min: 20, max: 34, format: int },
  { label: 'Biggest club wins title', value: mostLikelyChampionWins / seasonCount, min: 0.25, max: 0.7, format: pct },
  { label: 'Top-half club relegated', value: favouriteRelegated / seasonCount, min: 0, max: 0.25, format: pct },
];

const elapsed = (performance.now() - started) / 1000;
console.log(`Calibration: ${seasonCount} seasons, ${matches} matches, ${elapsed.toFixed(1)}s\n`);
let failures = 0;
for (const m of metrics) {
  const ok = m.value >= m.min && m.value <= m.max;
  if (!ok) failures++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${m.label.padEnd(26)} ${m.format(m.value).padStart(7)}   target ${m.format(m.min)}–${m.format(m.max)}`,
  );
}
console.log(`\n${failures === 0 ? 'All metrics in range.' : `${failures} metric(s) out of range.`}`);
if (check && failures > 0) process.exit(1);
