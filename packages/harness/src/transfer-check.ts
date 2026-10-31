/**
 * Diagnostic: a season of the transfer market.
 *   node packages/harness/src/transfer-check.ts [clubId-to-manage]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { advanceDay, createGame, displayName, formatMoney, squadOf, takeJob, type WorldPack } from '@moc/engine';

const pack = JSON.parse(readFileSync(join(import.meta.dirname, '../../../data/packs/england-2026-27.json'), 'utf8')) as WorldPack;
const state = createGame({ seed: 'transfer-check', managerName: 'Test', pack });
const managed = process.argv[2];
if (managed) takeJob(state, managed);
const t0 = performance.now();
while (state.date < '2027-07-10') advanceDay(state);
const seconds = (performance.now() - t0) / 1000;

const h = state.transfers.history;
const byKind = (k: string) => h.filter((r) => r.kind === k).length;
console.log(`Season simulated in ${seconds.toFixed(1)}s. Transfers ${byKind('transfer')}, free signings ${byKind('free')}, released ${byKind('released')}`);
const summer = h.filter((r) => r.date < '2026-09-02' && r.kind === 'transfer').length;
const january = h.filter((r) => r.date >= '2027-01-01' && r.date <= '2027-02-02' && r.kind === 'transfer').length;
console.log(`Summer window deals ${summer}, January ${january}`);
const top = h.filter((r) => r.kind === 'transfer').sort((a, b) => b.fee - a.fee).slice(0, 10);
for (const r of top) {
  const p = state.world.players[r.playerId]!;
  console.log(`  ${r.date} ${displayName(p).padEnd(24)} ${state.world.clubs[r.fromId!]?.shortName} -> ${state.world.clubs[r.toId!]?.shortName} ${formatMoney(r.fee)} (CA ${p.ca})`);
}
const sizes = Object.values(state.world.clubs).map((c) => squadOf(state, c.id).length);
console.log(`Squad sizes: min ${Math.min(...sizes)}, max ${Math.max(...sizes)}`);
const negative = Object.entries(state.finances).filter(([, f]) => f.transferBudget < 0);
console.log(`Clubs in the red: ${negative.length}`);
const free = Object.values(state.world.players).filter((p) => !p.clubId).length;
console.log(`Free agents at end: ${free}`);
if (managed) {
  console.log(`Bids involving ${managed}: ${state.transfers.bids.filter((b) => b.buyerId === managed || b.sellerId === managed).length}; transfer news items: ${state.news.filter((n) => n.category === 'transfer').length}`);
  console.log(state.news.filter((n) => n.category === 'transfer').slice(0, 6).map((n) => `${n.date} ${n.title}`).join('\n'));
}
