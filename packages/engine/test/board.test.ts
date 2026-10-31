import { describe, expect, it } from 'vitest';
import { board, boardTarget, facilityLevel, requestFromBoard, requestOptions, shiftBudget, WEEKS_PER_SEASON } from '../src/board.ts';
import { academyRating } from '../src/development.ts';
import { advanceDay, createGame, takeJob } from '../src/game.ts';
import { currentSeasonOf } from '../src/queries.ts';
import { financesOf, wageBill } from '../src/transfers.ts';
import type { GameState } from '../src/types.ts';
import { DEMO_TOP_DIVISION } from '../src/worldgen.ts';

function career(seed: string): { state: GameState; clubId: string } {
  const state = createGame({ seed, managerName: 'Test' });
  const clubs = currentSeasonOf(state, DEMO_TOP_DIVISION)!.clubIds;
  const clubId = [...clubs].sort((a, b) => state.world.clubs[b]!.reputation - state.world.clubs[a]!.reputation)[5]!;
  takeJob(state, clubId);
  return { state, clubId };
}

function until(state: GameState, date: string): void {
  while (state.date < date) advanceDay(state);
}

describe('budgets', () => {
  it('moves money between the transfer and wage budgets at a year of wages', () => {
    const { state, clubId } = career('shift');
    const f = financesOf(state, clubId);
    const before = { transfer: f.transferBudget, wage: f.wageBudget };
    expect(shiftBudget(state, 10_000).ok).toBe(true);
    expect(f.wageBudget).toBe(before.wage + 10_000);
    expect(f.transferBudget).toBe(before.transfer - 10_000 * WEEKS_PER_SEASON);
    expect(shiftBudget(state, -10_000).ok).toBe(true);
    expect(f.transferBudget).toBe(before.transfer);
    // Can't take out wage budget that is already being paid.
    const room = f.wageBudget - wageBill(state, clubId);
    expect(shiftBudget(state, -(room + 1_000)).ok).toBe(false);
    expect(shiftBudget(state, Math.ceil(f.transferBudget / WEEKS_PER_SEASON) + 1_000).ok).toBe(false);
  });

  it('sets new budgets each summer', () => {
    const { state } = career('summer');
    until(state, '2027-06-29');
    expect(state.news.some((n) => n.title.startsWith('Budgets for 2027-28'))).toBe(true);
  });
});

describe('board requests', () => {
  it('grants money when the board is pleased and refuses when it is not, with a wait before asking again', () => {
    const { state, clubId } = career('requests');
    const f = financesOf(state, clubId);
    board(state).confidence = 80;
    const before = f.transferBudget;
    expect(requestFromBoard(state, 'transfer').ok).toBe(true);
    expect(f.transferBudget).toBeGreaterThan(before);
    expect(requestFromBoard(state, 'transfer').ok).toBe(false);
    expect(requestOptions(state).find((o) => o.kind === 'transfer')!.blocked).toMatch(/won't discuss/);

    board(state).confidence = 20;
    const wage = f.wageBudget;
    expect(requestFromBoard(state, 'wages').ok).toBe(false);
    expect(f.wageBudget).toBe(wage);
  });

  it('builds facilities that make a difference when finished', () => {
    const { state, clubId } = career('facilities');
    const club = state.world.clubs[clubId]!;
    board(state).confidence = 90;
    const academy = academyRating(club, state);
    const reputation = club.reputation;
    expect(requestFromBoard(state, 'youth').ok).toBe(true);
    expect(requestFromBoard(state, 'stadium').ok).toBe(true);
    expect(requestOptions(state).find((o) => o.kind === 'youth')!.blocked).toBeTruthy();
    until(state, '2027-04-20');
    expect(facilityLevel(state, clubId, 'youth')).toBe(1);
    // Two points better than the club's size alone would give.
    expect(academyRating(club, state)).toBe(Math.min(20, academyRating(club) + 2));
    expect(academyRating(club, state)).toBeGreaterThan(academy);
    expect(facilityLevel(state, clubId, 'stadium')).toBe(1);
    expect(club.reputation).toBe(Math.min(100, reputation + 2));
  });

  it('offers a new contract only when it is pleased', () => {
    const { state } = career('contract');
    const b = board(state);
    b.confidence = 50;
    expect(requestFromBoard(state, 'contract').ok).toBe(false);
    b.requests = [];
    b.confidence = 80;
    const expires = b.contract.expires;
    expect(requestFromBoard(state, 'contract').ok).toBe(true);
    expect(b.contract.expires > expires).toBe(true);
  });

  it('expects more of stronger squads', () => {
    const { state } = career('target');
    const clubs = currentSeasonOf(state, DEMO_TOP_DIVISION)!.clubIds;
    const targets = clubs.map((id) => boardTarget(state, id).position);
    expect(Math.min(...targets)).toBe(1);
    expect(Math.max(...targets)).toBeGreaterThan(10);
  });
});
