import { describe, expect, it } from 'vitest';
import { advanceDay, createGame, takeJob } from '../src/game.ts';
import { currentSeasonOf, squadOf } from '../src/queries.ts';
import {
  answerIncomingBid, askingPrice, financesOf, awaitingManager, counterIncomingBid, makeBid, renewContract, sellerBlocks, sellerMinimum,
  setTransferListed, termsVerdict, wageDemand, wageMinimum,
} from '../src/transfers.ts';
import type { Bid, GameState, Player } from '../src/types.ts';
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

function sellable(state: GameState, clubId: string): Player[] {
  return Object.values(state.world.players)
    .filter((p) => p.clubId && p.clubId !== clubId && state.world.clubs[p.clubId]!.reputation < 60 && !p.loan)
    .filter((p) => sellerBlocks(state, p, clubId, askingPrice(state, p)) === null && squadOf(state, p.clubId!).length > 19)
    .sort((a, b) => b.ca - a.ca);
}

const bidFor = (state: GameState, playerId: string): Bid =>
  state.transfers.bids.filter((b) => b.playerId === playerId).at(-1)!;

describe('haggling over a fee', () => {
  it("counters below the asking price, comes down towards the bid, and settles above the club's real limit", () => {
    const { state, clubId } = newCareer('haggle');
    until(state, '2026-07-02');
    const player = sellable(state, clubId)[5]!;
    const asking = askingPrice(state, player);
    const limit = sellerMinimum(state, player);
    expect(limit).toBeLessThan(asking);

    let offer = Math.round(asking * 0.7);
    makeBid(state, player.id, offer);
    const asks: number[] = [];
    for (let round = 0; round < 6; round++) {
      for (let d = 0; d < 3; d++) advanceDay(state);
      const bid = bidFor(state, player.id);
      if (bid.status !== 'countered') break;
      asks.push(bid.asking!);
      // Each counter is lower than the last, never below the real limit.
      expect(bid.asking!).toBeGreaterThanOrEqual(limit);
      if (asks.length > 1) expect(bid.asking!).toBeLessThanOrEqual(asks.at(-2)!);
      // Meet them halfway, or take their final price.
      offer = bid.note?.includes('final') ? bid.asking! : Math.round((offer + bid.asking!) / 2);
      makeBid(state, player.id, offer);
    }
    expect(asks.length).toBeGreaterThan(0);
    const final = bidFor(state, player.id);
    expect(final.status).toBe('accepted');
    expect(final.fee).toBeLessThan(asking);
    expect(final.fee).toBeGreaterThanOrEqual(limit);
  });

  it('turns down offers far below the price', () => {
    const { state, clubId } = newCareer('lowball');
    const player = sellable(state, clubId)[3]!;
    makeBid(state, player.id, Math.round(askingPrice(state, player) * 0.4));
    until(state, '2026-06-18');
    expect(bidFor(state, player.id).status).toBe('rejected');
  });
});

describe('agreeing wages', () => {
  it('asks for a figure between the offer and the demand, and accepts it', () => {
    const { state, clubId } = newCareer('wages');
    const player = sellable(state, clubId)[2]!;
    const demand = wageDemand(state, player, clubId);
    const minimum = wageMinimum(state, player, clubId, 3);
    expect(minimum).toBeLessThan(demand);
    expect(termsVerdict(state, player, clubId, { wage: minimum, years: 3 }).ok).toBe(true);
    const low = termsVerdict(state, player, clubId, { wage: Math.round(minimum * 0.8), years: 3 });
    expect(low.ok).toBe(false);
    const counter = Number(/€([\d.]+)K/.exec(low.message)![1]) * 1000;
    expect(counter).toBeGreaterThanOrEqual(minimum * 0.99);
    expect(counter).toBeLessThanOrEqual(demand);
    expect(termsVerdict(state, player, clubId, { wage: counter, years: 3 }).ok).toBe(true);
  });

  it('lets your own players stay for a little less than they first ask', () => {
    const { state, clubId } = newCareer('renew');
    const player = squadOf(state, clubId)[4]!;
    const minimum = wageMinimum(state, player, clubId, 3);
    expect(minimum).toBeLessThan(wageDemand(state, player, clubId));
    expect(renewContract(state, player.id, { wage: minimum, years: 3 }).ok).toBe(true);
  });
});

describe('offers for your players', () => {
  it('lets you name your price: the club pays it if it can, or improves its offer, or walks away', () => {
    const { state, clubId } = newCareer('counter-in');
    for (const p of squadOf(state, clubId)) setTransferListed(state, p.id, true);
    let incoming: Bid | undefined;
    for (let i = 0; i < 80 && !incoming; i++) {
      advanceDay(state);
      incoming = state.transfers.bids.find((b) => awaitingManager(state, b) && b.kind !== 'loan');
    }
    expect(incoming).toBeDefined();
    const bid = incoming!;
    expect(bid.limit).toBeGreaterThanOrEqual(bid.fee);
    expect(counterIncomingBid(state, bid.id, bid.fee).ok).toBe(false); // must ask for more
    const canPay = Math.min(bid.limit!, financesOf(state, bid.buyerId).transferBudget);
    const price = canPay > bid.fee ? canPay : bid.fee + 100_000;
    expect(counterIncomingBid(state, bid.id, price).ok).toBe(true);
    expect(bid.status).toBe('countered');
    expect(awaitingManager(state, bid)).toBe(false);
    const opening = bid.fee;
    for (let i = 0; i < 3; i++) advanceDay(state);
    const player = state.world.players[bid.playerId]!;
    expect(['completed', 'agreed', 'pending', 'withdrawn']).toContain(bid.status);
    if (bid.status === 'completed' || bid.status === 'agreed') {
      // They met the price.
      expect(bid.fee).toBe(price);
      if (bid.status === 'completed') expect(player.clubId).toBe(bid.buyerId);
    } else if (bid.status === 'pending') {
      // They came back with a better offer, short of the price.
      expect(bid.fee).toBeGreaterThan(opening);
      expect(bid.fee).toBeLessThan(price);
      expect(awaitingManager(state, bid)).toBe(true);
    }
  });

  it('brings loan requests for young fringe players, which you can accept', () => {
    const { state, clubId } = newCareer('loan-in');
    let request: Bid | undefined;
    for (let i = 0; i < 150 && !request; i++) {
      advanceDay(state);
      request = state.transfers.bids.find((b) => b.kind === 'loan' && awaitingManager(state, b));
    }
    expect(request).toBeDefined();
    const player = state.world.players[request!.playerId]!;
    expect(answerIncomingBid(state, request!.id, true).ok).toBe(true);
    if (request!.status === 'completed') {
      expect(player.clubId).toBe(request!.buyerId);
      expect(player.loan?.fromId).toBe(clubId);
    } else {
      expect(request!.status).toBe('agreed');
    }
  });
});
