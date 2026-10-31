/** Diagnostic: how do the attributes of Premier League starting XIs drift over the years? */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { advanceDay, autoTactics, createGame, FORMATIONS, POSITION_GROUP, squadOf, type WorldPack } from '@moc/engine';
const pack = JSON.parse(readFileSync(join(import.meta.dirname, '../../../data/packs/england-2026-27.json'), 'utf8')) as WorldPack;
const state = createGame({ seed: process.argv[3] ?? 'drift', managerName: 'x', pack });
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
for (let i = 0; i <= Number(process.argv[2] ?? 6); i++) {
  while (state.date < `${2026 + i}-07-20`) advanceDay(state);
  const g: Record<string, { ca: number[]; gk: number[]; def: number[]; fin: number[]; ctrl: number[]; pace: number[] }> = {};
  for (const c of Object.values(state.world.clubs).filter((c) => c.leagueId === 'eng-1')) {
    const squad = squadOf(state, c.id);
    const t = autoTactics(squad, state.date);
    t.lineup.forEach((id, k) => {
      const p = squad.find((x) => x.id === id)!;
      const grp = POSITION_GROUP[FORMATIONS[t.formation][k]!.position];
      const a = p.attributes;
      const e = (g[grp] ??= { ca: [], gk: [], def: [], fin: [], ctrl: [], pace: [] });
      e.ca.push(p.ca); e.pace.push(a.pace);
      e.gk.push(avg([a.reflexes, a.handling, a.oneOnOnes, a.commandOfArea, a.positioning]));
      e.def.push(avg([a.tackling, a.marking, a.positioning, a.anticipation, a.heading, a.strength, a.bravery]));
      e.fin.push(avg([a.finishing, a.composure, a.movement]));
      e.ctrl.push(avg([a.passing, a.decisions, a.teamwork, a.firstTouch, a.vision]));
    });
  }
  console.log(2026 + i, Object.entries(g).map(([k, v]) => `${k} ca ${avg(v.ca).toFixed(0)} gk ${avg(v.gk).toFixed(1)} def ${avg(v.def).toFixed(1)} fin ${avg(v.fin).toFixed(1)} ctrl ${avg(v.ctrl).toFixed(1)} pace ${avg(v.pace).toFixed(1)}`).join(' | '));
}
