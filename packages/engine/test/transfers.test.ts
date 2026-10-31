import { describe, expect, it } from 'vitest';
import { advanceDay, createGame, takeJob } from '../src/game.ts';
import { currentSeasonOf, squadOf } from '../src/queries.ts';
import { deserializeGame, serializeGame } from '../src/save.ts';
import {
  agreedMoveFor, answerIncomingBid, askingPrice, availableBudget, contractEnd, financesOf, makeBid, offerContract,
  offerLoanOut, openWindow, preContractAllowed, renewContract, requestLoan, sellerBlocks, setTransferListed, wageDemand,
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
  it('opens on 1 July and in January only', () => {
    expect(openWindow('2026-06-20')).toBeNull();
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
  it('goes bid → answer → personal terms → joins on 1 July', () => {
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
    // Agreed in June: the player stays put until the window opens, but the money is spoken for.
    expect(bid.status).toBe('agreed');
    expect(bid.moveOn).toBe('2026-07-01');
    expect(target.clubId).not.toBe(clubId);
    expect(availableBudget(state, clubId)).toBe(budgetBefore - bid.fee);
    until(state, '2026-07-01');
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

  it('lets deals be agreed outside a window, completing when the next one opens', () => {
    const { state, clubId } = newCareer('closed');
    until(state, '2026-10-01');
    const target = Object.values(state.world.players)
      .filter((p) => p.clubId && p.clubId !== clubId && state.world.clubs[p.clubId]!.reputation < 60 && !p.loan)
      .filter((p) => sellerBlocks(state, p, clubId, askingPrice(state, p)) === null && squadOf(state, p.clubId!).length > 19)
      .sort((a, b) => b.ca - a.ca)[3]!;
    expect(makeBid(state, target.id, askingPrice(state, target) * 1.2).ok).toBe(true);
    until(state, '2026-10-04');
    const bid = state.transfers.bids.find((b) => b.playerId === target.id)!;
    expect(bid.status).toBe('accepted');
    expect(offerContract(state, target.id, { wage: wageDemand(state, target, clubId), years: 3 }).ok).toBe(true);
    expect(bid.moveOn).toBe('2027-01-01');
    until(state, '2027-01-02');
    expect(target.clubId).toBe(clubId);
  });

  it('allows pre-contracts from January for players whose deals end in June', () => {
    const { state, clubId } = newCareer('precontract');
    until(state, '2027-02-10');
    const target = Object.values(state.world.players).find(
      (p) => p.clubId && p.clubId !== clubId && !p.loan && state.world.clubs[p.clubId]!.reputation < 70,
    )!;
    target.contract!.expires = '2027-06-30';
    expect(preContractAllowed(state, target)).toBe(true);
    const r = offerContract(state, target.id, { wage: wageDemand(state, target, clubId), years: 3 });
    expect(r.ok).toBe(true);
    expect(agreedMoveFor(state, target.id)?.moveOn).toBe('2027-07-01');
    until(state, '2027-07-02');
    expect(target.clubId).toBe(clubId);
    expect(state.transfers.history.some((h) => h.playerId === target.id && h.fee === 0 && h.toId === clubId)).toBe(true);
  });
});

describe('loans', () => {
  it('borrows a fringe player for the season, then sends them back', () => {
    const { state, clubId } = newCareer('loan-in');
    until(state, '2026-07-02');
    // A young squad player at a big club who would get games with a smaller one.
    const target = Object.values(state.world.players)
      .filter((p) => p.clubId && p.clubId !== clubId && !p.loan && (p.positions.GK ?? 0) < 18)
      .find((p) => {
        const squad = squadOf(state, p.clubId!).sort((a, b) => b.ca - a.ca);
        return squad.indexOf(p) >= 19 && squad.length >= 22;
      })!;
    const parent = target.clubId;
    expect(requestLoan(state, target.id, 'season').ok).toBe(true);
    until(state, '2026-07-05');
    const bid = state.transfers.bids.find((b) => b.playerId === target.id && b.kind === 'loan')!;
    if (bid.status === 'rejected') return; // a club may still say no; the rules are covered below
    expect(target.clubId).toBe(clubId);
    expect(target.loan?.fromId).toBe(parent);
    // Can't be bought from the borrowing club.
    expect(sellerBlocks(state, target, 'someone', 1e9)).toMatch(/loan/);
    until(state, '2027-07-02');
    expect(target.loan ?? null).toBeNull();
    expect([parent, null]).toContain(target.clubId);
  });

  it('sends one of your players out on loan', () => {
    const { state, clubId } = newCareer('loan-out');
    until(state, '2026-07-02');
    const squad = squadOf(state, clubId).filter((p) => (p.positions.GK ?? 0) < 18).sort((a, b) => a.ca - b.ca);
    const youngster = squad[0]!;
    const r = offerLoanOut(state, youngster.id, 'january');
    expect(r.ok).toBe(true);
    until(state, '2026-07-05');
    expect(youngster.clubId).not.toBe(clubId);
    expect(youngster.loan).toMatchObject({ fromId: clubId, until: '2026-12-31' });
    until(state, '2027-01-02');
    expect(youngster.clubId).toBe(clubId);
  });

  it('has computer clubs loan out prospects', () => {
    const state = createGame({ seed: 'ai-loans', managerName: 'Test' });
    until(state, '2026-09-02');
    expect(state.transfers.history.filter((h) => h.kind === 'loan').length).toBeGreaterThan(5);
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
