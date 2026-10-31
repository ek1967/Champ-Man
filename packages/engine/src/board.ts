/**
 * The board: how much it trusts the manager, the budgets it sets each summer, the manager's
 * contract, and the requests the manager can make (more money, better facilities, a new deal).
 */
import { addDays, formatShort, type ISODate, monthDay, yearOf } from './dates.ts';
import { addNews, clubLink } from './news.ts';
import { roundMoney } from './players.ts';
import { currentSeasonOf, getClub, getCompetition, leaguePosition, squadIndex } from './queries.ts';
import { chance } from './rng.ts';
import { pickBestLineup } from './selection.ts';
import { accountsNews, OWNER_POLICY, ownerOf, setBudgets, settleAccounts } from './finance.ts';
import { committed, financesOf, formatMoney, wageBill } from './transfers.ts';
import type { GameState, Id } from './types.ts';

export type BoardRequestKind = 'transfer' | 'wages' | 'stadium' | 'training' | 'youth' | 'contract';
export type FacilityKind = 'stadium' | 'training' | 'youth';

export interface BoardRequest {
  kind: BoardRequestKind;
  date: ISODate;
  granted: boolean;
  note: string;
}

export interface FacilityProject {
  kind: FacilityKind;
  started: ISODate;
  due: ISODate;
}

export interface BoardState {
  /** 0–100: how much the board trusts the manager. */
  confidence: number;
  contract: { expires: ISODate; wage: number };
  requests: BoardRequest[];
  projects: FacilityProject[];
  /** Upgrades the board has paid for at the manager's club, 0–3 each. */
  facilities: Record<FacilityKind, number>;
  /** Seasons already judged at their end. */
  judged: Id[];
  /** Last month the board's mood was updated ('YYYY-MM'). */
  lastReview?: string;
  warned?: boolean;
}

export const MAX_FACILITY_LEVEL = 3;

/** How long each request makes the manager wait before asking for the same thing again (days). */
const COOLDOWN: Record<BoardRequestKind, number> = { transfer: 90, wages: 90, stadium: 365, training: 180, youth: 180, contract: 120 };

/** Days before asking again after a refusal. */
const REFUSAL_WAIT = 45;

/** How long building work takes (days). */
const BUILD_DAYS: Record<FacilityKind, number> = { stadium: 300, training: 120, youth: 150 };

/** The board's state, created when first needed (older saves have none). */
export function board(state: GameState): BoardState {
  if (!state.board) {
    const club = state.manager.clubId ? state.world.clubs[state.manager.clubId] : undefined;
    const rep = club?.reputation ?? 50;
    state.board = {
      confidence: 60,
      contract: { expires: `${yearOf(state.date) + 2}-06-30`, wage: roundMoney(2_000 + rep * rep * 6) },
      requests: [],
      projects: [],
      facilities: { stadium: 0, training: 0, youth: 0 },
      judged: [],
    };
  }
  return state.board;
}

/** Facility upgrades at a club: only the manager's club has any. */
export function facilityLevel(state: GameState, clubId: Id | null | undefined, kind: FacilityKind): number {
  if (!clubId || clubId !== state.manager.clubId || !state.board) return 0;
  return state.board.facilities[kind];
}

// ---------- Expectations ----------

/** What the board expects, from how strong the squad is against its league rivals. */
export function boardTarget(state: GameState, clubId: Id): { text: string; position: number } {
  const club = getClub(state, clubId);
  const squads = squadIndex(state);
  const rivals = Object.values(state.world.clubs)
    .filter((c) => c.leagueId === club.leagueId)
    .map((c) => ({ id: c.id, strength: pickBestLineup(squads.get(c.id) ?? []).strength }))
    .sort((a, b) => b.strength - a.strength);
  const rank = rivals.findIndex((c) => c.id === clubId) + 1;
  const n = rivals.length;
  const rules = getCompetition(state, club.leagueId).rules;
  const safe = n - (rules.relegation?.places ?? 0);
  if (rank <= 2) return { text: 'win the title', position: rank === 1 ? 1 : 2 };
  if (rules.split) {
    const half = Math.ceil(n / rules.split.groups);
    return rank <= half ? { text: `finish in the top ${half}`, position: half } : { text: 'avoid relegation', position: safe };
  }
  if (rank <= Math.round(n / 4)) return { text: 'finish in the top four', position: 4 };
  if (rank <= Math.round(n * 0.6)) return { text: 'finish in the top half', position: Math.floor(n / 2) };
  return { text: 'avoid relegation', position: safe };
}

/** "Delighted", "Pleased", ... for the board's confidence. */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 85) return 'Delighted';
  if (confidence >= 70) return 'Pleased';
  if (confidence >= 55) return 'Satisfied';
  if (confidence >= 40) return 'Concerned';
  if (confidence >= 25) return 'Unhappy';
  return 'Losing patience';
}

function adjust(state: GameState, by: number): void {
  const b = board(state);
  b.confidence = Math.max(0, Math.min(100, Math.round((b.confidence + by) * 10) / 10));
}

/** After each of the manager's league matches. */
export function boardAfterMatch(state: GameState, goalsFor: number, goalsAgainst: number): void {
  if (!state.manager.clubId) return;
  adjust(state, goalsFor > goalsAgainst ? 1 : goalsFor === goalsAgainst ? 0 : -1);
}

// ---------- Money ----------

/** €1K a week in wages for a season is worth this much transfer budget. */
export const WEEKS_PER_SEASON = 52;

/**
 * Moves money between the budgets: `perWeek` > 0 turns transfer budget into wage budget
 * (€52 of transfer money per €1 a week), < 0 turns wage budget back into transfer money.
 */
export function shiftBudget(state: GameState, perWeek: number): { ok: boolean; message: string } {
  const clubId = state.manager.clubId;
  if (!clubId || perWeek === 0) return { ok: false, message: 'Nothing to move.' };
  const f = financesOf(state, clubId);
  const lump = Math.round(Math.abs(perWeek) * WEEKS_PER_SEASON);
  if (perWeek > 0) {
    const available = f.transferBudget - committed(state, clubId).fees;
    if (lump > available) return { ok: false, message: `That needs ${formatMoney(lump)} of transfer budget; you have ${formatMoney(Math.max(0, available))} free.` };
    f.transferBudget -= lump;
    f.wageBudget += perWeek;
    return { ok: true, message: `Moved ${formatMoney(lump)} into wages: ${formatMoney(perWeek)} a week more to spend on wages.` };
  }
  const room = f.wageBudget - wageBill(state, clubId) - committed(state, clubId).wages;
  if (-perWeek > room) return { ok: false, message: `Only ${formatMoney(Math.max(0, room))} a week of the wage budget is unused.` };
  f.wageBudget += perWeek;
  f.transferBudget += lump;
  return { ok: true, message: `Moved ${formatMoney(-perWeek)} a week out of wages: ${formatMoney(lump)} more for transfers.` };
}

/** How much more (or less) than the owner's usual share the board lets the manager spend. */
export function confidenceScale(confidence: number): number {
  return 0.6 + (confidence / 100) * 0.8;
}

/**
 * The summer budgets (28 June, the day after the accounts): every club gets a transfer budget from
 * its cash in the bank and a wage budget from its income, by its owner's policy (finance.ts). The
 * manager's board gives more or less than usual depending on its confidence.
 */
function setSeasonBudgets(state: GameState): void {
  const humanId = state.manager.clubId;
  for (const club of Object.values(state.world.clubs)) {
    if (club.id !== humanId) {
      setBudgets(state, club.id);
      continue;
    }
    const b = board(state);
    const f = setBudgets(state, club.id, confidenceScale(b.confidence), b.facilities.stadium);
    accountsNews(state, club.id);
    addNews(state, {
      category: 'club',
      title: `Budgets for ${yearOf(state.date)}-${String((yearOf(state.date) + 1) % 100).padStart(2, '0')}`,
      body: [
        `The board has set your budgets for the new season: ${formatMoney(f.transferBudget)} for transfers and ${formatMoney(f.wageBudget)} a week for wages.`,
        `The club has ${formatMoney(f.cash ?? 0)} in the bank. ${OWNER_POLICY[ownerOf(club)].label}: ${OWNER_POLICY[ownerOf(club)].description}`,
        `The board is ${confidenceLabel(b.confidence).toLowerCase()} with your work. You can move money between the budgets, or ask for more, on the Board screen.`,
      ].join('\n\n'),
      important: true,
    });
  }
}

// ---------- Requests ----------

export interface RequestOption {
  kind: BoardRequestKind;
  label: string;
  description: string;
  /** Why it can't be asked for now, if it can't. */
  blocked: string | null;
}

const REQUEST_TEXT: Record<BoardRequestKind, [string, string]> = {
  transfer: ['More transfer money', 'Ask for extra funds to spend on fees.'],
  wages: ['A bigger wage budget', 'Ask for more room to pay players.'],
  stadium: ['Expand the stadium', 'Bigger crowds bring in more money every season and make the club more attractive. Takes about ten months.'],
  training: ['Better training facilities', 'Players develop faster. Takes about four months.'],
  youth: ['Invest in the youth academy', 'Better and more youngsters in each intake. Takes about five months.'],
  contract: ['A new contract for you', 'Ask for a longer deal on better terms.'],
};

export function requestOptions(state: GameState): RequestOption[] {
  const b = board(state);
  return (Object.keys(REQUEST_TEXT) as BoardRequestKind[]).map((kind) => {
    const [label, description] = REQUEST_TEXT[kind];
    const last = [...b.requests].reverse().find((r) => r.kind === kind);
    let blocked: string | null = null;
    // After a refusal the board will listen again sooner than after saying yes.
    const wait = last ? (last.granted ? COOLDOWN[kind] : Math.min(COOLDOWN[kind], REFUSAL_WAIT)) : 0;
    if (last && addDays(last.date, wait) > state.date) {
      const again = addDays(last.date, wait);
      blocked = `You asked on ${formatShort(last.date)}; the board won't discuss it again until ${formatShort(again)} ${yearOf(again)}.`;
    }
    if (kind === 'stadium' || kind === 'training' || kind === 'youth') {
      if (b.projects.some((p) => p.kind === kind)) blocked = 'Work is already under way.';
      else if (b.facilities[kind] >= MAX_FACILITY_LEVEL) blocked = 'Already as good as the board will make it.';
    }
    return { kind, label, description, blocked };
  });
}

/** The manager asks the board for something. The answer depends mostly on the board's confidence. */
export function requestFromBoard(state: GameState, kind: BoardRequestKind): { ok: boolean; message: string } {
  const clubId = state.manager.clubId;
  if (!clubId) return { ok: false, message: 'You need a club first.' };
  const option = requestOptions(state).find((o) => o.kind === kind)!;
  if (option.blocked) return { ok: false, message: option.blocked };
  const b = board(state);
  const c = b.confidence;
  const f = financesOf(state, clubId);
  let granted = false;
  let note: string;
  switch (kind) {
    case 'transfer': {
      const cash = f.cash ?? 0;
      const free = cash - f.transferBudget;
      if (free <= 1_000_000) {
        note = 'The board say there is no more money in the bank to give you.';
      } else if (c >= 60 || (c >= 45 && chance(state.rng, 0.4))) {
        const extra = roundMoney(Math.max(500_000, free * Math.min(0.5, 0.15 + (c - 60) / 100)));
        f.transferBudget += extra;
        granted = true;
        note = `The board has found an extra ${formatMoney(extra)} for transfers from the club's ${formatMoney(cash)} in the bank.`;
        adjust(state, -3);
      } else {
        note = 'The board want to see better results before they spend more.';
      }
      break;
    }
    case 'wages': {
      if (c >= 55 || (c >= 40 && chance(state.rng, 0.4))) {
        const extra = roundMoney(Math.max(f.wageBudget * 0.08, 5_000));
        f.wageBudget += extra;
        granted = true;
        note = `The wage budget goes up by ${formatMoney(extra)} a week.`;
        adjust(state, -3);
      } else {
        note = 'The board think the wage bill is high enough for now.';
      }
      break;
    }
    case 'stadium':
    case 'training':
    case 'youth': {
      const needed = kind === 'stadium' ? 70 : kind === 'training' ? 60 : 55;
      if (c >= needed) {
        const due = addDays(state.date, BUILD_DAYS[kind]);
        b.projects.push({ kind, started: state.date, due });
        granted = true;
        note = `The board has approved the work. It should be finished by ${formatShort(due)} ${yearOf(due)}.`;
      } else {
        note = `The board aren't ready to invest in that yet. They'd need to be ${confidenceLabel(needed).toLowerCase()} with your work.`;
      }
      break;
    }
    case 'contract': {
      const left = (Date.parse(b.contract.expires) - Date.parse(state.date)) / (365.25 * 86_400_000);
      if (c >= 70 && left < 2.5) {
        b.contract = { expires: `${yearOf(b.contract.expires) + 2}-06-30`, wage: roundMoney(b.contract.wage * 1.25) };
        granted = true;
        note = `The board offer you a new deal until ${formatShort(b.contract.expires)} ${yearOf(b.contract.expires)} on ${formatMoney(b.contract.wage)} a week. You accept.`;
      } else if (c >= 70) {
        note = 'The board point out you already have plenty of time left on your contract.';
      } else {
        note = 'The board want to see more before they commit to you for longer.';
      }
      break;
    }
  }
  b.requests.push({ kind, date: state.date, granted, note });
  addNews(state, {
    category: 'club',
    title: `${REQUEST_TEXT[kind][0]}: ${granted ? 'agreed' : 'turned down'}`,
    body: note,
  });
  return { ok: granted, message: note };
}

// ---------- The daily tick ----------

function finishProjects(state: GameState): void {
  const b = state.board;
  const clubId = state.manager.clubId;
  if (!b || !clubId) return;
  const done = b.projects.filter((p) => p.due <= state.date);
  if (done.length === 0) return;
  b.projects = b.projects.filter((p) => p.due > state.date);
  const club = getClub(state, clubId);
  for (const p of done) {
    b.facilities[p.kind] = Math.min(MAX_FACILITY_LEVEL, b.facilities[p.kind] + 1);
    if (p.kind === 'stadium') club.reputation = Math.min(100, club.reputation + 2);
    const what = p.kind === 'stadium' ? 'The stadium expansion' : p.kind === 'training' ? 'The new training facilities' : 'The youth academy upgrade';
    const effect = p.kind === 'stadium'
      ? 'More fans means more money each summer, and the club is a little more attractive to players.'
      : p.kind === 'training' ? 'Players will develop a little faster.' : 'Future intakes will be better and a little bigger.';
    addNews(state, { category: 'club', title: `${what} is finished`, body: `${what} at ${clubLink(club)} is complete. ${effect}`, important: true });
  }
}

/** Once a month, during the season: is the side where the board expects it to be? */
function monthlyReview(state: GameState): void {
  const clubId = state.manager.clubId;
  const b = state.board;
  if (!clubId || !b) return;
  const month = state.date.slice(0, 7);
  if (b.lastReview === month) return;
  b.lastReview = month;
  const club = getClub(state, clubId);
  const season = currentSeasonOf(state, club.leagueId);
  if (!season || season.status !== 'inProgress') return;
  const position = leaguePosition(state, clubId);
  if (position === null) return;
  const target = boardTarget(state, clubId).position;
  adjust(state, position <= target ? 2 : position <= target + 3 ? 0 : -3);
  if (b.confidence < 25 && !b.warned) {
    b.warned = true;
    addNews(state, {
      category: 'club',
      title: 'The board are losing patience',
      body: `The board are unhappy with results at ${clubLink(club)}. They expect you to ${boardTarget(state, clubId).text}, and things need to improve.`,
      important: true,
    });
  } else if (b.confidence >= 40) {
    b.warned = false;
  }
}

/** At the end of the manager's league season: did they do what the board asked? */
function judgeSeason(state: GameState): void {
  const clubId = state.manager.clubId;
  const b = state.board;
  if (!clubId || !b) return;
  const club = getClub(state, clubId);
  const season = currentSeasonOf(state, club.leagueId);
  if (!season || season.status !== 'finished' || !season.final || b.judged.includes(season.id)) return;
  b.judged.push(season.id);
  const position = season.final.order.indexOf(clubId) + 1;
  const target = boardTarget(state, clubId);
  const met = position <= target.position;
  adjust(state, met ? 12 + Math.max(0, target.position - position) * 2 : -15);
  addNews(state, {
    category: 'club',
    title: met ? 'The board are pleased with the season' : 'The board are disappointed with the season',
    body: `The board asked you to ${target.text}; you finished in position ${position}. They are now ${confidenceLabel(b.confidence).toLowerCase()} with your work.`,
    important: true,
  });
}

export function boardDay(state: GameState): void {
  if (state.manager.clubId) board(state);
  finishProjects(state);
  monthlyReview(state);
  judgeSeason(state);
  if (monthDay(state.date) === '06-27') settleAccounts(state, (id) => facilityLevel(state, id, 'stadium'));
  // The first summer's budgets are the ones the game starts with.
  if (monthDay(state.date) === '06-28' && Object.values(state.seasons).some((s) => s.status === 'finished')) setSeasonBudgets(state);
}
