/**
 * Transfer market (PLAN §7.5): windows, budgets, asking prices, bids and counter-bids, personal
 * terms, contract renewals and expiry, free agents, and the computer clubs trading among
 * themselves. Everything is driven from the daily tick (`transferDay`).
 */
import type { Position } from './attributes.ts';
import { addDays, ageOn, formatShort, type ISODate, makeDate, monthDay, yearOf } from './dates.ts';
import { addNews, clubLink, playerLink } from './news.ts';
import { estimateWage, positionRating, roundMoney } from './players.ts';
import { getClub, squadIndex, squadOf } from './queries.ts';
import { chance, poisson, random, randInt, weightedPick } from './rng.ts';
import { autoTactics, FORMATIONS } from './tactics.ts';
import type { Bid, Club, ClubFinances, GameState, Id, Player, TransferRecord } from './types.ts';

// ---------- Windows ----------

/** English windows ('MM-DD', inclusive). Other nations get their own when they arrive. */
export const TRANSFER_WINDOWS: ReadonlyArray<{ name: string; open: string; close: string }> = [
  { name: 'summer', open: '06-15', close: '09-01' },
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
  return {
    transferBudget: roundMoney(Math.max(1_000_000, 230_000_000 * r ** 4.5)),
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
  if (recentlySigned(state, player.id)) return 'They only signed the player recently and will not sell.';
  const seller = getClub(state, player.clubId);
  const buyer = getClub(state, buyerId);
  if (rank <= 5 && buyer.reputation < seller.reputation + 5 && fee < askingPrice(state, player, rank) * 1.6) {
    return 'He is a key player and they will not sell to a club of your size.';
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

function nextSquadNumber(state: GameState, clubId: Id): number {
  const used = new Set(squadOf(state, clubId).map((p) => p.squadNumber));
  let n = 2;
  while (used.has(n)) n++;
  return n;
}

function removeFromTactics(state: GameState, playerId: Id): void {
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
  player.transferListed = false;
  player.squadNumber = nextSquadNumber(state, toId);
  player.contract = { wage, expires: contractEnd(state.date, years) };
  const record: TransferRecord = { date: state.date, playerId: player.id, fromId, toId, fee, kind: fromId ? 'transfer' : 'free' };
  state.transfers.history.push(record);
  // Pending bids for this player from anyone else lapse.
  for (const bid of state.transfers.bids) {
    if (bid.playerId === player.id && (bid.status === 'pending' || bid.status === 'countered' || bid.status === 'accepted')) {
      bid.status = 'collapsed';
      bid.note = `${player.knownAs ?? player.lastName} has joined ${getClub(state, toId).shortName}.`;
    }
  }
  return record;
}

function releasePlayer(state: GameState, player: Player): void {
  const fromId = player.clubId;
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
  if (!openWindow(state.date)) return { ok: false, message: `The transfer window is closed. It opens on ${formatShort(nextWindowOpens(state.date))}.` };
  if (fee > financesOf(state, buyerId).transferBudget) return { ok: false, message: 'That is more than your transfer budget.' };
  const existing = activeBidFor(state, playerId, buyerId);
  if (existing && existing.status === 'pending') return { ok: false, message: 'You are already waiting for an answer on this player.' };
  if (existing) existing.status = 'withdrawn';
  newBid(state, { playerId, buyerId, sellerId: player.clubId, fee, status: 'pending', created: state.date, respondOn: addDays(state.date, randInt(state.rng, 1, 2)) });
  return { ok: true, message: `Offer of ${formatMoney(fee)} sent to ${getClub(state, player.clubId).shortName}. Expect an answer in a day or two.` };
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

/**
 * Personal terms: after a fee is agreed (or for a free agent), offer the player a contract.
 * Completes the move on the spot if they accept.
 */
export function offerContract(state: GameState, playerId: Id, offer: ContractOffer): ActionResult {
  const buyerId = state.manager.clubId;
  const player = state.world.players[playerId];
  if (!buyerId || !player) return { ok: false, message: 'You need a club to sign players.' };
  if (!openWindow(state.date) && player.clubId) return { ok: false, message: 'The transfer window is closed.' };
  const bid = player.clubId ? state.transfers.bids.find((b) => b.playerId === playerId && b.buyerId === buyerId && b.status === 'accepted') : undefined;
  if (player.clubId && !bid) return { ok: false, message: 'Agree a fee with their club first.' };
  const finances = financesOf(state, buyerId);
  if (wageBill(state, buyerId) + offer.wage > finances.wageBudget) {
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
  completeTransfer(state, player, buyerId, bid?.fee ?? 0, offer.wage, offer.years);
  if (bid) bid.status = 'completed';
  addNews(state, {
    category: 'transfer',
    title: `${name} signs`,
    body: `${playerLink(player)} has signed a ${offer.years}-year contract worth ${formatMoney(offer.wage)} a week${bid ? ` after a ${formatMoney(bid.fee)} transfer` : ' on a free transfer'}.`,
  });
  return { ok: true, message: `${name} has signed!` };
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
  const squad = squadOf(state, humanId);
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
  if (!openWindow(state.date)) {
    bid.status = 'collapsed';
    return { ok: false, message: 'The transfer window has closed.' };
  }
  completeTransfer(state, player, bid.buyerId, bid.fee, wageDemand(state, player, bid.buyerId), randInt(state.rng, 2, 5));
  bid.status = 'completed';
  return { ok: true, message: `${player.knownAs ?? player.lastName} has joined ${getClub(state, bid.buyerId).shortName} for ${formatMoney(bid.fee)}.` };
}

// ---------- Computer clubs ----------

const MIN_SQUAD = 20;
const MAX_SQUAD = 30;

/** One computer-club signing: strengthen the weakest position in their best XI. */
function aiSigning(state: GameState): void {
  const humanId = state.manager.clubId;
  const squads = squadIndex(state);
  const clubs = Object.values(state.world.clubs).filter((c) => c.id !== humanId && (squads.get(c.id)?.length ?? 0) < MAX_SQUAD);
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
    if (position !== 'GK' && (!weakest || rating < weakest.rating)) weakest = { position, rating };
  });
  if (!weakest) return;
  const need = weakest as { position: Position; rating: number };
  // Squad ranks once, rather than per candidate.
  const ranks = new Map<Id, number>();
  for (const members of squads.values()) {
    [...members].sort((a, b) => b.ca - a.ca).forEach((p, i) => ranks.set(p.id, i + 1));
  }
  const price = (p: Player) => (p.clubId ? askingPrice(state, p, ranks.get(p.id)) : 0);

  const candidates = Object.values(state.world.players).filter((p) => {
    if (p.clubId === buyer.id || p.clubId === humanId) return false;
    if (ageOn(p.dateOfBirth, state.date) > 31) return false;
    if (positionRating(p, need.position) < need.rating + 5) return false;
    if (p.clubId && (squads.get(p.clubId)?.length ?? 0) <= MIN_SQUAD) return false;
    if (!willingToJoin(state, p, buyer.id).ok) return false;
    if (price(p) > budget) return false;
    return !sellerBlocks(state, p, buyer.id, price(p), ranks.get(p.id));
  });
  if (candidates.length === 0) return;
  const target = weightedPick(state.rng, candidates, (p) => (positionRating(p, need.position) - need.rating) / Math.sqrt(1 + price(p) / 1_000_000));
  const fee = price(target);
  completeTransfer(state, target, buyer.id, fee, wageDemand(state, target, buyer.id), randInt(state.rng, 2, 5));
}

/** Computer clubs pick up free agents when their squads are thin. */
function aiFreeAgents(state: GameState): void {
  const humanId = state.manager.clubId;
  const free = Object.values(state.world.players).filter((p) => !p.clubId && ageOn(p.dateOfBirth, state.date) <= 34);
  if (free.length === 0) return;
  const squads = squadIndex(state);
  for (const club of Object.values(state.world.clubs)) {
    let size = squads.get(club.id)?.length ?? 0;
    while (size < MIN_SQUAD + 2) {
      const best = free.filter((p) => !p.clubId && willingToJoin(state, p, club.id).ok).sort((a, b) => b.ca - a.ca)[0];
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
  if (md === '07-01') expireContracts(state);
  if (md === '01-02' || md === '05-01') contractReminder(state);

  // Answers to the manager's bids, and offers for their players that were left unanswered.
  for (const bid of state.transfers.bids) {
    if (bid.status !== 'pending' || bid.respondOn > state.date) continue;
    if (bid.buyerId === state.manager.clubId) {
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

  const window = openWindow(state.date);
  if (!window) {
    // Deals not completed by the deadline fall through.
    for (const bid of state.transfers.bids) {
      if (bid.status === 'accepted' || bid.status === 'countered') {
        bid.status = 'collapsed';
        bid.note = 'The transfer window closed before the deal was done.';
      }
    }
    return;
  }

  const summer = window.name === 'summer';
  const deals = poisson(state.rng, summer ? 1.2 : 0.6);
  for (let i = 0; i < deals; i++) aiSigning(state);
  if (md === '07-15' || md === '08-20' || md === '01-25') aiFreeAgents(state);
  if (state.manager.clubId && chance(state.rng, summer ? 0.05 : 0.035)) aiBidForHumanPlayer(state);
  if (state.manager.clubId && new Date(`${state.date}T00:00:00Z`).getUTCDay() === 1) weeklyRoundUp(state);
}

/** Recent deals, newest first, for the transfers screen. */
export function recentTransfers(state: GameState, limit = 100): TransferRecord[] {
  return [...state.transfers.history].reverse().slice(0, limit);
}
