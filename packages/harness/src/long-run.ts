/**
 * Long-run stability check (PLAN §10, Phase 8): simulate many seasons and watch for ability
 * inflation or deflation, shrinking squads and ageing leagues.
 *   node packages/harness/src/long-run.ts [seasons] [--demo] [--check] [--scotland] [--league sco-1]
 * --scotland adds the Scotland pack to the England one; --league picks the league to report on;
 * --seed runs a different world (the demo world) or different events.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  advanceDay, ageOn, createGame, type GameState, mergePacks, seasonFixtures, seasonsOf, seasonTable, squadOf, type WorldPack,
} from '@moc/engine';

const seasons = Number(process.argv[2] ?? 10);
const demo = process.argv.includes('--demo');
const check = process.argv.includes('--check');
const loadPack = (id: string) => JSON.parse(readFileSync(join(import.meta.dirname, `../../../data/packs/${id}.json`), 'utf8')) as WorldPack;
const pack = demo
  ? undefined
  : mergePacks(['england-2026-27', ...(process.argv.includes('--scotland') ? ['scotland-2026-27'] : [])].map(loadPack));
const seedArg = process.argv.indexOf('--seed');
const state: GameState = createGame({ seed: seedArg >= 0 ? process.argv[seedArg + 1]! : 'long-run', managerName: 'Harness', pack });
const leagueArg = process.argv[process.argv.indexOf('--league') + 1];
const top = (process.argv.includes('--league') && leagueArg ? state.world.competitions[leagueArg] : undefined)
  ?? Object.values(state.world.competitions).find((c) => c.tier === 1 && c.mode === 'playable')!;

interface Snapshot { year: number; xi: number; elite: number; active: number; age: number; minSquad: number; maxSquad: number; free: number; retired: number; youth: number; goals: number; champion: string; wonderkids: number }
const snapshots: Snapshot[] = [];

function snapshot(year: number): Snapshot {
  const clubs = Object.values(state.world.clubs).filter((c) => c.leagueId === top.id);
  const xis = clubs.map((c) => {
    const best = squadOf(state, c.id).map((p) => p.ca).sort((a, b) => b - a).slice(0, 11);
    return best.reduce((a, b) => a + b, 0) / Math.max(1, best.length);
  });
  const active = Object.values(state.world.players).filter((p) => !p.retired);
  const contracted = active.filter((p) => p.clubId);
  const plPlayers = contracted.filter((p) => clubs.some((c) => c.id === p.clubId));
  const sizes = Object.values(state.world.clubs).map((c) => squadOf(state, c.id).length);
  const season = seasonsOf(state, top.id).find((s) => s.label.startsWith(String(year - 1)));
  const fixtures = season ? seasonFixtures(state, season).filter((f) => f.result) : [];
  const goals = fixtures.reduce((s, f) => s + f.result!.homeGoals + f.result!.awayGoals, 0) / Math.max(1, fixtures.length);
  const table = season ? seasonTable(state, season) : [];
  return {
    year,
    xi: xis.reduce((a, b) => a + b, 0) / xis.length,
    elite: contracted.map((p) => p.ca).sort((a, b) => b - a).slice(0, 20).reduce((a, b) => a + b, 0) / 20,
    active: contracted.length,
    age: plPlayers.reduce((s, p) => s + ageOn(p.dateOfBirth, state.date), 0) / Math.max(1, plPlayers.length),
    minSquad: Math.min(...sizes),
    maxSquad: Math.max(...sizes),
    free: active.filter((p) => !p.clubId).length,
    retired: Object.values(state.world.players).filter((p) => p.retired).length,
    youth: Object.values(state.world.players).filter((p) => p.id.startsWith('y')).length,
    goals,
    champion: table[0] ? state.world.clubs[table[0].clubId]!.shortName : '-',
    wonderkids: contracted.filter((p) => ageOn(p.dateOfBirth, state.date) <= 21 && p.ca >= 150).length,
  };
}

const started = performance.now();
for (let i = 0; i <= seasons; i++) {
  const year = 2026 + i;
  while (state.date < `${year}-07-15`) advanceDay(state);
  snapshots.push(snapshot(year));
}
console.log(`${seasons} seasons in ${((performance.now() - started) / 1000).toFixed(0)}s\n`);
console.log('year  avg XI  top-20  players  PL age  squads   free  retired  youth  ≤21 & 150+  goals  champion');
for (const s of snapshots) {
  console.log(`${s.year}  ${s.xi.toFixed(1).padStart(6)}  ${s.elite.toFixed(1).padStart(6)}  ${String(s.active).padStart(7)}  ${s.age.toFixed(1).padStart(6)}  ${`${s.minSquad}-${s.maxSquad}`.padStart(6)}  ${String(s.free).padStart(5)}  ${String(s.retired).padStart(7)}  ${String(s.youth).padStart(5)}  ${String(s.wonderkids).padStart(10)}  ${s.goals.toFixed(2).padStart(5)}  ${s.champion}`);
}

const first = snapshots[0]!;
const last = snapshots[snapshots.length - 1]!;
// Some settling-in is expected (the starting data is compressed at the top); what must not happen
// is a trend that keeps going. So: bounded overall, and nearly flat over the last three seasons.
const recent = snapshots[Math.max(0, snapshots.length - 4)]!;
const years = Math.max(1, last.year - recent.year);
const problems: string[] = [];
if (Math.abs(last.xi - first.xi) > 8) problems.push(`average XI drifted ${first.xi.toFixed(1)} → ${last.xi.toFixed(1)}`);
if (Math.abs(last.elite - first.elite) > 12) problems.push(`top-20 ability drifted ${first.elite.toFixed(1)} → ${last.elite.toFixed(1)}`);
if (Math.abs(last.xi - recent.xi) / years > 1.2) problems.push(`average XI still moving ${((last.xi - recent.xi) / years).toFixed(1)} a season`);
if (Math.abs(last.elite - recent.elite) / years > 1.2) problems.push(`top-20 still moving ${((last.elite - recent.elite) / years).toFixed(1)} a season`);
if (snapshots.slice(1).some((s) => s.goals > 3.4 || s.goals < 2.3)) problems.push('goals per game outside 2.3–3.4 in some season');
if (last.minSquad < 18) problems.push(`smallest squad ${last.minSquad}`);
if (last.age < 23 || last.age > 29) problems.push(`average age ${last.age.toFixed(1)}`);
console.log(problems.length === 0 ? '\nStable.' : `\nProblems:\n- ${problems.join('\n- ')}`);
if (check && problems.length > 0) process.exit(1);
