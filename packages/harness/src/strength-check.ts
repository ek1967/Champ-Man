/** Diagnostic: how often do strong sides beat weak ones? node packages/harness/src/strength-check.ts [seasons] */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { advanceDay, autoTactics, createGame, FORMATIONS, positionRating, seasonFixtures, seasonsOf, squadOf, type WorldPack } from '@moc/engine';
const seasons = Number(process.argv[2] ?? 6);
const pack = JSON.parse(readFileSync(join(import.meta.dirname, '../../../data/packs/england-2026-27.json'), 'utf8')) as WorldPack;
const base = createGame({ seed: 'x', managerName: 'x', pack });
const pl = Object.values(base.world.clubs).filter((c) => c.leagueId === 'eng-1');
const strength = new Map(pl.map((c) => {
  const squad = squadOf(base, c.id);
  const t = autoTactics(squad, '2026-08-20');
  return [c.id, t.lineup.reduce((s, id, i) => s + positionRating(squad.find((p) => p.id === id)!, FORMATIONS[t.formation][i]!.position), 0) / 11] as const;
}));
const ranked = [...pl].sort((a, b) => strength.get(b.id)! - strength.get(a.id)!).map((c) => c.id);
const top = new Set(ranked.slice(0, 4));
const bottom = new Set(ranked.slice(-6));
const r: { home: [number, number, number]; away: [number, number, number]; goalsFor: number; goalsAgainst: number; n: number } = {
  home: [0, 0, 0], away: [0, 0, 0], goalsFor: 0, goalsAgainst: 0, n: 0,
};
for (let i = 0; i < seasons; i++) {
  const s = createGame({ seed: `sc-${i}`, managerName: 'x', pack });
  while (s.date < '2027-06-01') advanceDay(s);
  for (const f of seasonFixtures(s, seasonsOf(s, 'eng-1').find((x) => x.label === '2026-27')!)) {
    const res = f.result!;
    if (top.has(f.homeId) && bottom.has(f.awayId)) {
      r.home[res.homeGoals > res.awayGoals ? 0 : res.homeGoals === res.awayGoals ? 1 : 2]++;
      r.goalsFor += res.homeGoals; r.goalsAgainst += res.awayGoals; r.n++;
    } else if (top.has(f.awayId) && bottom.has(f.homeId)) {
      r.away[res.awayGoals > res.homeGoals ? 0 : res.homeGoals === res.awayGoals ? 1 : 2]++;
      r.goalsFor += res.awayGoals; r.goalsAgainst += res.homeGoals; r.n++;
    }
  }
}
const pct = (a: number[]) => { const t = a[0]! + a[1]! + a[2]!; return a.map((x) => `${((x / t) * 100).toFixed(0)}%`).join(' / '); };
console.log(`Top 4 v bottom 6 (${r.n} matches): home W/D/L ${pct(r.home)} · away W/D/L ${pct(r.away)} · goals ${(r.goalsFor / r.n).toFixed(2)}-${(r.goalsAgainst / r.n).toFixed(2)}`);
