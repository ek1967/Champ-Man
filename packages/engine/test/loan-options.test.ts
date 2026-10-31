import { describe, expect, it } from 'vitest';
import { advanceDay, createGame, takeJob } from '../src/game.ts';
import { currentSeasonOf, squadOf } from '../src/queries.ts';
import { playersAbroad, scoutCountry, scoutingCountries } from '../src/scouting.ts';
import {
  ABROAD, askingPrice, availableBudget, exerciseLoanOption, financesOf, isFreeAgent, makeBid, offerContract, requestLoan,
  wageDemand,
} from '../src/transfers.ts';
import type { GameState, Player } from '../src/types.ts';
import { DEMO_TOP_DIVISION } from '../src/worldgen.ts';

function newCareer(seed: string, rank = 0): { state: GameState; clubId: string } {
  const state = createGame({ seed, managerName: 'Test' });
  const clubs = currentSeasonOf(state, DEMO_TOP_DIVISION)!.clubIds;
  const clubId = [...clubs].sort((a, b) => state.world.clubs[b]!.reputation - state.world.clubs[a]!.reputation)[rank]!;
  takeJob(state, clubId);
  return { state, clubId };
}

function until(state: GameState, date: string): void {
  while (state.date < date) advanceDay(state);
}

/** A first-team player at a smaller club in the same league, who'd still play for the manager. */
function target(state: GameState, clubId: string): Player {
  const clubs = currentSeasonOf(state, DEMO_TOP_DIVISION)!.clubIds.filter((id) => id !== clubId);
  const smaller = clubs.filter((id) => state.world.clubs[id]!.reputation < state.world.clubs[clubId]!.reputation);
  const myBest = squadOf(state, clubId).map((p) => p.ca).sort((a, b) => b - a);
  for (const id of smaller) {
    const squad = squadOf(state, id).sort((a, b) => b.ca - a.ca);
    // Not one of their five best (they won't sell those to a smaller club), but good enough to play for us.
    const p = squad.slice(5, 14).find((x) => x.ca > (myBest[16] ?? 0) && (x.positions.GK ?? 0) < 18);
    if (p) return p;
  }
  throw new Error('no target');
}

describe('loans with an option to buy', () => {
  it('turns down a first-team player on loan unless an option at a fair price comes with it', () => {
    const { state, clubId } = newCareer('option', 2);
    until(state, '2026-07-02');
    const player = target(state, clubId);
    const asking = askingPrice(state, player);

    expect(requestLoan(state, player.id, 'season').ok).toBe(true);
    until(state, '2026-07-06');
    expect(player.clubId).not.toBe(clubId);

    expect(requestLoan(state, player.id, 'season', { fee: Math.round(asking * 0.5), obligatory: false }).ok).toBe(true);
    until(state, '2026-07-10');
    expect(player.clubId).not.toBe(clubId);

    expect(requestLoan(state, player.id, 'season', { fee: Math.round(asking * 1.15), obligatory: false }).ok).toBe(true);
    until(state, '2026-07-14');
    expect(player.clubId).toBe(clubId);
    expect(player.loan?.option?.fee).toBe(Math.round(asking * 1.15));
  });

  it('lets the manager exercise the option during the loan', () => {
    const { state, clubId } = newCareer('option-buy', 2);
    until(state, '2026-07-02');
    const player = target(state, clubId);
    const parent = player.clubId!;
    const fee = Math.round(askingPrice(state, player) * 1.2);
    requestLoan(state, player.id, 'season', { fee, obligatory: false });
    until(state, '2026-07-06');
    expect(player.loan?.fromId).toBe(parent);

    until(state, '2026-10-01');
    const budget = financesOf(state, clubId).transferBudget;
    const parentBudget = financesOf(state, parent).transferBudget;
    expect(exerciseLoanOption(state, player.id).ok).toBe(true);
    expect(player.clubId).toBe(clubId);
    expect(player.loan).toBeNull();
    expect(financesOf(state, clubId).transferBudget).toBe(budget - fee);
    expect(financesOf(state, parent).transferBudget).toBe(parentBudget + fee);
    until(state, '2027-07-05');
    expect(player.clubId).toBe(clubId);
  });

  it('completes an obligation when the loan ends, and counts it against the budget meanwhile', () => {
    const { state, clubId } = newCareer('obligation', 2);
    until(state, '2026-07-02');
    const player = target(state, clubId);
    const fee = Math.round(askingPrice(state, player) * 0.95);
    requestLoan(state, player.id, 'january', { fee, obligatory: true });
    until(state, '2026-07-06');
    expect(player.loan?.option?.obligatory).toBe(true);
    expect(availableBudget(state, clubId)).toBe(financesOf(state, clubId).transferBudget - fee);
    until(state, '2027-01-02');
    expect(player.clubId).toBe(clubId);
    expect(player.loan).toBeNull();
    expect(state.transfers.history.some((r) => r.playerId === player.id && r.kind === 'transfer' && r.fee === fee)).toBe(true);
  });
});

describe('scouting abroad', () => {
  it('finds players in another country who can be bought and arrive when the window opens', () => {
    const { state, clubId } = newCareer('abroad');
    expect(scoutingCountries(state).map((c) => c.id)).toContain('esp');
    expect(scoutCountry(state, 'esp').ok).toBe(true);
    until(state, '2026-06-30');
    const found = playersAbroad(state);
    expect(found.length).toBe(5);
    for (const p of found) {
      expect(p.clubId).toBeNull();
      expect(p.nationId).toBe('esp');
      expect(isFreeAgent(p)).toBe(false);
    }

    const player = found[0]!;
    const asking = askingPrice(state, player);
    expect(makeBid(state, player.id, asking).ok).toBe(true);
    until(state, '2026-07-04');
    const bid = state.transfers.bids.find((b) => b.playerId === player.id)!;
    expect(bid.sellerId).toBe(ABROAD);
    expect(bid.status).toBe('accepted');
    const budget = financesOf(state, clubId).transferBudget;
    expect(offerContract(state, player.id, { wage: wageDemand(state, player, clubId), years: 3 }).ok).toBe(true);
    expect(player.clubId).toBe(clubId);
    expect(player.abroad).toBeNull();
    expect(financesOf(state, clubId).transferBudget).toBe(budget - asking);
    expect(state.transfers.history.at(-1)?.kind).toBe('import');
  });

  it("keeps players abroad out of computer clubs' reach, and lets the trail go cold", () => {
    const { state } = newCareer('abroad-cold');
    scoutCountry(state, 'bra');
    until(state, '2026-07-01');
    const found = playersAbroad(state);
    expect(found).toHaveLength(5);
    until(state, '2026-11-05');
    for (const p of found) {
      expect(p.clubId).toBeNull();
      expect(p.retired).toBe(true);
    }
    expect(playersAbroad(state)).toHaveLength(0);
  });
});
