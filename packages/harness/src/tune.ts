/**
 * Quick match-engine tuning loop on the real Premier League pack:
 *   node packages/harness/src/tune.ts '{"xgMedian":0.15}' 6
 * Prints the headline numbers for N seasons with the given MATCH constants overridden.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { advanceDay, createGame, MATCH, seasonFixtures, seasonsOf, seasonTable, topScorers, type WorldPack } from '@moc/engine';

Object.assign(MATCH as Record<string, number>, JSON.parse(process.argv[2] ?? '{}'));
const seasons = Number(process.argv[3] ?? 6);
const packPath = process.argv[4] ?? join(import.meta.dirname, '../../../data/packs/england-2026-27.json');
const pack = JSON.parse(readFileSync(packPath, 'utf8')) as WorldPack;

const acc = { m: 0, g: 0, hw: 0, d: 0, nil: 0, champ: 0, bottom: 0, top: 0, shots: 0, ot: 0, corners: 0, fouls: 0, y: 0, r: 0, sides: 0, poss: 0 };
for (let i = 0; i < seasons; i++) {
  const state = createGame({ seed: `tune-${i}`, managerName: 'Tuner', pack });
  while (state.date < '2027-06-01') advanceDay(state);
  const season = seasonsOf(state, 'eng-1').find((s) => s.label === '2026-27');
  if (!season) throw new Error('No 2026-27 season');
  for (const f of seasonFixtures(state, season)) {
    const r = f.result;
    if (!r?.stats) continue;
    acc.m++;
    acc.g += r.homeGoals + r.awayGoals;
    if (r.homeGoals > r.awayGoals) acc.hw++;
    else if (r.homeGoals === r.awayGoals) {
      acc.d++;
      if (r.homeGoals === 0) acc.nil++;
    }
    for (const t of [r.stats.home, r.stats.away]) {
      acc.sides++;
      acc.shots += t.shots;
      acc.ot += t.onTarget;
      acc.corners += t.corners;
      acc.fouls += t.fouls;
      acc.y += t.yellow;
      acc.r += t.red;
      acc.poss += Math.abs(t.possession - 50);
    }
  }
  const table = seasonTable(state, season);
  acc.champ += table[0]?.points ?? 0;
  acc.bottom += table[table.length - 1]?.points ?? 0;
  acc.top += topScorers(state, season, 1)[0]?.goals ?? 0;
}
const f = (x: number) => x.toFixed(2);
console.log(
  `goals ${f(acc.g / acc.m)} home ${f(acc.hw / acc.m)} draw ${f(acc.d / acc.m)} 0-0 ${f(acc.nil / acc.m)} | ` +
  `champ ${f(acc.champ / seasons)} bottom ${f(acc.bottom / seasons)} top scorer ${f(acc.top / seasons)} | ` +
  `shots ${f(acc.shots / acc.sides)} on target ${f(acc.ot / acc.sides)} corners ${f(acc.corners / acc.sides)} ` +
  `fouls ${f(acc.fouls / acc.sides)} yellows ${f(acc.y / acc.sides)} reds/match ${f((acc.r / acc.sides) * 2)} possession spread ${f(acc.poss / acc.sides)}`,
);
