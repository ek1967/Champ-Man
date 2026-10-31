import { describe, expect, it } from 'vitest';
import { advanceDay, createGame, takeJob } from '../src/game.ts';
import { currentSeasonOf, squadOf } from '../src/queries.ts';
import { deserializeGame, serializeGame } from '../src/save.ts';
import {
  answerIncomingBid, askingPrice, contractEnd, financesOf, makeBid, offerContract, openWindow, renewContract,
  setTransferListed, wageDemand,
} from '../src/transfers.ts';
import type { GameState } from '../src/types.ts';
import { DEMO_TOP_DIVISION } from '../src/worldgen.ts';

function newCareer(seed: string): { state: GameState; clubId: string } {
  const state = createGame({ seed, managerName: 'Test' });
  const clubs = currentSeasonOf(state, DEMO_TOP_DIVISION)!.clubIds;
  const clubId = [...clubs].sort((a, b) => state.world.clubs[b]!.reputation - state.world.clubs[a]!.reputation)[0]!;
  takeJob(state, clubId);
  return { state, clubId };
}

function until(state: GameState, date: string): void {
  while (state.date < date) advanceDay(state);
}

describe('transfer windows and contracts', () => {
  it('opens in summer and January only', () => {
    expect(openWindow('2026-07-01')?.name).toBe('summer');
    expect(openWindow('2027-01-15')?.name).toBe('January');
    expect(openWindow('2026-10-01')).toBeNull();
  });

  it('counts contract years by season', () => {
    expect(contractEnd('2026-08-10', 3)).toBe('2029-06-30');
    expect(contractEnd('2026-06-20', 1)).toBe('2027-06-30');
    expect(contractEnd('2027-01-10', 2)).toBe('2028-06-30');
  });
});

describe('buying a player', () => {
  it('goes bid → answer → personal terms → signed', () => {
    const { state, clubId } = newCareer('buy');
    // A decent player at a smaller club, not one of their key men.
    const target = Object.values(state.world.players)
      .filter((p) => p.clubId && p.clubId !== clubId && state.world.clubs[p.clubId]!.reputation < 60)
      .sort((a, b) => b.ca - a.ca)[8]!;
    const fee = askingPrice(state, target);
    expect(makeBid(state, target.id, fee).ok).toBe(true);
    expect(makeBid(state, target.id, fee).ok).toBe(false); // still waiting
    advanceDay(state);
    advanceDay(state);
    const bid = state.transfers.bids.find((b) => b.playerId === target.id)!;
    expect(bid.status).toBe('accepted');
    expect(state.news.some((n) => n.bidId === bid.id)).toBe(true);
    const budgetBefore = financesOf(state, clubId).transferBudget;
    const low = offerContract(state, target.id, { wage: 100, years: 3 });
    expect(low.ok).toBe(false);
    const signed = offerContract(state, target.id, { wage: wageDemand(state, target, clubId), years: 3 });
    expect(signed.ok).toBe(true);
    expect(target.clubId).toBe(clubId);
    expect(financesOf(state, clubId).transferBudget).toBe(budgetBefore - bid.fee);
    expect(bid.status).toBe('completed');
  });

  it('rejects lowball offers and counters near misses', () => {
    const { state, clubId } = newCareer('counter');
    const targets = Object.values(state.world.players).filter((p) => p.clubId && p.clubId !== clubId && state.world.clubs[p.clubId]!.reputation < 60);
    const a = targets[20]!;
    const b = targets[40]!;
    makeBid(state, a.id, Math.round(askingPrice(state, a) * 0.3));
    makeBid(state, b.id, Math.round(askingPrice(state, b) * 0.85));
    advanceDay(state);
    advanceDay(state);
    expect(state.transfers.bids.find((x) => x.playerId === a.id)!.status).toBe('rejected');
    const counter = state.transfers.bids.find((x) => x.playerId === b.id)!;
    expect(['countered', 'rejected']).toContain(counter.status);
    if (counter.status === 'countered') expect(counter.asking).toBeGreaterThan(counter.fee);
  });

  it('refuses bids outside the window', () => {
    const { state, clubId } = newCareer('closed');
    until(state, '2026-10-01');
    const target = Object.values(state.world.players).find((p) => p.clubId && p.clubId !== clubId)!;
    expect(makeBid(state, target.id, 1_000_000).ok).toBe(false);
  });
});

describe('selling and renewing', () => {
  it('lets the manager accept an offer for a listed player', () => {
    const { state, clubId } = newCareer('sell');
    for (const p of squadOf(state, clubId)) setTransferListed(state, p.id, true);
    let incoming;
    for (let i = 0; i < 80 && !incoming; i++) {
      advanceDay(state);
      incoming = state.transfers.bids.find((b) => b.sellerId === clubId && b.status === 'pending');
    }
    expect(incoming).toBeDefined();
    const player = state.world.players[incoming!.playerId]!;
    const before = financesOf(state, clubId).transferBudget;
    expect(answerIncomingBid(state, incoming!.id, true).ok).toBe(true);
    expect(player.clubId).toBe(incoming!.buyerId);
    expect(financesOf(state, clubId).transferBudget).toBe(before + incoming!.fee);
  });

  it('renews contracts at the right wage, and lets unrenewed players go in July', () => {
    const { state, clubId } = newCareer('renew');
    const squad = squadOf(state, clubId);
    const keep = squad[3]!;
    const leave = squad[4]!;
    keep.contract!.expires = '2027-06-30';
    leave.contract!.expires = '2027-06-30';
    expect(renewContract(state, keep.id, { wage: 10, years: 3 }).ok).toBe(false);
    expect(renewContract(state, keep.id, { wage: wageDemand(state, keep, clubId), years: 3 }).ok).toBe(true);
    until(state, '2027-07-02');
    expect(keep.clubId).toBe(clubId);
    expect(leave.clubId).toBeNull();
  });
});

describe('the market over a season', () => {
  it('keeps squads playable, budgets non-negative and every player in one place', () => {
    const state = createGame({ seed: 'market', managerName: 'Test' });
    until(state, '2027-07-20');
    const deals = state.transfers.history.filter((r) => r.kind === 'transfer');
    expect(deals.length).toBeGreaterThan(20);
    for (const club of Object.values(state.world.clubs)) {
      const squad = squadOf(state, club.id);
      expect(squad.length).toBeGreaterThanOrEqual(16);
      expect(squad.length).toBeLessThanOrEqual(31);
      expect(financesOf(state, club.id).transferBudget).toBeGreaterThanOrEqual(0);
    }
    // Nobody is sold on within ten months of a move.
    const moves = new Map<string, string[]>();
    for (const r of deals) moves.set(r.playerId, [...(moves.get(r.playerId) ?? []), r.date]);
    for (const dates of moves.values()) {
      for (let i = 1; i < dates.length; i++) {
        expect(Date.parse(dates[i]!) - Date.parse(dates[i - 1]!)).toBeGreaterThan(300 * 86_400_000);
      }
    }
  });

  it('survives a save and load mid-window', () => {
    const { state } = newCareer('save');
    until(state, '2026-07-20');
    const loaded = deserializeGame(serializeGame(state));
    until(state, '2026-08-20');
    until(loaded, '2026-08-20');
    expect(serializeGame(loaded)).toBe(serializeGame(state));
  });
});
