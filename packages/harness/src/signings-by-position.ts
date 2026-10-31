/** Diagnostic: which positions computer clubs sign, and how keepers age, over N seasons. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { advanceDay, ageOn, createGame, mainPosition, squadOf, type WorldPack } from '@moc/engine';
const pack = JSON.parse(readFileSync(join(import.meta.dirname, '../../../data/packs/england-2026-27.json'), 'utf8')) as WorldPack;
const state = createGame({ seed: process.argv[3] ?? 'long-run', managerName: 'x', pack });
const years = Number(process.argv[2] ?? 6);
while (state.date < `${2026 + years}-07-15`) advanceDay(state);
const counts: Record<string, number> = {};
for (const r of state.transfers.history) {
  if (r.kind !== 'transfer' && r.kind !== 'import') continue;
  const pos = mainPosition(state.world.players[r.playerId]!);
  counts[pos] = (counts[pos] ?? 0) + 1;
}
console.log('signings by position', counts);
const keepers = Object.values(state.world.clubs).filter((c) => c.leagueId === 'eng-1').map((c) => {
  const gks = squadOf(state, c.id).filter((p) => mainPosition(p) === 'GK').sort((a, b) => b.ca - a.ca);
  return `${c.shortName}: ${gks.map((g) => `${g.ca}/${ageOn(g.dateOfBirth, state.date)}`).join(' ')}`;
});
console.log(keepers.join('\n'));
