/**
 * Diagnostic: how strong does the engine think each club is, and where do they finish?
 *   node packages/harness/src/club-report.ts [seasons] [clubId]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  abilityStars, advanceDay, autoTactics, createGame, FORMATIONS, positionRating, positionStars, seasonsOf,
  seasonTable, shortName, squadOf, type WorldPack,
} from '@moc/engine';

const seasons = Number(process.argv[2] ?? 6);
const focus = process.argv[3] ?? 'liverpool';
const pack = JSON.parse(readFileSync(join(import.meta.dirname, '../../../data/packs/england-2026-27.json'), 'utf8')) as WorldPack;

const base = createGame({ seed: 'report', managerName: 'x', pack });
const pl = Object.values(base.world.clubs).filter((c) => c.leagueId === 'eng-1');
const strength = new Map<string, number>();
for (const club of pl) {
  const squad = squadOf(base, club.id);
  const t = autoTactics(squad, '2026-08-20');
  const slots = FORMATIONS[t.formation];
  const xi = t.lineup.map((id, i) => ({ p: squad.find((x) => x.id === id)!, pos: slots[i]!.position }));
  strength.set(club.id, xi.reduce((s, x) => s + positionRating(x.p, x.pos), 0) / 11);
  if (club.id === focus) {
    console.log(`${club.name} best XI (${t.formation}):`);
    for (const { p, pos } of xi) console.log(`  ${pos.padEnd(4)} ${shortName(p).padEnd(22)} CA ${p.ca}  ${abilityStars(p.ca)}★  in role ${positionStars(p, pos)}★  natural ${Object.entries(p.positions).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0]}`);
  }
}

const points = new Map<string, number[]>();
for (let i = 0; i < seasons; i++) {
  const s = createGame({ seed: `report-${i}`, managerName: 'x', pack });
  while (s.date < '2027-06-01') advanceDay(s);
  const season = seasonsOf(s, 'eng-1').find((x) => x.label === '2026-27')!;
  seasonTable(s, season).forEach((r, pos) => points.set(r.clubId, [...(points.get(r.clubId) ?? []), r.points, pos + 1]));
}
console.log(`\nClub                      XI strength  rep  avg pts  avg pos  (${seasons} seasons)`);
for (const club of [...pl].sort((a, b) => (strength.get(b.id) ?? 0) - (strength.get(a.id) ?? 0))) {
  const v = points.get(club.id) ?? [];
  const pts = v.filter((_, i) => i % 2 === 0);
  const pos = v.filter((_, i) => i % 2 === 1);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  console.log(`${club.name.padEnd(26)}${(strength.get(club.id) ?? 0).toFixed(1).padStart(8)}  ${String(club.reputation).padStart(5)}  ${mean(pts).toFixed(1).padStart(7)}  ${mean(pos).toFixed(1).padStart(7)}`);
}
