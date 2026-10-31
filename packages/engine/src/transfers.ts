/**
 * Transfer market (PLAN §7.5): windows, budgets, asking prices, bids and counter-bids, personal
 * terms, contract renewals and expiry, free agents, and the computer clubs trading among
 * themselves. Everything is driven from the daily tick (`transferDay`).
 */
import type { Position } from './attributes.ts';
import { addDays, ageOn, formatShort, type ISODate, makeDate, monthDay, yearOf } from './dates.ts';
import { addNews, clubLink, playerLink } from './news.ts';
import { estimateWage, generatePlayer, positionRating, roundMoney } from './players.ts';
import { getClub, squadIndex, squadOf } from './queries.ts';
import { chance, poisson, random, randInt, weightedPick } from './rng.ts';
import { autoTactics, FORMATIONS } from './tactics.ts';
import type { Bid, Club, ClubFinances, GameState, Id, Player, TransferRecord } from './types.ts';

// ---------- Windows ----------

/** English windows ('MM-DD', inclusive). Other nations get their own when they arrive. */
export const TRANSFER_WINDOWS: ReadonlyArray<{ name: string; open: string; close: string }> = [
  { name: 'summer', open: '07-01', close: '09-01' },
  { name: 'January', open: '01-01', close: '02-02' },
];

export function openWindow(date: ISODate): { name: string; closes: ISODate } | null {
  const md = monthDay(date);
  for (const w of TRANSFER_WINDOWS) {
    if (md >= w.open && md <= w.close) return { name: w.name, closes: `${yearOf(date)}-${w.close}` };
  }
  return null;
}

export function nextWindowOpens(date: ISODate): ISODate {
  const year = yearOf(date);
  const candidates = TRANSFER_WINDOWS.flatMap((w) => [`${year}-${w.open}`, `${year + 1}-${w.open}`]).filter((d) => d > date).sort();
  return candidates[0] ?? date;
}

/** When a deal agreed today takes effect: straight away during a window, otherwise when the next one opens. */
export function moveDate(date: ISODate): ISODate {
  return openWindow(date) ? date : nextWindowOpens(date);
}

/** The deal a player has agreed (to move or go on loan), if any. */
export function agreedMoveFor(state: GameState, playerId: Id): Bid | undefined {
  return state.transfers.bids.find((b) => b.playerId === playerId && b.status === 'agreed');
}

/** Fees and wages already promised for players arriving when the window opens. */
export function committed(state: GameState, clubId: Id): { fees: number; wages: number } {
  let fees = 0;
  let wages = 0;
  for (const b of state.transfers.bids) {
    if (b.status !== 'agreed' || b.buyerId !== clubId) continue;
    if (b.kind !== 'loan') fees += b.fee;
    wages += b.wage ?? 0;
  }
  return { fees, wages };
}

export function availableBudget(state: GameState, clubId: Id): number {
  return financesOf(state, clubId).transferBudget - committed(state, clubId).fees;
}

// ---------- Money ----------

export function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `€${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}M`;
  if (amount >= 1_000) return `€${Math.round(amount / 1_000)}K`;
  return `€${amount}`;
}

export function wageBill(state: GameState, clubId: Id): number {
  return squadOf(state, clubId).reduce((sum, p) => sum + (p.contract?.wage ?? 0), 0);
}

/** Starting budgets from club size: the biggest clubs can spend well over €150M in a summer. */
export function initialFinances(state: GameState, club: Club): ClubFinances {
  const r = club.reputation / 100;
  const wealth = state.world.nations[club.nationId]?.wealth ?? 1;
  return {
    transferBudget: roundMoney(Math.max(500_000, 230_000_000 * r ** 4.5 * wealth)),
    wageBudget: roundMoney(wageBill(state, club.id) * (1.08 + 0.1 * r)),
  };
}

export function financesOf(state: GameState, clubId: Id): ClubFinances {
  let f = state.finances[clubId];
  if (!f) state.finances[clubId] = f = initialFinances(state, getClub(state, clubId));
  return f;
}

// ---------- Valuation ----------

function contractYearsLeft(player: Player, date: ISODate): number {
  if (!player.contract) return 0;
  return Math.max(0, (Date.parse(player.contract.expires) - Date.parse(date)) / (365.25 * 86_400_000));
}

/** Where a player ranks in their club's squad by ability (1 = best). */
function squadRank(state: GameState, player: Player): number {
  if (!player.clubId) return 99;
  return squadOf(state, player.clubId).filter((p) => p.ca > player.ca).length + 1;
}

/**
 * What the selling club wants. Starts from the player's value, then: more for long contracts
 * and key players, less for players they've listed or whose contracts are running down.
 */
export function askingPrice(state: GameState, player: Player, rank = squadRank(state, player)): number {
  if (!player.clubId) return 0;
  const years = contractYearsLeft(player, state.date);
  const contract = years >= 3 ? 1.35 : years >= 2 ? 1.15 : years >= 1 ? 0.9 : 0.55;
  const importance = rank <= 3 ? 1.5 : rank <= 8 ? 1.25 : rank <= 14 ? 1 : 0.8;
  const listed = player.transferListed ? 0.8 : 1;
  return Math.max(50_000, roundMoney(player.value * contract * importance * listed));
}

const isKeeper = (p: Player): boolean => (p.positions.GK ?? 0) >= 18;

export function keeperCount(state: GameState, clubId: Id): number {
  return squadOf(state, clubId).filter(isKeeper).length;
}

/** Players who joined in the last ten months aren't sold on. */
export function recentlySigned(state: GameState, playerId: Id): boolean {
  const since = addDays(state.date, -300);
  return state.transfers.history.some((r) => r.playerId === playerId && r.date > since && r.kind !== 'released');
}

/**
 * Whether a club will sell at all: not players they have just signed, and their key players
 * only to a clearly bigger club, or for well over the asking price.
 */
export function sellerBlocks(state: GameState, player: Player, buyerId: Id, fee: number, rank = squadRank(state, player)): string | null {
  if (!player.clubId) return null;
  if (player.loan) return 'The player is only there on loan.';
  const agreed = agreedMoveFor(state, player.id);
  if (agreed && agreed.buyerId !== buyerId) return `The player has already agreed to join ${getClub(state, agreed.buyerId).shortName}.`;
  if (recentlySigned(state, player.id)) return 'They only signed the player recently and will not sell.';
  if (isKeeper(player) && keeperCount(state, player.clubId) <= 2) return 'They cannot spare a goalkeeper.';
  const seller = getClub(state, player.clubId);
  const buyer = getClub(state, buyerId);
  if (rank <= 5 && buyer.reputation < seller.reputation + 5 && fee < askingPrice(state, player, rank) * 1.6) {
    return 'The player is one of their most important and they will not sell to a club of your size.';
  }
  return null;
}

/** The weekly wage a player wants to join (or stay at) a club. */
export function wageDemand(state: GameState, player: Player, clubId: Id): number {
  const club = getClub(state, clubId);
  const base = estimateWage(player.ca) * (0.85 + club.reputation / 250) * (1 + (player.hidden.ambition - 10) / 50);
  const current = player.contract?.wage ?? 0;
  const moving = player.clubId !== clubId;
  return roundMoney(Math.max(base, current * (moving ? 1.15 : 1.05), 1_000));
}

/** Whether a player would consider joining a club at all, and why not. */
export function willingToJoin(state: GameState, player: Player, clubId: Id): { ok: boolean; reason?: string } {
  const buyer = getClub(state, clubId);
  if (!player.clubId) return { ok: true };
  const current = getClub(state, player.clubId);
  const leagueDrop = buyer.leagueId !== current.leagueId && state.world.competitions[buyer.leagueId]!.tier > state.world.competitions[current.leagueId]!.tier;
  const gap = current.reputation - buyer.reputation;
  // Ambitious players are less willing to step down; loyal ones are harder to prise away at all.
  const tolerance = 12 - (player.hidden.ambition - 10) * 0.6;
  if (leagueDrop && player.ca > 120) return { ok: false, reason: `doesn't want to drop down a division` };
  if (gap > tolerance) return { ok: false, reason: `doesn't want to move to a smaller club than ${current.shortName}` };
  return { ok: true };
}

/** A contract of `years` seasons, counted from the season being played (June onwards counts as the next). */
export function contractEnd(date: ISODate, years: number): ISODate {
  const seasonEnd = monthDay(date) >= '06-01' ? yearOf(date) + 1 : yearOf(date);
  return makeDate(seasonEnd + years - 1, 6, 30);
}

// ---------- Moving players ----------

export function nextSquadNumber(state: GameState, clubId: Id, from = 2): number {
  const used = new Set(squadOf(state, clubId).map((p) => p.squadNumber));
  let n = from;
  while (used.has(n)) n++;
  return n;
}

export function removeFromTactics(state: GameState, playerId: Id): void {
  const t = state.manager.tactics;
  if (!t) return;
  t.lineup = t.lineup.map((id) => (id === playerId ? null : id));
  t.bench = t.bench.filter((id) => id !== playerId);
}

/** Moves a player and their money. `fee` 0 with no seller = free transfer. */
export function completeTransfer(state: GameState, player: Player, toId: Id, fee: number, wage: number, years: number): TransferRecord {
  const fromId = player.clubId;
  if (fromId) {
    financesOf(state, fromId).transferBudget += fee;
    if (fromId === state.manager.clubId) removeFromTactics(state, player.id);
  }
  financesOf(state, toId).transferBudget -= fee;
  player.clubId = toId;
  player.loan = null;
  player.transferListed = false;
  player.squadNumber = nextSquadNumber(state, toId);
  player.contract = { wage, expires: contractEnd(state.date, years) };
  const record: TransferRecord = { date: state.date, playerId: player.id, fromId, toId, fee, kind: fromId ? 'transfer' : 'free' };
  state.transfers.history.push(record);
  // Pending bids for this player from anyone else lapse.
  for (const bid of state.transfers.bids) {
    if (bid.playerId === player.id && ['pending', 'countered', 'accepted', 'agreed'].includes(bid.status) && bid.buyerId !== toId) {
      bid.status = 'collapsed';
      bid.note = `${player.knownAs ?? player.lastName} has joined ${getClub(state, toId).shortName}.`;
    }
  }
  return record;
}

export function releasePlayer(state: GameState, player: Player): void {
  const fromId = player.clubId;
  player.loan = null;
  if (fromId === state.manager.clubId) removeFromTactics(state, player.id);
  player.clubId = null;
  player.contract = null;
  player.squadNumber = null;
  player.transferListed = false;
  state.transfers.history.push({ date: state.date, playerId: player.id, fromId, toId: null, fee: 0, kind: 'released' });
}

// ---------- The manager's bids ----------

function newBid(state: GameState, bid: Omit<Bid, 'id'>): Bid {
  state.transfers.counter++;
  const full: Bid = { id: `b${state.transfers.counter}`, ...bid };
  state.transfers.bids.push(full);
  return full;
}

export function activeBidFor(state: GameState, playerId: Id, buyerId: Id): Bid | undefined {
  return state.transfers.bids.find((b) => b.playerId === playerId && b.buyerId === buyerId && ['pending', 'countered', 'accepted'].includes(b.status));
}

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

/** The manager offers a fee for a player at another club. The club answers in a day or two. */
export function makeBid(state: GameState, playerId: Id, fee: number): ActionResult {
  const buyerId = state.manager.clubId;
  const player = state.world.players[playerId];
  if (!buyerId || !player) return { ok: false, message: 'You need a club to make offers.' };
  if (!player.clubId) return { ok: false, message: 'Free agents need a contract offer, not a fee.' };
  if (player.clubId === buyerId) return { ok: false, message: 'They already play for you.' };
  if (player.loan) return { ok: false, message: `${player.knownAs ?? player.lastName} is only on loan at ${getClub(state, player.clubId).shortName}.` };
  if (fee > availableBudget(state, buyerId)) return { ok: false, message: 'That is more than you have left to spend.' };
  const existing = activeBidFor(state, playerId, buyerId);
  if (existing && existing.status === 'pending') return { ok: false, message: 'You are already waiting for an answer on this player.' };
  if (existing) existing.status = 'withdrawn';
  newBid(state, { playerId, buyerId, sellerId: player.clubId, fee, status: 'pending', created: state.date, respondOn: addDays(state.date, randInt(state.rng, 1, 2)) });
  const when = openWindow(state.date) ? '' : ` If you agree a deal, the player joins when the window opens on ${formatShort(nextWindowOpens(state.date))}.`;
  return { ok: true, message: `Offer of ${formatMoney(fee)} sent to ${getClub(state, player.clubId).shortName}. Expect an answer in a day or two.${when}` };
}

/** How a selling club answers a bid. */
function sellerVerdict(state: GameState, bid: Bid): { status: 'accepted' | 'countered' | 'rejected'; asking: number; note: string } {
  const player = state.world.players[bid.playerId]!;
  const asking = askingPrice(state, player);
  const squad = squadOf(state, bid.sellerId);
  if (squad.length <= 18) return { status: 'rejected', asking, note: 'They are short of players and will not sell.' };
  const blocked = sellerBlocks(state, player, bid.buyerId, bid.fee);
  if (blocked) return { status: 'rejected', asking, note: blocked };
  if (bid.fee >= asking) return { status: 'accepted', asking, note: 'The fee is agreed.' };
  if (bid.fee >= asking * 0.7) return { status: 'countered', asking, note: `They would sell for ${formatMoney(asking)}.` };
  return { status: 'rejected', asking, note: 'The offer is well short of what they want.' };
}

function bidNews(state: GameState, bid: Bid): void {
  const player = state.world.players[bid.playerId]!;
  const seller = getClub(state, bid.sellerId);
  const titles: Record<string, string> = {
    accepted: `${seller.shortName} accept your bid for ${player.knownAs ?? player.lastName}`,
    countered: `${seller.shortName} want more for ${player.knownAs ?? player.lastName}`,
    rejected: `${seller.shortName} reject your bid for ${player.knownAs ?? player.lastName}`,
  };
  const next: Record<string, string> = {
    accepted: 'Agree personal terms with the player to complete the deal.',
    countered: `You can raise your offer to ${formatMoney(bid.asking ?? bid.fee)}.`,
    rejected: 'You can make a better offer from the player page.',
  };
  const n = addNews(state, {
    category: 'transfer',
    title: titles[bid.status] ?? 'Transfer update',
    body: [
      `${clubLink(seller)} have answered your ${formatMoney(bid.fee)} offer for ${playerLink(player)}. ${bid.note ?? ''}`,
      next[bid.status] ?? '',
    ].join('\n\n'),
    important: true,
  });
  n.bidId = bid.id;
}

export interface ContractOffer {
  wage: number;
  years: number;
}

/** True when a player's contract runs out this June and the manager may agree a pre-contract (from 1 January). */
export function preContractAllowed(state: GameState, player: Player): boolean {
  if (!player.clubId || !player.contract || player.loan) return false;
  const md = monthDay(state.date);
  return md >= '01-01' && md <= '06-30' && player.contract.expires <= `${yearOf(state.date)}-06-30`;
}

/** Moves now, or records the agreement for when the window opens. */
function settleAgreed(state: GameState, bid: Bid, player: Player): 'now' | ISODate {
  const on = bid.kind !== 'loan' && !player.clubId ? state.date : moveDate(state.date);
  // Pre-contracts always wait for 1 July, when the old contract has ended.
  const when = bid.fee === 0 && bid.kind !== 'loan' && player.clubId && preContractAllowed(state, player) ? `${yearOf(state.date)}-07-01` : on;
  if (when <= state.date) {
    carryOut(state, bid, player);
    return 'now';
  }
  bid.status = 'agreed';
  bid.moveOn = when;
  return when;
}

/** Executes an agreed transfer or loan. */
function carryOut(state: GameState, bid: Bid, player: Player): void {
  if (bid.kind === 'loan') {
    startLoan(state, player, bid.buyerId, bid.loanUntil ?? loanEnd(state.date, 'season'));
  } else {
    completeTransfer(state, player, bid.buyerId, bid.fee, bid.wage ?? wageDemand(state, player, bid.buyerId), bid.years ?? 3);
  }
  bid.status = 'completed';
}

/**
 * Personal terms: after a fee is agreed, for a free agent, or for a pre-contract with a player
 * whose deal ends in June. The move happens straight away during a window, otherwise when it opens.
 */
export function offerContract(state: GameState, playerId: Id, offer: ContractOffer): ActionResult {
  const buyerId = state.manager.clubId;
  const player = state.world.players[playerId];
  if (!buyerId || !player) return { ok: false, message: 'You need a club to sign players.' };
  let bid = player.clubId ? state.transfers.bids.find((b) => b.playerId === playerId && b.buyerId === buyerId && b.status === 'accepted') : undefined;
  const preContract = !bid && preContractAllowed(state, player);
  if (player.clubId && !bid && !preContract) return { ok: false, message: 'Agree a fee with their club first.' };
  if (preContract && agreedMoveFor(state, playerId)) return { ok: false, message: 'The player has already agreed to move.' };
  const finances = financesOf(state, buyerId);
  if (wageBill(state, buyerId) + committed(state, buyerId).wages + offer.wage > finances.wageBudget) {
    return { ok: false, message: `That would take your wage bill over the budget of ${formatMoney(finances.wageBudget)} a week.` };
  }
  const willing = willingToJoin(state, player, buyerId);
  const name = player.knownAs ?? player.lastName;
  if (!willing.ok) {
    if (bid) {
      bid.status = 'collapsed';
      bid.note = `${name} ${willing.reason}.`;
    }
    return { ok: false, message: `${name} ${willing.reason}.` };
  }
  const demand = wageDemand(state, player, buyerId);
  if (offer.wage < demand * 0.97) return { ok: false, message: `${name} wants at least ${formatMoney(demand)} a week.` };
  const age = ageOn(player.dateOfBirth, state.date);
  if (age >= 32 && offer.years > 2) return { ok: false, message: `At ${age}, the club would not offer more than two years.` };

  bid ??= newBid(state, {
    playerId, buyerId, sellerId: player.clubId ?? buyerId, fee: 0, status: 'accepted', created: state.date, respondOn: state.date,
    note: preContract ? 'Pre-contract agreement.' : 'Free agent.',
  });
  bid.wage = offer.wage;
  bid.years = offer.years;
  const fee = bid.fee;
  const result = settleAgreed(state, bid, player);
  if (result === 'now') {
    addNews(state, {
      category: 'transfer',
      title: `${name} signs`,
      body: `${playerLink(player)} has signed a ${offer.years}-year contract worth ${formatMoney(offer.wage)} a week${fee > 0 ? ` after a ${formatMoney(fee)} transfer` : ' on a free transfer'}.`,
    });
    return { ok: true, message: `${name} has signed!` };
  }
  addNews(state, {
    category: 'transfer',
    title: `${name} agrees to join on ${formatShort(result)}`,
    body: `${playerLink(player)} has agreed a ${offer.years}-year contract worth ${formatMoney(offer.wage)} a week${fee > 0 ? ` after a ${formatMoney(fee)} fee was agreed` : preContract ? ' on a pre-contract' : ''}. The move goes through on ${formatShort(result)}.`,
  });
  return { ok: true, message: `Agreed! ${name} joins on ${formatShort(result)}.` };
}

/** New contract for one of the manager's own players. */
export function renewContract(state: GameState, playerId: Id, offer: ContractOffer): ActionResult {
  const player = state.world.players[playerId];
  const clubId = state.manager.clubId;
  if (!player || !clubId || player.clubId !== clubId) return { ok: false, message: 'Only your own players can be offered a new contract.' };
  const demand = wageDemand(state, player, clubId);
  const name = player.knownAs ?? player.lastName;
  if (offer.wage < demand * 0.97) return { ok: false, message: `${name} wants at least ${formatMoney(demand)} a week to stay.` };
  const finances = financesOf(state, clubId);
  if (wageBill(state, clubId) - (player.contract?.wage ?? 0) + offer.wage > finances.wageBudget) {
    return { ok: false, message: `That would take your wage bill over the budget of ${formatMoney(finances.wageBudget)} a week.` };
  }
  player.contract = { wage: offer.wage, expires: contractEnd(state.date, offer.years) };
  return { ok: true, message: `${name} has signed a new ${offer.years}-year deal.` };
}

export function setTransferListed(state: GameState, playerId: Id, listed: boolean): void {
  const player = state.world.players[playerId];
  if (player && player.clubId === state.manager.clubId) player.transferListed = listed;
}

// ---------- Offers for the manager's players ----------

function aiBidForHumanPlayer(state: GameState): void {
  const humanId = state.manager.clubId;
  if (!humanId) return;
  const squad = squadOf(state, humanId).filter((p) => !p.loan && !agreedMoveFor(state, p.id));
  if (squad.length === 0) return;
  const target = weightedPick(state.rng, squad, (p) => (p.transferListed ? 8 : 1) * (p.ca / 100) ** 2);
  if (!target || state.transfers.bids.some((b) => b.playerId === target.id && b.status === 'pending')) return;
  const buyers = Object.values(state.world.clubs).filter((c) => {
    if (c.id === humanId) return false;
    const budget = financesOf(state, c.id).transferBudget;
    return budget > target.value * 0.8 && willingToJoin(state, target, c.id).ok;
  });
  if (buyers.length === 0) return;
  const buyer = weightedPick(state.rng, buyers, (c) => c.reputation);
  const fee = roundMoney(Math.min(financesOf(state, buyer.id).transferBudget, askingPrice(state, target) * (0.7 + 0.45 * random(state.rng))));
  const bid = newBid(state, { playerId: target.id, buyerId: buyer.id, sellerId: humanId, fee, status: 'pending', created: state.date, respondOn: addDays(state.date, 5) });
  const n = addNews(state, {
    category: 'transfer',
    title: `${buyer.shortName} bid ${formatMoney(fee)} for ${target.knownAs ?? target.lastName}`,
    body: [
      `${clubLink(buyer)} have offered ${formatMoney(fee)} for ${playerLink(target)}.`,
      `Your board values the player at around ${formatMoney(askingPrice(state, target))}. The offer stands for five days.`,
    ].join('\n\n'),
    important: true,
  });
  n.bidId = bid.id;
}

/** The manager accepts or turns down an offer for one of their players. */
export function answerIncomingBid(state: GameState, bidId: Id, accept: boolean): ActionResult {
  const bid = state.transfers.bids.find((b) => b.id === bidId);
  if (!bid || bid.sellerId !== state.manager.clubId || bid.status !== 'pending') return { ok: false, message: 'That offer is no longer open.' };
  const player = state.world.players[bid.playerId];
  if (!player) return { ok: false, message: 'Player not found.' };
  if (!accept) {
    bid.status = 'rejected';
    return { ok: true, message: 'Offer rejected.' };
  }
  bid.wage = wageDemand(state, player, bid.buyerId);
  bid.years = randInt(state.rng, 2, 5);
  const result = settleAgreed(state, bid, player);
  const name = player.knownAs ?? player.lastName;
  if (result === 'now') return { ok: true, message: `${name} has joined ${getClub(state, bid.buyerId).shortName} for ${formatMoney(bid.fee)}.` };
  return { ok: true, message: `Agreed: ${name} joins ${getClub(state, bid.buyerId).shortName} for ${formatMoney(bid.fee)} on ${formatShort(result)}.` };
}

// ---------- Computer clubs ----------

/** Average ability of a squad's best eleven players. */
function xiLevel(squad: readonly Player[]): number {
  const best = squad.map((p) => p.ca).sort((a, b) => b - a).slice(0, 11);
  return best.length === 0 ? 0 : best.reduce((a, b) => a + b, 0) / best.length;
}

/**
 * The best player a club in a poorer football nation (wealth below 1, e.g. Scotland) can attract:
 * it can't pay the wages of players far above the level its size supports (a best XI of about
 * 55 + 0.95 × reputation, which is how the Scotland pack is built). Anchored to size rather than
 * the current squad, so signings can't ratchet a league upwards. Unlimited for English clubs,
 * whose second tier lives off players released from the top flight.
 */
function attractCeiling(state: GameState, club: Club, margin = 5): number {
  const wealth = state.world.nations[club.nationId]?.wealth ?? 1;
  return wealth >= 1 ? Infinity : 55 + 0.95 * club.reputation + margin;
}

/** Number of clubs the computer clubs' transfer activity was tuned for. */
const REFERENCE_CLUBS = 44;

export const MIN_SQUAD = 20;
export const MAX_SQUAD = 30;

/** One computer-club signing: strengthen the weakest position in their best XI. */
function aiSigning(state: GameState): void {
  const humanId = state.manager.clubId;
  const squads = squadIndex(state);
  const clubs = Object.values(state.world.clubs).filter((c) => c.id !== humanId && (squads.get(c.id)?.length ?? 0) < MAX_SQUAD);
  if (clubs.length === 0) return;
  const buyer = weightedPick(state.rng, clubs, (c) => Math.sqrt(Math.max(0, financesOf(state, c.id).transferBudget) / 1_000_000) * c.reputation);
  if (!buyer) return;
  const budget = financesOf(state, buyer.id).transferBudget;
  const squad = squads.get(buyer.id) ?? [];
  const tactics = autoTactics(squad, state.date);
  const slots = FORMATIONS[tactics.formation];
  let weakest: { position: Position; rating: number } | null = null;
  tactics.lineup.forEach((id, i) => {
    const p = squad.find((x) => x.id === id);
    const position = slots[i]!.position;
    const rating = p ? positionRating(p, position) : 0;
    if (!weakest || rating < weakest.rating) weakest = { position, rating };
  });
  if (!weakest) return;
  const need = weakest as { position: Position; rating: number };
  // Squad ranks once, rather than per candidate.
  const ranks = new Map<Id, number>();
  for (const members of squads.values()) {
    [...members].sort((a, b) => b.ca - a.ca).forEach((p, i) => ranks.set(p.id, i + 1));
  }
  const price = (p: Player) => (p.clubId ? askingPrice(state, p, ranks.get(p.id)) : 0);
  const agreedIds = new Set(state.transfers.bids.filter((b) => b.status === 'agreed').map((b) => b.playerId));
  const ceiling = attractCeiling(state, buyer);

  const candidates = Object.values(state.world.players).filter((p) => {
    if (p.clubId === buyer.id || p.clubId === humanId || p.retired || p.loan) return false;
    if (agreedIds.has(p.id)) return false;
    if (ageOn(p.dateOfBirth, state.date) > 31 || p.ca > ceiling) return false;
    if (positionRating(p, need.position) < need.rating + 5) return false;
    if (p.clubId && (squads.get(p.clubId)?.length ?? 0) <= MIN_SQUAD) return false;
    if (p.clubId && isKeeper(p) && (squads.get(p.clubId) ?? []).filter(isKeeper).length <= 2) return false;
    if (!willingToJoin(state, p, buyer.id).ok) return false;
    if (price(p) > budget) return false;
    return !sellerBlocks(state, p, buyer.id, price(p), ranks.get(p.id));
  });
  // About half of real Premier League signings come from abroad; the rest of the world isn't
  // simulated, so those players are created when they're signed.
  if (candidates.length === 0 || chance(state.rng, IMPORT_SHARE)) {
    signFromAbroad(state, buyer, need.position, need.rating);
    return;
  }
  const target = weightedPick(state.rng, candidates, (p) => (positionRating(p, need.position) - need.rating) / Math.sqrt(1 + price(p) / 1_000_000));
  const fee = price(target);
  completeTransfer(state, target, buyer.id, fee, wageDemand(state, target, buyer.id), randInt(state.rng, 2, 5));
}

const IMPORT_SHARE = 0.45;

/** Countries clubs sign from abroad, weighted roughly by how often Premier League clubs do. */
const IMPORT_NATIONS: Array<[string, number]> = [
  ['fra', 12], ['esp', 8], ['por', 8], ['bra', 9], ['ned', 7], ['ger', 7], ['ita', 4], ['arg', 5], ['bel', 5],
  ['den', 3], ['nor', 2], ['swe', 3], ['sui', 2], ['cro', 2], ['srb', 2], ['usa', 2], ['col', 2], ['uru', 2],
  ['civ', 3], ['sen', 3], ['nga', 2], ['gha', 2], ['mar', 2], ['jpn', 2], ['kor', 1], ['aut', 1], ['pol', 2], ['cze', 1],
];

/** A computer club signs a player from a league outside the game, created to fit the need. */
function signFromAbroad(state: GameState, buyer: Club, position: Position, current: number, backup = false): void {
  const budget = financesOf(state, buyer.id).transferBudget;
  const nations = IMPORT_NATIONS.filter(([id]) => state.world.nations[id]);
  if (nations.length === 0) return;
  const nation = state.world.nations[weightedPick(state.rng, nations, ([, w]) => w)[0]]!;
  const age = randInt(state.rng, 20, 29);
  // An upgrade on the current starter, as good as the budget allows, and rarely far better
  // than the best player already at the club.
  const squadCa = squadOf(state, buyer.id).map((p) => p.ca).sort((a, b) => b - a);
  const best = squadCa[0] ?? 100;
  // A first-team signing is pitched at the level of the club's best XI, not at a stand-in.
  const level = squadCa.slice(0, 11).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(11, squadCa.length));
  let ca = Math.round(Math.max(current, level - 4) + randInt(state.rng, 3, 12));
  ca = Math.min(ca, best + randInt(state.rng, -4, 6), 185, attractCeiling(state, buyer, 2));
  if (backup) ca = Math.round(level - randInt(state.rng, 12, 25));
  state.transfers.counter++;
  for (let attempt = 0; attempt < 6; attempt++) {
    const player = generatePlayer(state.rng, {
      id: `imp-${state.transfers.counter}-${attempt}`,
      position, ca, age, nationId: nation.id, namePool: nation.namePool, clubId: buyer.id, today: state.date,
    });
    const fee = roundMoney(player.value * (1 + 0.3 * random(state.rng)));
    if (fee > budget) {
      ca -= 6;
      continue;
    }
    player.contract = { wage: wageDemand(state, player, buyer.id), expires: contractEnd(state.date, randInt(state.rng, 3, 5)) };
    player.squadNumber = nextSquadNumber(state, buyer.id);
    state.world.players[player.id] = player;
    financesOf(state, buyer.id).transferBudget -= fee;
    state.transfers.history.push({ date: state.date, playerId: player.id, fromId: null, toId: buyer.id, fee, kind: 'import' });
    return;
  }
}

/** Every computer club keeps two goalkeepers: a free agent if one is good enough, otherwise from abroad. */
function ensureKeepers(state: GameState): void {
  const humanId = state.manager.clubId;
  for (const club of Object.values(state.world.clubs)) {
    if (club.id === humanId) continue;
    let keepers = keeperCount(state, club.id);
    while (keepers < 2) {
      const squadCa = squadOf(state, club.id).map((p) => p.ca).sort((a, b) => b - a);
      const level = squadCa.slice(0, 11).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(11, squadCa.length));
      const wanted = keepers === 0 ? level - 5 : level - 20;
      const ceiling = attractCeiling(state, club);
      const free = Object.values(state.world.players)
        .filter((p) => !p.clubId && !p.retired && isKeeper(p) && p.ca >= wanted && p.ca <= ceiling)
        .sort((a, b) => b.ca - a.ca)[0];
      if (free) completeTransfer(state, free, club.id, 0, wageDemand(state, free, club.id), randInt(state.rng, 1, 3));
      else signFromAbroad(state, club, 'GK', wanted, keepers > 0);
      keepers++;
    }
  }
}

/** Computer clubs pick up free agents when their squads are thin. */
function aiFreeAgents(state: GameState): void {
  const humanId = state.manager.clubId;
  const free = Object.values(state.world.players).filter((p) => !p.clubId && !p.retired && ageOn(p.dateOfBirth, state.date) <= 34);
  if (free.length === 0) return;
  const squads = squadIndex(state);
  // Players don't sign for clubs in poorer leagues far below their level.
  for (const club of Object.values(state.world.clubs)) {
    let size = squads.get(club.id)?.length ?? 0;
    const ceiling = attractCeiling(state, club);
    while (size < MIN_SQUAD + 2) {
      const best = free
        .filter((p) => !p.clubId && p.ca <= ceiling && willingToJoin(state, p, club.id).ok)
        .sort((a, b) => b.ca - a.ca)[0];
      if (!best) break;
      completeTransfer(state, best, club.id, 0, wageDemand(state, best, club.id), randInt(state.rng, 1, 2));
      size++;
    }
  }
}

/**
 * End of June: contracts run out. Computer clubs keep the players they need and let the rest go;
 * the manager's players without a new deal leave as free agents.
 */
function expireContracts(state: GameState): void {
  const humanId = state.manager.clubId;
  const leaving: Player[] = [];
  for (const player of Object.values(state.world.players)) {
    if (!player.clubId || !player.contract || player.contract.expires >= state.date) continue;
    if (player.clubId === humanId) {
      leaving.push(player);
      releasePlayer(state, player);
      continue;
    }
    const age = ageOn(player.dateOfBirth, state.date);
    const keep = squadRank(state, player) <= 20 && age <= 33 && chance(state.rng, 0.75);
    if (keep) player.contract = { wage: wageDemand(state, player, player.clubId), expires: contractEnd(state.date, randInt(state.rng, 1, age >= 30 ? 2 : 4)) };
    else releasePlayer(state, player);
  }
  if (leaving.length > 0) {
    addNews(state, {
      category: 'transfer',
      title: `${leaving.length} player${leaving.length > 1 ? 's' : ''} leave as free agents`,
      body: `Contracts have expired for ${leaving.map((p) => playerLink(p)).join(', ')}.`,
      important: true,
    });
  }
}

/** Reminders in January and May about the manager's contracts that end in June. */
function contractReminder(state: GameState): void {
  const humanId = state.manager.clubId;
  if (!humanId) return;
  const ending = squadOf(state, humanId).filter((p) => p.contract && p.contract.expires <= `${yearOf(state.date)}-06-30`);
  if (ending.length === 0) return;
  addNews(state, {
    category: 'transfer',
    title: `${ending.length} contract${ending.length > 1 ? 's' : ''} end in June`,
    body: `These players will leave on a free transfer unless they sign new deals: ${ending.map((p) => playerLink(p)).join(', ')}. Offer new contracts from their player pages.`,
    important: true,
  });
}

/** Weekly summary of the deals done by other clubs during a window. */
function weeklyRoundUp(state: GameState): void {
  const since = addDays(state.date, -7);
  const deals = state.transfers.history.filter((r) => r.date > since && r.kind !== 'released' && r.toId !== state.manager.clubId && r.fromId !== state.manager.clubId);
  const top = deals.filter((r) => r.toId && state.world.clubs[r.toId]?.leagueId === state.world.clubs[state.manager.clubId ?? '']?.leagueId);
  if (top.length === 0) return;
  const lines = top
    .sort((a, b) => b.fee - a.fee)
    .slice(0, 12)
    .map((r) => {
      const p = state.world.players[r.playerId]!;
      const from = r.fromId ? getClub(state, r.fromId).shortName : 'free agency';
      return `${playerLink(p)}: ${from} → ${clubLink(getClub(state, r.toId!))} (${r.fee > 0 ? formatMoney(r.fee) : 'free'})`;
    });
  addNews(state, { category: 'transfer', title: `Transfer round-up: ${top.length} deal${top.length > 1 ? 's' : ''} this week`, body: lines.join('\n') });
}

/** The daily transfer tick, run before the day's matches. */
export function transferDay(state: GameState): void {
  const md = monthDay(state.date);
  // Order matters on 1 July: loans end, agreed moves (including pre-contracts) go through,
  // then any contracts left running out expire.
  endLoans(state);
  for (const bid of state.transfers.bids) {
    if (bid.status !== 'agreed' || !bid.moveOn || bid.moveOn > state.date) continue;
    const player = state.world.players[bid.playerId];
    if (!player || player.retired || (bid.kind !== 'loan' && player.clubId !== bid.sellerId && player.clubId !== null)) {
      bid.status = 'collapsed';
      bid.note = 'The deal fell through.';
      continue;
    }
    carryOut(state, bid, player);
    if (bid.buyerId === state.manager.clubId || bid.sellerId === state.manager.clubId) {
      const toHuman = bid.buyerId === state.manager.clubId;
      addNews(state, {
        category: 'transfer',
        title: `${player.knownAs ?? player.lastName} ${toHuman ? 'arrives' : 'leaves'}${bid.kind === 'loan' ? ' on loan' : ''}`,
        body: `${playerLink(player)} has ${toHuman ? 'joined you' : `joined ${clubLink(getClub(state, bid.buyerId))}`}${bid.kind === 'loan' ? ` on loan until ${formatShort(bid.loanUntil ?? state.date)}` : ''}, as agreed.`,
      });
    }
  }
  if (md === '07-01') expireContracts(state);
  if (md === '01-02' || md === '05-01') contractReminder(state);

  // Answers to the manager's offers, and offers for their players left unanswered.
  for (const bid of state.transfers.bids) {
    if (bid.status !== 'pending' || bid.respondOn > state.date) continue;
    if (bid.kind === 'loan') {
      answerLoan(state, bid);
    } else if (bid.buyerId === state.manager.clubId) {
      const verdict = sellerVerdict(state, bid);
      bid.status = verdict.status;
      bid.asking = verdict.asking;
      bid.note = verdict.note;
      bidNews(state, bid);
    } else if (bid.sellerId === state.manager.clubId) {
      bid.status = 'withdrawn';
      bid.note = 'No answer in time; the offer lapsed.';
    }
  }
  // Agreed fees and counter-offers don't wait for ever.
  const lapse = addDays(state.date, -14);
  for (const bid of state.transfers.bids) {
    if ((bid.status === 'accepted' || bid.status === 'countered') && bid.respondOn < lapse) {
      bid.status = 'collapsed';
      bid.note = 'Nothing was agreed in time and the deal lapsed.';
    }
  }

  const window = openWindow(state.date);
  if (!window) return;

  const summer = window.name === 'summer';
  // Rates are set for a world of two English divisions; bigger worlds do proportionally more business.
  const scale = Math.max(1, Object.keys(state.world.clubs).length / REFERENCE_CLUBS);
  const deals = poisson(state.rng, (summer ? 1.5 : 0.6) * scale);
  for (let i = 0; i < deals; i++) aiSigning(state);
  if (md === '07-15' || md === '08-20' || md === '01-25') aiFreeAgents(state);
  if (md === '07-03' || md === '08-25' || md === '01-05') ensureKeepers(state);
  for (let loans = (summer ? 0.6 : 0.3) * scale; loans > 0; loans--) {
    if (chance(state.rng, Math.min(1, loans))) aiLoan(state);
  }
  if (state.manager.clubId) {
    // Listing players draws more interest.
    const listed = squadOf(state, state.manager.clubId).some((p) => p.transferListed);
    if (chance(state.rng, (summer ? 0.05 : 0.035) * (listed ? 2 : 1))) aiBidForHumanPlayer(state);
  }
  if (state.manager.clubId && new Date(`${state.date}T00:00:00Z`).getUTCDay() === 1) weeklyRoundUp(state);
}

// ---------- Loans ----------

export type LoanLength = 'january' | 'season';

/** Last day of a loan: the end of December, or the end of the season. */
export function loanEnd(date: ISODate, length: LoanLength): ISODate {
  const year = yearOf(date);
  const inFirstHalf = monthDay(date) >= '06-01';
  if (length === 'january' && inFirstHalf) return `${year}-12-31`;
  return `${inFirstHalf ? year + 1 : year}-06-30`;
}

/** Where a player would rank by ability if they joined a club (1 = best). */
function rankIfJoined(state: GameState, player: Player, clubId: Id): number {
  return squadOf(state, clubId).filter((p) => p.id !== player.id && p.ca > player.ca).length + 1;
}

export function startLoan(state: GameState, player: Player, toId: Id, until: ISODate): void {
  const fromId = player.clubId!;
  if (fromId === state.manager.clubId) removeFromTactics(state, player.id);
  player.clubId = toId;
  player.loan = { fromId, until };
  player.transferListed = false;
  player.squadNumber = nextSquadNumber(state, toId);
  state.transfers.history.push({ date: state.date, playerId: player.id, fromId, toId, fee: 0, kind: 'loan' });
}

/** Players whose loans have finished go back to their clubs. */
function endLoans(state: GameState): void {
  const humanId = state.manager.clubId;
  for (const player of Object.values(state.world.players)) {
    if (!player.loan || player.loan.until >= state.date) continue;
    const { fromId } = player.loan;
    const atId = player.clubId;
    if (atId === humanId) removeFromTactics(state, player.id);
    player.clubId = fromId;
    player.loan = null;
    player.squadNumber = nextSquadNumber(state, fromId);
    state.transfers.history.push({ date: state.date, playerId: player.id, fromId: atId, toId: fromId, fee: 0, kind: 'loanReturn' });
    if (fromId === humanId) {
      addNews(state, { category: 'transfer', title: `${player.knownAs ?? player.lastName} returns from loan`, body: `${playerLink(player)} is back after a loan spell${atId ? ` at ${clubLink(getClub(state, atId))}` : ''}.` });
    }
  }
}

/** The manager asks to borrow a player. Their club answers in a day or two. */
export function requestLoan(state: GameState, playerId: Id, length: LoanLength): ActionResult {
  const buyerId = state.manager.clubId;
  const player = state.world.players[playerId];
  if (!buyerId || !player?.clubId) return { ok: false, message: 'You can only borrow players from other clubs.' };
  if (player.clubId === buyerId) return { ok: false, message: 'They already play for you.' };
  if (player.loan) return { ok: false, message: 'The player is already out on loan.' };
  if (activeBidFor(state, playerId, buyerId)) return { ok: false, message: 'You are already in talks about this player.' };
  if (agreedMoveFor(state, playerId)) return { ok: false, message: 'The player has already agreed a move.' };
  const wage = player.contract?.wage ?? 0;
  const finances = financesOf(state, buyerId);
  if (wageBill(state, buyerId) + committed(state, buyerId).wages + wage > finances.wageBudget) {
    return { ok: false, message: `You would pay the player's ${formatMoney(wage)} a week, which takes you over your wage budget.` };
  }
  newBid(state, {
    playerId, buyerId, sellerId: player.clubId, fee: 0, status: 'pending', created: state.date, respondOn: addDays(state.date, randInt(state.rng, 1, 2)),
    kind: 'loan', loanUntil: loanEnd(moveDate(state.date), length), wage,
  });
  return { ok: true, message: `Loan request sent to ${getClub(state, player.clubId).shortName}. You would pay the player's wages.` };
}

/** The manager offers one of their players out on loan; the best club that would play them answers. */
export function offerLoanOut(state: GameState, playerId: Id, length: LoanLength): ActionResult {
  const humanId = state.manager.clubId;
  const player = state.world.players[playerId];
  if (!humanId || !player || player.clubId !== humanId) return { ok: false, message: 'Only your own players can be loaned out.' };
  if (player.loan) return { ok: false, message: 'You are only borrowing this player.' };
  if (squadOf(state, humanId).length <= 18) return { ok: false, message: 'Your squad is too small to loan players out.' };
  if (isKeeper(player) && keeperCount(state, humanId) <= 2) return { ok: false, message: 'You need to keep at least two goalkeepers.' };
  if (state.transfers.bids.some((b) => b.playerId === playerId && ['pending', 'agreed'].includes(b.status))) {
    return { ok: false, message: 'There is already a deal in progress for this player.' };
  }
  const takers = Object.values(state.world.clubs).filter(
    (c) => c.id !== humanId && squadOf(state, c.id).length < MAX_SQUAD && rankIfJoined(state, player, c.id) <= 13,
  );
  if (takers.length === 0) return { ok: false, message: `No clubs are interested in taking ${player.knownAs ?? player.lastName} on loan right now.` };
  // The biggest club where the player would get games.
  const club = [...takers].sort((a, b) => b.reputation - a.reputation)[0]!;
  newBid(state, {
    playerId, buyerId: club.id, sellerId: humanId, fee: 0, status: 'pending', created: state.date, respondOn: addDays(state.date, randInt(state.rng, 1, 2)),
    kind: 'loan', loanUntil: loanEnd(moveDate(state.date), length), wage: player.contract?.wage ?? 0,
  });
  return { ok: true, message: `Offered to clubs. ${club.shortName} are interested; expect an answer in a day or two.` };
}

/** Answers a loan request (from the manager) or completes a loan the manager offered out. */
function answerLoan(state: GameState, bid: Bid): void {
  const player = state.world.players[bid.playerId];
  if (!player) return;
  const name = player.knownAs ?? player.lastName;
  if (bid.buyerId === state.manager.clubId) {
    const rank = squadRank(state, player);
    const age = ageOn(player.dateOfBirth, state.date);
    let refusal: string | null = null;
    if (rank <= 14) refusal = 'They see the player as part of their first team.';
    else if (age > 24 && rank <= 18) refusal = 'They want to keep the player for squad depth.';
    else if (isKeeper(player) && keeperCount(state, bid.sellerId) <= 2) refusal = 'They cannot spare a goalkeeper.';
    else if (rankIfJoined(state, player, bid.buyerId) > 18) refusal = `${name} would not get enough games at your club.`;
    const seller = getClub(state, bid.sellerId);
    if (refusal) {
      bid.status = 'rejected';
      bid.note = refusal;
      const n = addNews(state, { category: 'transfer', title: `${seller.shortName} turn down your loan request for ${name}`, body: `${refusal}` , important: true });
      n.bidId = bid.id;
      return;
    }
    const when = settleAgreed(state, bid, player);
    const n = addNews(state, {
      category: 'transfer',
      title: `${name} ${when === 'now' ? 'joins on loan' : `joins on loan on ${formatShort(when)}`}`,
      body: `${clubLink(seller)} have agreed to loan you ${playerLink(player)} until ${formatShort(bid.loanUntil ?? state.date)} ${yearOf(bid.loanUntil ?? state.date)}. You pay the wages of ${formatMoney(bid.wage ?? 0)} a week.`,
      important: true,
    });
    n.bidId = bid.id;
    return;
  }
  // A loan the manager offered out: the interested club confirms if they still have room.
  if (squadOf(state, bid.buyerId).length >= MAX_SQUAD) {
    bid.status = 'collapsed';
    bid.note = 'The club no longer has room in their squad.';
  } else {
    const when = settleAgreed(state, bid, player);
    const n = addNews(state, {
      category: 'transfer',
      title: `${name} ${when === 'now' ? 'goes' : 'will go'} on loan to ${getClub(state, bid.buyerId).shortName}`,
      body: `${playerLink(player)} ${when === 'now' ? 'has joined' : `joins on ${formatShort(when)}`} ${clubLink(getClub(state, bid.buyerId))} on loan until ${formatShort(bid.loanUntil ?? state.date)} ${yearOf(bid.loanUntil ?? state.date)}. They pay the wages, and regular games should help the player develop.`,
      important: true,
    });
    n.bidId = bid.id;
  }
}

/** Computer clubs send young players out to get games, usually to smaller clubs or a division down. */
function aiLoan(state: GameState): void {
  const humanId = state.manager.clubId;
  const squads = squadIndex(state);
  const prospects: Player[] = [];
  for (const [clubId, squad] of squads) {
    if (clubId === humanId || squad.length <= 20) continue;
    const ranked = [...squad].sort((a, b) => b.ca - a.ca);
    ranked.forEach((p, i) => {
      if (i >= 16 && !p.loan && !isKeeper(p) && ageOn(p.dateOfBirth, state.date) <= 21 && p.pa - p.ca >= 12) prospects.push(p);
    });
  }
  if (prospects.length === 0) return;
  const player = weightedPick(state.rng, prospects, (p) => p.pa - p.ca);
  const parent = getClub(state, player.clubId!);
  if (agreedMoveFor(state, player.id)) return;
  // Somewhere the player will play, but not a club far below their level; mostly at home.
  const homes = Object.values(state.world.clubs).filter((c) => {
    if (c.id === parent.id || c.id === humanId || c.reputation > parent.reputation) return false;
    const squad = squads.get(c.id) ?? [];
    return squad.length < MAX_SQUAD - 1 && squad.filter((p) => p.ca > player.ca).length < 12 && player.ca <= attractCeiling(state, c, 6);
  });
  if (homes.length === 0) return;
  const home = weightedPick(state.rng, homes, (c) => c.reputation * (c.nationId === parent.nationId ? 3 : 1));
  startLoan(state, player, home.id, loanEnd(state.date, 'season'));
}

/** Recent deals, newest first, for the transfers screen. */
export function recentTransfers(state: GameState, limit = 100): TransferRecord[] {
  return [...state.transfers.history].reverse().slice(0, limit);
}
