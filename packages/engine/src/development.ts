/**
 * Player development, youth intake and retirement (PLAN §7.5).
 *
 * Monthly: young players grow towards their Potential Ability, faster when they play, work hard
 * and train at a bigger club; players past their peak decline, physical attributes first.
 * Each spring every club takes on a youth intake; each summer older players retire.
 */
import {
  ALL_ATTRIBUTES, type AttributeKey, clampAttribute, GOALKEEPING, MENTAL, PHYSICAL, type Position,
  POSITION_PROFILES,
} from './attributes.ts';
import { ageOn, type ISODate, monthDay, yearOf } from './dates.ts';
import { addNews, playerLink } from './news.ts';
import { abilityStars, estimateValue, estimateWage, generatePlayer, mainPosition } from './players.ts';
import { currentSeasonOf, squadIndex, squadOf } from './queries.ts';
import { chance, normal, randInt, type Rng, weightedPick } from './rng.ts';
import { contractEnd, financesOf, MAX_SQUAD, nextSquadNumber, releasePlayer, removeFromTactics } from './transfers.ts';
import type { Club, GameState, Id, Player } from './types.ts';

export const DEVELOPMENT = {
  /** Share of the gap to potential closed each month, by age. */
  growthByAge: { 16: 0.034, 17: 0.032, 18: 0.029, 19: 0.026, 20: 0.022, 21: 0.018, 22: 0.014, 23: 0.01, 24: 0.007, 25: 0.006, 26: 0.004, 27: 0.003 } as Record<number, number>,
  /** Ability lost per month, by age (goalkeepers count as three years younger). */
  declineByAge: { 30: 0.12, 31: 0.22, 32: 0.38, 33: 0.55, 34: 0.75, 35: 1.0, 36: 1.25 } as Record<number, number>,
  /** Attribute points per point of Current Ability. */
  attributePointsPerAbility: 2.4,
} as const;

const PHYSICAL_KEYS = new Set<string>(PHYSICAL);
const MENTAL_KEYS = new Set<string>(MENTAL);
const GK_KEYS = new Set<string>(GOALKEEPING);
const PACE_KEYS = new Set(['pace', 'acceleration', 'agility', 'stamina']);

/** Share of their club's league matches a player started this season (0.5 when unknown). */
export function playingTime(state: GameState, player: Player): number {
  if (!player.clubId) return 0.3;
  const club = state.world.clubs[player.clubId];
  const season = club ? currentSeasonOf(state, club.leagueId) : null;
  if (!season || state.world.competitions[season.competitionId]?.mode !== 'playable') return 0.5;
  const played = season.fixtureIds.filter((id) => {
    const f = state.fixtures[id];
    return f?.result && (f.homeId === player.clubId || f.awayId === player.clubId);
  }).length;
  if (played < 4) return 0.5;
  const apps = player.stats.find((s) => s.season === season.label && s.competitionId === season.competitionId && s.clubId === player.clubId)?.apps ?? 0;
  return Math.min(1, apps / played);
}

/** How much ability a player gains (or loses) this month. */
export function monthlyChange(state: GameState, player: Player): number {
  const age = ageOn(player.dateOfBirth, state.date);
  const keeper = mainPosition(player) === 'GK';
  const declineAge = keeper ? age - 3 : age;
  if (declineAge >= 30) {
    const base = DEVELOPMENT.declineByAge[Math.min(36, declineAge)] ?? 1.25;
    // Naturally fit players last longer.
    return -base * (1.3 - (player.attributes.fitness / 20) * 0.6);
  }
  const rate = DEVELOPMENT.growthByAge[Math.max(16, Math.min(27, age))] ?? 0;
  if (rate === 0 || player.ca >= player.pa) return 0;
  const h = player.hidden;
  const attitude = 0.6 + ((h.professionalism + player.attributes.determination) / 40) * 0.8;
  const minutes = 0.7 + 0.6 * playingTime(state, player);
  const club = player.clubId ? state.world.clubs[player.clubId] : undefined;
  const facilities = 0.85 + ((club?.reputation ?? 30) / 100) * 0.3;
  return (player.pa - player.ca) * rate * attitude * minutes * facilities * (1 + normal(state.rng, 0, 0.25));
}

/** Which attributes move when ability changes: growth follows the position, decline hits the legs first. */
function attributeWeight(key: AttributeKey, main: Position, age: number, growing: boolean): number {
  const keeper = main === 'GK';
  if (!keeper && GK_KEYS.has(key)) return 0;
  if (growing) {
    const profile = POSITION_PROFILES[main][key] ?? 0.15;
    if (PHYSICAL_KEYS.has(key)) return age <= 21 ? profile + 0.3 : profile * 0.3;
    if (MENTAL_KEYS.has(key)) return profile + (age >= 22 ? 0.25 : 0.1);
    return profile + 0.05;
  }
  if (PACE_KEYS.has(key)) return 1.5;
  if (PHYSICAL_KEYS.has(key)) return 0.9;
  if (MENTAL_KEYS.has(key)) return 0.1;
  return 0.35;
}

export function shiftAttributes(rng: Rng, player: Player, points: number, age: number): void {
  const main = mainPosition(player);
  const growing = points > 0;
  const keys = ALL_ATTRIBUTES.filter((k) => attributeWeight(k, main, age, growing) > 0);
  for (let i = 0; i < Math.abs(points); i++) {
    const options = keys.filter((k) => (growing ? player.attributes[k] < 20 : player.attributes[k] > 1));
    if (options.length === 0) return;
    const key = weightedPick(rng, options, (k) => attributeWeight(k, main, age, growing));
    player.attributes[key] = clampAttribute(player.attributes[key] + (growing ? 1 : -1));
  }
}

/** Applies a month of development to one player. Returns the whole-point change in ability. */
export function developPlayer(state: GameState, player: Player): number {
  const exact = monthlyChange(state, player) + player.growthCarry;
  const whole = exact >= 0 ? Math.floor(exact) : Math.ceil(exact);
  player.growthCarry = exact - whole;
  if (whole !== 0) {
    const before = player.ca;
    player.ca = Math.max(1, Math.min(whole > 0 ? player.pa : 200, player.ca + whole));
    const applied = player.ca - before;
    const age = ageOn(player.dateOfBirth, state.date);
    const points = Math.round(applied * DEVELOPMENT.attributePointsPerAbility + normal(state.rng, 0, 0.5));
    shiftAttributes(state.rng, player, points, age);
  }
  player.value = estimateValue(player.ca, player.pa, ageOn(player.dateOfBirth, state.date));
  player.abilityHistory = [...player.abilityHistory, [state.date, player.ca] as [ISODate, number]].slice(-36);
  return whole;
}

function monthlyDevelopment(state: GameState): void {
  const humanId = state.manager.clubId;
  const changes: Array<{ player: Player; change: number }> = [];
  for (const player of Object.values(state.world.players)) {
    if (player.retired) continue;
    const before = player.ca;
    developPlayer(state, player);
    if (player.clubId && player.clubId === humanId && player.ca !== before) changes.push({ player, change: player.ca - before });
  }
  if (!humanId || !['01-01', '04-01', '10-01'].includes(monthDay(state.date))) return;
  // A coaching report three times a season: who is coming on, who is fading.
  const risers = changes.filter((c) => c.change > 0).sort((a, b) => b.change - a.change).slice(0, 5);
  const fallers = changes.filter((c) => c.change < 0).sort((a, b) => a.change - b.change).slice(0, 3);
  const history = (p: Player) => {
    const old = p.abilityHistory.find(([d]) => d >= `${yearOf(state.date) - 1}${state.date.slice(4)}`)?.[1] ?? p.ca;
    return `${abilityStars(old)}★ → ${abilityStars(p.ca)}★`;
  };
  const lines: string[] = [];
  if (risers.length > 0) lines.push(`Improving:\n${risers.map((c) => `${playerLink(c.player)} (${history(c.player)})`).join('\n')}`);
  if (fallers.length > 0) lines.push(`Past their best:\n${fallers.map((c) => `${playerLink(c.player)} (${history(c.player)})`).join('\n')}`);
  if (lines.length > 0) addNews(state, { category: 'club', title: 'Coaching report', body: lines.join('\n\n') });
}

// ---------- Youth intake ----------

const YOUTH_POSITIONS: Array<[Position, number]> = [
  ['GK', 10], ['DC', 17], ['DL', 6], ['DR', 6], ['DM', 8], ['MC', 15], ['ML', 4], ['MR', 4],
  ['AML', 6], ['AMR', 6], ['AMC', 6], ['ST', 12],
];

/** Where an English academy's players come from. */
const ACADEMY_NATIONS: Array<[string, number]> = [
  ['eng', 74], ['sco', 4], ['wal', 4], ['irl', 4], ['nir', 2], ['fra', 3], ['esp', 2], ['por', 2], ['ned', 2], ['bra', 1], ['ger', 2],
];

/** How good a club's academy is, 1–20, from its size. */
export function academyRating(club: Club): number {
  return Math.max(1, Math.min(20, Math.round(4 + (club.reputation / 100) * 15)));
}

export function generateYouthPlayer(state: GameState, club: Club, index: number): Player {
  const rng = state.rng;
  const nations = ACADEMY_NATIONS.filter(([id]) => state.world.nations[id]);
  const nationId = weightedPick(rng, nations, ([, w]) => w)[0];
  const nation = state.world.nations[nationId]!;
  const position = weightedPick(rng, YOUTH_POSITIONS, ([, w]) => w)[0];
  const academy = academyRating(club);
  // Potential: most intakes are ordinary, a few are special; bigger academies find more of them.
  let pa = normal(rng, 70 + academy * 3.5, 22);
  if (chance(rng, 0.01 + academy / 1000)) pa = randInt(rng, 165, 195);
  pa = Math.round(Math.max(55, Math.min(198, pa)));
  const age = chance(rng, 0.7) ? 16 : 17;
  const ca = Math.round(Math.max(25, Math.min(pa - 15, pa * (age === 16 ? 0.42 : 0.48) + normal(rng, 0, 6))));
  const player = generatePlayer(rng, {
    id: `y${yearOf(state.date)}-${club.id}-${index}`,
    position,
    ca,
    age,
    nationId,
    namePool: nation.namePool,
    clubId: club.id,
    today: state.date,
  });
  player.pa = Math.max(pa, ca);
  player.value = estimateValue(player.ca, player.pa, age);
  player.contract = { wage: Math.max(500, Math.round(estimateWage(ca) / 2)), expires: contractEnd(state.date, 3) };
  player.squadNumber = nextSquadNumber(state, club.id, 30);
  return player;
}

function youthIntake(state: GameState): void {
  const humanId = state.manager.clubId;
  for (const club of Object.values(state.world.clubs)) {
    const count = randInt(state.rng, 1, 2 + Math.round(academyRating(club) / 8));
    const intake: Player[] = [];
    for (let i = 1; i <= count; i++) {
      const player = generateYouthPlayer(state, club, i);
      state.world.players[player.id] = player;
      intake.push(player);
    }
    if (club.id === humanId) {
      const best = [...intake].sort((a, b) => b.pa - a.pa)[0]!;
      addNews(state, {
        category: 'club',
        title: `Youth intake: ${intake.length} player${intake.length > 1 ? 's join' : ' joins'} from the academy`,
        body: [
          intake.length > 1 ? `This year's academy graduates have joined your squad:` : `This year's academy graduate has joined your squad:`,
          intake.map((p) => `${playerLink(p)} (${mainPosition(p)}, ${ageOn(p.dateOfBirth, state.date)}) potential ${abilityStars(p.pa)}★`).join('\n'),
          `Your youth coach rates ${playerLink(best)} as the pick of the bunch.`,
          'Young players develop fastest when they play. You can release any you do not want to keep.',
        ].join('\n\n'),
        important: true,
      });
    }
  }
}

// ---------- Retirement and squad trimming ----------

function retirementChance(player: Player, age: number): number {
  const keeper = mainPosition(player) === 'GK';
  const a = keeper ? age - 2 : age;
  if (a < 33) return 0;
  const base = a === 33 ? 0.12 : a === 34 ? 0.28 : a === 35 ? 0.48 : a === 36 ? 0.68 : 0.9;
  return Math.min(0.97, base * (player.ca < 120 ? 1.3 : 0.8));
}

function retire(state: GameState, player: Player): void {
  if (player.clubId === state.manager.clubId) removeFromTactics(state, player.id);
  if (player.clubId) releasePlayer(state, player);
  player.retired = true;
  player.transferListed = false;
}

function endOfSeasonRetirements(state: GameState): void {
  const humanId = state.manager.clubId;
  const ours: Player[] = [];
  for (const player of Object.values(state.world.players)) {
    if (player.retired) continue;
    const age = ageOn(player.dateOfBirth, state.date);
    if (!chance(state.rng, retirementChance(player, age))) continue;
    if (player.clubId === humanId) ours.push(player);
    retire(state, player);
  }
  if (ours.length > 0) {
    addNews(state, {
      category: 'club',
      title: `${ours.length} player${ours.length > 1 ? 's' : ''} retire`,
      body: `Retiring at the end of the season: ${ours.map((p) => `${playerLink(p)} (${ageOn(p.dateOfBirth, state.date)})`).join(', ')}.`,
      important: true,
    });
  }
}

/**
 * Free agents nobody signs by the end of a window move on to leagues outside the game (or retire).
 * Only the best stay available into the next window.
 */
function retireUnsignedFreeAgents(state: GameState): void {
  for (const player of Object.values(state.world.players)) {
    if (player.retired || player.clubId) continue;
    if (ageOn(player.dateOfBirth, state.date) >= 30 || player.ca < 125) player.retired = true;
  }
}

/** Computer clubs over the squad limit let their weakest surplus players go after the summer. */
function trimSquads(state: GameState): void {
  const humanId = state.manager.clubId;
  const squads = squadIndex(state);
  for (const [clubId, squad] of squads) {
    // Leave room to sign players over the summer.
    const limit = MAX_SQUAD - 3;
    if (clubId === humanId || squad.length <= limit) continue;
    // Keep the best players and the best prospects; release the rest of the surplus.
    // Prospects are judged on what they could become, veterans on what they still have.
    const keepScore = (p: Player) => {
      const age = ageOn(p.dateOfBirth, state.date);
      if (age <= 20) return p.ca + Math.max(0, p.pa - p.ca) * 0.9;
      return p.ca - Math.max(0, age - 30) * 5;
    };
    // Never trim below two goalkeepers.
    let keepers = squad.filter((p) => (p.positions.GK ?? 0) >= 18).length;
    const surplus = [...squad]
      .sort((a, b) => keepScore(a) - keepScore(b))
      .filter((p) => {
        if ((p.positions.GK ?? 0) < 18) return true;
        if (keepers <= 2) return false;
        keepers--;
        return true;
      })
      .slice(0, squad.length - limit);
    for (const p of surplus) releasePlayer(state, p);
  }
}

/**
 * The manager releases a player. Paying up the contract costs half the wages still owed,
 * taken from the transfer budget.
 */
export function releaseByManager(state: GameState, playerId: Id): { ok: boolean; message: string; cost: number } {
  const player = state.world.players[playerId];
  const clubId = state.manager.clubId;
  if (!player || !clubId || player.clubId !== clubId) return { ok: false, message: 'Only your own players can be released.', cost: 0 };
  if (squadOf(state, clubId).length <= 16) return { ok: false, message: 'Your squad is too small to release anyone.', cost: 0 };
  const cost = releaseCost(state, player);
  const finances = financesOf(state, clubId);
  if (cost > finances.transferBudget) return { ok: false, message: 'You cannot afford to pay up the contract.', cost };
  finances.transferBudget -= cost;
  releasePlayer(state, player);
  return { ok: true, message: `${player.knownAs ?? player.lastName} has been released${cost > 0 ? ` at a cost of €${Math.round(cost / 1000)}K` : ''}.`, cost };
}

export function releaseCost(state: GameState, player: Player): number {
  if (!player.contract) return 0;
  const weeks = Math.max(0, (Date.parse(player.contract.expires) - Date.parse(state.date)) / (7 * 86_400_000));
  return Math.round((weeks * player.contract.wage * 0.5) / 1000) * 1000;
}

/** The daily development tick. */
export function developmentDay(state: GameState): void {
  const md = monthDay(state.date);
  if (md.endsWith('-01')) monthlyDevelopment(state);
  if (md === '03-20') youthIntake(state);
  if (md === '06-25') endOfSeasonRetirements(state);
  if (md === '07-02') trimSquads(state);
  if (md === '09-03') {
    trimSquads(state);
    retireUnsignedFreeAgents(state);
  }
  if (md === '02-04') retireUnsignedFreeAgents(state);
}

export function developmentTrend(player: Player, months = 6): number {
  const history = player.abilityHistory;
  if (history.length < 2) return 0;
  const from = history[Math.max(0, history.length - 1 - months)]![1];
  return player.ca - from;
}

