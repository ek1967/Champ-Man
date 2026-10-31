import { describe, expect, it } from 'vitest';
import { OWNER_POLICY, ownerOf, recordFee, seasonIncome, setBudgets, settleAccounts } from '../src/finance.ts';
import { advanceDay, createGame } from '../src/game.ts';
import { currentSeasonOf } from '../src/queries.ts';
import { financesOf, wageBill } from '../src/transfers.ts';
import type { GameState } from '../src/types.ts';
import { DEMO_SECOND_DIVISION, DEMO_TOP_DIVISION } from '../src/worldgen.ts';

function until(state: GameState, date: string): void {
  while (state.date < date) advanceDay(state);
}

describe('club finances', () => {
  it('gives every club an owner, cash in the bank and an income', () => {
    const state = createGame({ seed: 'money', managerName: 'Test' });
    for (const club of Object.values(state.world.clubs)) {
      const f = financesOf(state, club.id);
      expect(OWNER_POLICY[ownerOf(club)]).toBeDefined();
      expect(f.cash).toBeGreaterThan(0);
      expect(seasonIncome(state, club.id).total).toBeGreaterThan(wageBill(state, club.id) * 52);
    }
    // Top-flight TV money is worth far more than the second tier's.
    const top = currentSeasonOf(state, DEMO_TOP_DIVISION)!.clubIds[0]!;
    const second = currentSeasonOf(state, DEMO_SECOND_DIVISION)!.clubIds[0]!;
    expect(seasonIncome(state, top).tv).toBeGreaterThan(seasonIncome(state, second).tv * 2);
  });

  it('moves cash with transfer fees', () => {
    const state = createGame({ seed: 'fees', managerName: 'Test' });
    const [a, b] = currentSeasonOf(state, DEMO_TOP_DIVISION)!.clubIds as [string, string];
    const before = [financesOf(state, a).cash!, financesOf(state, b).cash!];
    recordFee(state, a, b, 5_000_000);
    expect(financesOf(state, a).cash).toBe(before[0]! + 5_000_000);
    expect(financesOf(state, b).cash).toBe(before[1]! - 5_000_000);
  });

  it('settles the accounts each June and sets budgets by the owner\'s policy', () => {
    const state = createGame({ seed: 'accounts', managerName: 'Test' });
    until(state, '2027-06-26');
    const club = Object.values(state.world.clubs)[3]!;
    const f = financesOf(state, club.id);
    const cash = f.cash!;
    const income = seasonIncome(state, club.id).total;
    const wages = wageBill(state, club.id) * 52;
    settleAccounts(state, () => 0);
    const policy = OWNER_POLICY[ownerOf(club)];
    expect(f.accounts!.income).toBe(income);
    expect(f.cash).toBeCloseTo(cash + income - wages - income * 0.2 + income * policy.funding, -3);
    setBudgets(state, club.id);
    // Budgets are rounded to tidy figures.
    expect(Math.abs(f.transferBudget - Math.max(0, f.cash!) * policy.spend)).toBeLessThan(Math.max(1, f.transferBudget) * 0.01 + 1);
    expect(f.wageBudget).toBeGreaterThanOrEqual(wageBill(state, club.id));
  });

  it('lets rich owners spend more of the same cash than fan-owned clubs', () => {
    const state = createGame({ seed: 'owners', managerName: 'Test' });
    const [a, b] = currentSeasonOf(state, DEMO_TOP_DIVISION)!.clubIds as [string, string];
    state.world.clubs[a]!.owner = 'benefactor';
    state.world.clubs[b]!.owner = 'fans';
    financesOf(state, a).cash = 100_000_000;
    financesOf(state, b).cash = 100_000_000;
    expect(setBudgets(state, a).transferBudget).toBeGreaterThan(setBudgets(state, b).transferBudget * 2);
  });

  it("doesn't touch the books before a season has been played", () => {
    const state = createGame({ seed: 'first', managerName: 'Test' });
    const club = Object.values(state.world.clubs)[0]!;
    const cash = financesOf(state, club.id).cash;
    const budget = financesOf(state, club.id).transferBudget;
    until(state, '2026-07-02');
    expect(financesOf(state, club.id).accounts).toBeUndefined();
    expect(financesOf(state, club.id).transferBudget).toBeLessThanOrEqual(budget);
    expect(financesOf(state, club.id).cash).toBeLessThanOrEqual(cash!);
  });
});
