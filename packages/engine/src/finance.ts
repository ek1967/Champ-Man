/**
 * Club finances: who owns the club, money in and out each season, cash in the bank, and the
 * budgets each club sets every summer from them.
 *
 * Money in the game is on the game's own scale: wages come from player ability, so income is
 * calibrated to the wage bills clubs start with (each club starts at the share of income its owner
 * allows for wages). From then on income follows the league (TV money, more for finishing higher,
 * a parachute after relegation) and the stadium, and the owner puts money in or takes it out.
 */
import { addNews } from './news.ts';
import { roundMoney } from './players.ts';
import { getClub, squadOf } from './queries.ts';
import type { Club, ClubFinances, CompetitionSeason, GameState, Id } from './types.ts';

export type OwnerKind = 'benefactor' | 'company' | 'plc' | 'fans' | 'indebted';

export interface OwnerPolicy {
  label: string;
  description: string;
  /** Owner money in (+) or out (−) each season, as a share of income. */
  funding: number;
  /** Share of cash in the bank the club lets the manager spend on fees each summer. */
  spend: number;
  /** Highest share of income the club will spend on wages. */
  wageRatio: number;
}

export const OWNER_POLICY: Record<OwnerKind, OwnerPolicy> = {
  benefactor: {
    label: 'Wealthy owner',
    description: 'A rich owner puts money in every year and covers losses.',
    funding: 0.25, spend: 0.6, wageRatio: 0.8,
  },
  company: {
    label: 'Company owned',
    description: 'Owned by a company or investment group that invests a little each year and expects a return in time.',
    funding: 0.08, spend: 0.45, wageRatio: 0.7,
  },
  plc: {
    label: 'Self-sustaining PLC',
    description: 'Run as a business answerable to shareholders: spends what it earns and keeps money in the bank.',
    funding: 0, spend: 0.35, wageRatio: 0.6,
  },
  fans: {
    label: 'Fan owned',
    description: 'Owned by supporters: careful with money and never spends what it does not have.',
    funding: 0, spend: 0.25, wageRatio: 0.55,
  },
  indebted: {
    label: 'In debt',
    description: 'Paying off debts: money goes out to the lenders every year.',
    funding: -0.08, spend: 0.2, wageRatio: 0.55,
  },
};

/** Clubs start this far inside their owner's wage limit (1.03 = 3% of room). */
const STARTING_HEADROOM = 1.03;

/** Share of a league's average income that is TV and prize money (the rest is the club's own). */
const TV_SHARE = 0.5;
/** Running costs other than wages, as a share of income. */
const OTHER_COSTS = 0.2;

/** The owner of a club: from the data, or a sensible guess from its size for clubs without one. */
export function ownerOf(club: Club): OwnerKind {
  if (club.owner) return club.owner;
  const r = club.reputation;
  if (r >= 92) return 'benefactor';
  if (r >= 70) return 'company';
  if (r >= 45) return 'plc';
  return 'fans';
}

function economy(state: GameState): NonNullable<GameState['economy']> {
  if (!state.economy) initEconomy(state);
  return state.economy!;
}

/**
 * Income levels for every club and league, from the wage bills clubs have now. Run once, when the
 * game is created (or when an older save first needs it).
 */
export function initEconomy(state: GameState): void {
  const base = new Map<Id, number>();
  // Clubs start at their owner's wage limit, so wages only grow when income does.
  for (const club of Object.values(state.world.clubs)) {
    base.set(club.id, (wageBillOf(state, club.id) * 52 * STARTING_HEADROOM) / OWNER_POLICY[ownerOf(club)].wageRatio);
  }
  const tv: Record<Id, number> = {};
  for (const competition of Object.values(state.world.competitions)) {
    const clubs = Object.values(state.world.clubs).filter((c) => c.leagueId === competition.id);
    const mean = clubs.reduce((s, c) => s + (base.get(c.id) ?? 0), 0) / Math.max(1, clubs.length);
    tv[competition.id] = roundMoney(mean * TV_SHARE);
  }
  state.economy = { tv };
  for (const club of Object.values(state.world.clubs)) {
    const f = state.finances[club.id];
    if (!f) continue;
    const revenue = base.get(club.id) ?? 0;
    f.ownIncome ??= roundMoney(Math.max(revenue * 0.2, revenue - (tv[club.leagueId] ?? 0)));
    // Cash in the bank: from the data where known (the first summer's budget then follows from it),
    // otherwise whatever makes the first summer's budget the owner's usual share of it.
    const spend = OWNER_POLICY[ownerOf(club)].spend;
    if (f.cash === undefined) {
      if (club.startingCash !== undefined) {
        f.cash = club.startingCash;
        f.transferBudget = roundMoney(Math.max(0, club.startingCash * spend));
      } else {
        f.cash = Math.round(f.transferBudget / spend);
      }
    }
  }
}

function wageBillOf(state: GameState, clubId: Id): number {
  return squadOf(state, clubId).reduce((sum, p) => sum + (p.contract?.wage ?? 0), 0);
}

/** The most recent finished league season a club played in, and where it finished. */
function lastFinish(state: GameState, clubId: Id): { season: CompetitionSeason; position: number } | null {
  let best: CompetitionSeason | null = null;
  for (const s of Object.values(state.seasons)) {
    if (s.status !== 'finished' || !s.final?.order.includes(clubId)) continue;
    if (!best || s.endDate > best.endDate) best = s;
  }
  return best ? { season: best, position: best.final!.order.indexOf(clubId) + 1 } : null;
}

export interface SeasonIncome {
  tv: number;
  own: number;
  parachute: number;
  total: number;
}

/**
 * A season's income: the league's TV money (more for finishing higher: from +15% for the champions
 * to −15% for the bottom club), the club's own income (bigger with an expanded stadium), and half
 * the TV money lost for a season after relegation.
 */
export function seasonIncome(state: GameState, clubId: Id, stadiumLevel = 0): SeasonIncome {
  const club = getClub(state, clubId);
  const f = financesOfClub(state, clubId);
  const eco = economy(state);
  const last = lastFinish(state, clubId);
  let tv = eco.tv[club.leagueId] ?? 0;
  let parachute = 0;
  if (last) {
    const leagueTv = eco.tv[last.season.competitionId] ?? tv;
    const n = last.season.final!.order.length;
    const merit = 1.15 - (0.3 * (last.position - 1)) / Math.max(1, n - 1);
    if (last.season.competitionId === club.leagueId) tv *= merit;
    else if (leagueTv > tv) parachute = (leagueTv - tv) * 0.5;
  }
  const own = (f.ownIncome ?? 0) * (1 + 0.08 * stadiumLevel);
  return { tv: Math.round(tv), own: Math.round(own), parachute: Math.round(parachute), total: Math.round(tv + own + parachute) };
}

function financesOfClub(state: GameState, clubId: Id): ClubFinances {
  const f = state.finances[clubId];
  if (!f) throw new Error(`No finances for ${clubId}`);
  return f;
}

/** Money moves with every transfer: the buyer's cash goes down, the seller's up. */
export function recordFee(state: GameState, fromId: Id | null, toId: Id, fee: number): void {
  if (fee <= 0) return;
  const buyer = state.finances[toId];
  if (buyer) {
    buyer.cash = (buyer.cash ?? 0) - fee;
    buyer.season = { spent: (buyer.season?.spent ?? 0) + fee, received: buyer.season?.received ?? 0 };
  }
  const seller = fromId ? state.finances[fromId] : undefined;
  if (seller) {
    seller.cash = (seller.cash ?? 0) + fee;
    seller.season = { spent: seller.season?.spent ?? 0, received: (seller.season?.received ?? 0) + fee };
  }
}

/** Any other one-off cost (paying up a contract, say). */
export function recordCost(state: GameState, clubId: Id, amount: number): void {
  const f = state.finances[clubId];
  if (f) f.cash = (f.cash ?? 0) - amount;
}

/**
 * The end of the financial year (27 June): every club's accounts. Income comes in, wages and
 * running costs go out, and the owner puts money in or takes it out.
 */
export function settleAccounts(state: GameState, stadiumLevel: (clubId: Id) => number): void {
  economy(state);
  // Nothing to account for before the first season has been played.
  if (!Object.values(state.seasons).some((s) => s.status === 'finished')) return;
  for (const club of Object.values(state.world.clubs)) {
    const f = state.finances[club.id];
    if (!f) continue;
    const income = seasonIncome(state, club.id, stadiumLevel(club.id));
    const wages = wageBillOf(state, club.id) * 52;
    const costs = income.total * OTHER_COSTS;
    const funding = income.total * OWNER_POLICY[ownerOf(club)].funding;
    const profit = income.total - wages - costs + funding;
    f.cash = Math.round((f.cash ?? 0) + profit);
    f.accounts = {
      year: state.date.slice(0, 4),
      income: income.total,
      wages: Math.round(wages),
      costs: Math.round(costs),
      funding: Math.round(funding),
      transfersSpent: f.season?.spent ?? 0,
      transfersReceived: f.season?.received ?? 0,
      cash: f.cash,
    };
    f.season = { spent: 0, received: 0 };
  }
}

/**
 * The summer budgets (28 June): the owner lets the club spend a share of the cash in the bank on
 * fees, and allows wages up to a share of next season's income (never below the current bill).
 * `scale` lets the board give the manager more or less than the usual share.
 */
export function setBudgets(state: GameState, clubId: Id, scale = 1, stadiumLevel = 0): ClubFinances {
  const club = getClub(state, clubId);
  const f = financesOfClub(state, clubId);
  const policy = OWNER_POLICY[ownerOf(club)];
  const income = seasonIncome(state, clubId, stadiumLevel).total;
  f.transferBudget = roundMoney(Math.max(0, (f.cash ?? 0) * policy.spend * scale));
  // Never below the current bill (contracts must be paid), but no automatic rise: wages follow income.
  f.wageBudget = roundMoney(Math.max(wageBillOf(state, clubId), (income * policy.wageRatio) / 52));
  return f;
}

/** Plain-language summary of last year's accounts for the manager's club. */
export function accountsNews(state: GameState, clubId: Id): void {
  const club = getClub(state, clubId);
  const a = state.finances[clubId]?.accounts;
  if (!a) return;
  const money = (n: number) => (n < 0 ? `−€${(Math.abs(n) / 1_000_000).toFixed(1)}M` : `€${(n / 1_000_000).toFixed(1)}M`);
  const policy = OWNER_POLICY[ownerOf(club)];
  addNews(state, {
    category: 'club',
    title: `${club.shortName}: accounts for the year`,
    body: [
      `Income ${money(a.income)} · Wages ${money(a.wages)} · Running costs ${money(a.costs)}${a.funding !== 0 ? ` · ${a.funding > 0 ? 'Owner investment' : 'Debt repayments'} ${money(Math.abs(a.funding))}` : ''}.`,
      `Transfers: ${money(a.transfersSpent)} spent, ${money(a.transfersReceived)} received.`,
      `Cash in the bank: ${money(a.cash)}. ${policy.label}: ${policy.description}`,
    ].join('\n\n'),
  });
}
