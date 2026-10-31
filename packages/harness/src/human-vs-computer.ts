/**
 * Diagnostic: does a club do worse when the human manages it?
 *   node packages/harness/src/human-vs-computer.ts liverpool 8
 * Plays the same seasons twice: once with the computer managing the club, once "as a human"
 * the way the app does it (saved tactics, match watched live, no substitutions made).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  advanceDay, autoTactics, completeMatch, continueGame, createGame, type GameState, humanFixtureOn, matchContext,
  playFixtures, playToEnd, seasonTable, seasonsOf, squadOf, startMatch, takeJob, type WorldPack,
} from '@moc/engine';

const clubId = process.argv[2] ?? 'liverpool';
const seasons = Number(process.argv[3] ?? 8);
const pack = JSON.parse(readFileSync(join(import.meta.dirname, '../../../data/packs/england-2026-27.json'), 'utf8')) as WorldPack;

function playSeason(seed: string, human: boolean) {
  const state: GameState = createGame({ seed, managerName: 'Test', pack });
  if (human) takeJob(state, clubId);
  const conditions: number[] = [];
  while (state.date < '2027-06-01') {
    if (!human) {
      advanceDay(state);
      continue;
    }
    const fixture = humanFixtureOn(state, state.date);
    if (!fixture) {
      continueGame(state);
      continue;
    }
    {
      // The app's match-day path: the team is saved the first time the manager looks at it.
      state.manager.tactics ??= autoTactics(squadOf(state, clubId), state.date);
      playFixtures(state, state.date, fixture.id);
      const live = startMatch(state, fixture, false);
      const side = live.home.clubId === clubId ? live.home : live.away;
      for (const { id } of side.onPitch) conditions.push(state.world.players[id]?.condition ?? 100);
      playToEnd(matchContext(state), live);
      completeMatch(state, fixture, live);
    }
  }
  const season = seasonsOf(state, 'eng-1').find((s) => s.label === '2026-27');
  const table = season ? seasonTable(state, season) : [];
  const row = table.findIndex((r) => r.clubId === clubId);
  const r = table[row];
  const startCondition = conditions.length ? conditions.reduce((a, b) => a + b, 0) / conditions.length : null;
  return { position: row + 1, points: r?.points ?? 0, gf: r?.goalsFor ?? 0, ga: r?.goalsAgainst ?? 0, startCondition };
}

const totals = { computer: { pts: 0, pos: 0, gf: 0, ga: 0 }, human: { pts: 0, pos: 0, gf: 0, ga: 0, cond: 0 } };
for (let i = 0; i < seasons; i++) {
  const c = playSeason(`hvc-${i}`, false);
  const h = playSeason(`hvc-${i}`, true);
  totals.computer.pts += c.points; totals.computer.pos += c.position; totals.computer.gf += c.gf; totals.computer.ga += c.ga;
  totals.human.pts += h.points; totals.human.pos += h.position; totals.human.gf += h.gf; totals.human.ga += h.ga; totals.human.cond += h.startCondition ?? 0;
  console.log(`season ${i + 1}: computer ${c.points} pts (${c.position}) · human ${h.points} pts (${h.position}), starters' fitness at kick-off ${h.startCondition?.toFixed(0)}%`);
}
const avg = (x: number) => (x / seasons).toFixed(1);
console.log(`\n${clubId}: computer-managed ${avg(totals.computer.pts)} pts, ${avg(totals.computer.pos)} avg pos, goals ${avg(totals.computer.gf)}-${avg(totals.computer.ga)}`);
console.log(`${clubId}: human-managed    ${avg(totals.human.pts)} pts, ${avg(totals.human.pos)} avg pos, goals ${avg(totals.human.gf)}-${avg(totals.human.ga)}, kick-off fitness ${avg(totals.human.cond)}%`);
