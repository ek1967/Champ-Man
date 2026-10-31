import type { Position } from './attributes.ts';
import type { ISODate } from './dates.ts';
import { positionRating } from './players.ts';
import type { Id, Player } from './types.ts';

/** Team shape and a handful of clear instructions (PLAN §7.3). */

export type FormationId = '4-4-2' | '4-3-3' | '4-2-3-1' | '4-5-1' | '4-1-2-1-2' | '3-5-2' | '5-3-2';

export interface FormationSlot {
  position: Position;
  /** Pitch position for the tactics board: x across (0 = left touchline), y up from own goal. */
  x: number;
  y: number;
}

const back4: FormationSlot[] = [
  { position: 'GK', x: 50, y: 6 },
  { position: 'DR', x: 86, y: 24 },
  { position: 'DC', x: 62, y: 19 },
  { position: 'DC', x: 38, y: 19 },
  { position: 'DL', x: 14, y: 24 },
];

export const FORMATIONS: Record<FormationId, FormationSlot[]> = {
  '4-4-2': [
    ...back4,
    { position: 'MR', x: 86, y: 54 }, { position: 'MC', x: 62, y: 48 }, { position: 'MC', x: 38, y: 48 },
    { position: 'ML', x: 14, y: 54 }, { position: 'ST', x: 62, y: 82 }, { position: 'ST', x: 38, y: 82 },
  ],
  '4-3-3': [
    ...back4,
    { position: 'DM', x: 50, y: 38 }, { position: 'MC', x: 68, y: 54 }, { position: 'MC', x: 32, y: 54 },
    { position: 'AMR', x: 84, y: 76 }, { position: 'AML', x: 16, y: 76 }, { position: 'ST', x: 50, y: 86 },
  ],
  '4-2-3-1': [
    ...back4,
    { position: 'DM', x: 62, y: 38 }, { position: 'MC', x: 38, y: 40 }, { position: 'AMR', x: 82, y: 66 },
    { position: 'AMC', x: 50, y: 64 }, { position: 'AML', x: 18, y: 66 }, { position: 'ST', x: 50, y: 86 },
  ],
  '4-5-1': [
    ...back4,
    { position: 'MR', x: 86, y: 58 }, { position: 'MC', x: 66, y: 52 }, { position: 'DM', x: 50, y: 38 },
    { position: 'MC', x: 34, y: 52 }, { position: 'ML', x: 14, y: 58 }, { position: 'ST', x: 50, y: 84 },
  ],
  '4-1-2-1-2': [
    ...back4,
    { position: 'DM', x: 50, y: 36 }, { position: 'MC', x: 68, y: 50 }, { position: 'MC', x: 32, y: 50 },
    { position: 'AMC', x: 50, y: 64 }, { position: 'ST', x: 62, y: 84 }, { position: 'ST', x: 38, y: 84 },
  ],
  '3-5-2': [
    { position: 'GK', x: 50, y: 6 },
    { position: 'DC', x: 70, y: 20 }, { position: 'DC', x: 50, y: 17 }, { position: 'DC', x: 30, y: 20 },
    { position: 'WBR', x: 88, y: 46 }, { position: 'MC', x: 64, y: 52 }, { position: 'DM', x: 50, y: 38 },
    { position: 'MC', x: 36, y: 52 }, { position: 'WBL', x: 12, y: 46 },
    { position: 'ST', x: 62, y: 82 }, { position: 'ST', x: 38, y: 82 },
  ],
  '5-3-2': [
    { position: 'GK', x: 50, y: 6 },
    { position: 'WBR', x: 88, y: 32 }, { position: 'DC', x: 68, y: 19 }, { position: 'DC', x: 50, y: 16 },
    { position: 'DC', x: 32, y: 19 }, { position: 'WBL', x: 12, y: 32 },
    { position: 'MC', x: 70, y: 52 }, { position: 'MC', x: 50, y: 46 }, { position: 'MC', x: 30, y: 52 },
    { position: 'ST', x: 62, y: 82 }, { position: 'ST', x: 38, y: 82 },
  ],
};

export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];

export type Mentality =
  | 'ultra-defensive' | 'defensive' | 'cautious' | 'balanced' | 'positive' | 'attacking' | 'ultra-attacking';
export type Level3<A extends string, B extends string, C extends string> = A | B | C;

export interface TeamInstructions {
  mentality: Mentality;
  passing: Level3<'short', 'mixed', 'direct'>;
  tempo: Level3<'slow', 'normal', 'fast'>;
  width: Level3<'narrow', 'normal', 'wide'>;
  pressing: Level3<'low', 'medium', 'high'>;
  line: Level3<'deep', 'normal', 'high'>;
  tackling: Level3<'easy', 'normal', 'hard'>;
  /** Sit a little deeper and break quickly when the ball is won. */
  counter: 'off' | 'on';
  /** Defenders step up together to catch forwards offside; quick forwards can beat it. */
  offsideTrap: 'off' | 'on';
}

export const DEFAULT_INSTRUCTIONS: TeamInstructions = {
  mentality: 'balanced',
  passing: 'mixed',
  tempo: 'normal',
  width: 'normal',
  pressing: 'medium',
  line: 'normal',
  tackling: 'normal',
  counter: 'off',
  offsideTrap: 'off',
};

/** Choices shown on the tactics screen, in display order. */
export const INSTRUCTION_OPTIONS: { [K in keyof TeamInstructions]: ReadonlyArray<TeamInstructions[K]> } = {
  mentality: ['ultra-defensive', 'defensive', 'cautious', 'balanced', 'positive', 'attacking', 'ultra-attacking'],
  passing: ['short', 'mixed', 'direct'],
  tempo: ['slow', 'normal', 'fast'],
  width: ['narrow', 'normal', 'wide'],
  pressing: ['low', 'medium', 'high'],
  line: ['deep', 'normal', 'high'],
  tackling: ['easy', 'normal', 'hard'],
  counter: ['off', 'on'],
  offsideTrap: ['off', 'on'],
};

/** Individual instructions, as in the classic games: what each player does on top of the team plan. */
export interface PlayerInstructions {
  /** Join attacks or hold position. */
  runs: 'stay' | 'mixed' | 'forward';
  /** How readily they shoot from distance. */
  shooting: 'rarely' | 'normal' | 'often';
  /** How hard they press the player on the ball. */
  closingDown: 'less' | 'normal' | 'more';
}

export const DEFAULT_PLAYER_INSTRUCTIONS: PlayerInstructions = { runs: 'mixed', shooting: 'normal', closingDown: 'normal' };

export const PLAYER_INSTRUCTION_OPTIONS: { [K in keyof PlayerInstructions]: ReadonlyArray<PlayerInstructions[K]> } = {
  runs: ['stay', 'mixed', 'forward'],
  shooting: ['rarely', 'normal', 'often'],
  closingDown: ['less', 'normal', 'more'],
};

export const MAX_BENCH = 9;
export const MAX_SUBSTITUTIONS = 5;

export interface Tactics {
  formation: FormationId;
  /** One player per formation slot, in slot order. */
  lineup: Array<Id | null>;
  bench: Id[];
  instructions: TeamInstructions;
  captainId: Id | null;
  penaltyTakerId: Id | null;
  freeKickTakerId: Id | null;
  cornerTakerId: Id | null;
  /** Individual instructions by player; players not listed use the defaults. */
  players?: Record<Id, PlayerInstructions>;
}

export function playerInstructions(tactics: Tactics, id: Id): PlayerInstructions {
  return { ...DEFAULT_PLAYER_INSTRUCTIONS, ...tactics.players?.[id] };
}

/** Fills in settings added since the tactics were saved. */
export function normalizeTactics(tactics: Tactics): Tactics {
  return { ...tactics, instructions: { ...DEFAULT_INSTRUCTIONS, ...tactics.instructions }, players: tactics.players ?? {} };
}

export function isAvailable(player: Player, date: ISODate): boolean {
  return player.suspension === 0 && (!player.injury || player.injury.until <= date);
}

/** Fitness counts when choosing: a tired star may be worth resting. */
export function selectionRating(player: Player, position: Position): number {
  const fitness = 0.55 + 0.45 * Math.min(1, player.condition / 100);
  return positionRating(player, position) * fitness;
}

/** Best XI for a formation, greedily over (player, slot) pairs, strongest first. */
export function bestLineup(players: readonly Player[], formation: FormationId): { lineup: Array<Id | null>; strength: number } {
  const slots = FORMATIONS[formation];
  const options: Array<{ slot: number; player: Player; rating: number }> = [];
  slots.forEach((slot, i) => {
    for (const player of players) options.push({ slot: i, player, rating: selectionRating(player, slot.position) });
  });
  options.sort((a, b) => b.rating - a.rating);
  const lineup: Array<Id | null> = slots.map(() => null);
  const used = new Set<Id>();
  let total = 0;
  for (const o of options) {
    if (lineup[o.slot] !== null || used.has(o.player.id)) continue;
    lineup[o.slot] = o.player.id;
    used.add(o.player.id);
    total += o.rating;
  }
  return { lineup, strength: total / slots.length };
}

/** Bench: cover for every area first (a keeper, then defence, midfield, attack), then the best of the rest. */
export function bestBench(players: readonly Player[], exclude: ReadonlySet<Id>): Id[] {
  const pool = players.filter((p) => !exclude.has(p.id));
  const bench: Id[] = [];
  const take = (position: Position) => {
    const best = pool
      .filter((p) => !bench.includes(p.id))
      .sort((a, b) => selectionRating(b, position) - selectionRating(a, position))[0];
    if (best && bench.length < MAX_BENCH) bench.push(best.id);
  };
  for (const position of ['GK', 'DC', 'DL', 'MC', 'AMR', 'ST'] as const) take(position);
  const rest = pool
    .filter((p) => !bench.includes(p.id))
    .sort((a, b) => Math.max(...Object.keys(b.positions).map((pos) => selectionRating(b, pos as Position))) -
      Math.max(...Object.keys(a.positions).map((pos) => selectionRating(a, pos as Position))));
  for (const p of rest) {
    if (bench.length >= MAX_BENCH) break;
    bench.push(p.id);
  }
  return bench;
}

function bestBy(players: readonly Player[], score: (p: Player) => number): Id | null {
  let best: Player | null = null;
  for (const p of players) if (!best || score(p) > score(best)) best = p;
  return best?.id ?? null;
}

/** Captain and set-piece takers from the players on the pitch. */
export function setPieceTakers(onPitch: readonly Player[]): Pick<Tactics, 'captainId' | 'penaltyTakerId' | 'freeKickTakerId' | 'cornerTakerId'> {
  const outfield = onPitch.filter((p) => (p.positions.GK ?? 0) < 20);
  return {
    captainId: bestBy(onPitch, (p) => p.attributes.leadership * 2 + p.attributes.determination),
    penaltyTakerId: bestBy(outfield, (p) => p.attributes.finishing + p.attributes.composure),
    freeKickTakerId: bestBy(outfield, (p) => p.attributes.setPieces * 2 + p.attributes.longShots),
    cornerTakerId: bestBy(outfield, (p) => p.attributes.setPieces * 2 + p.attributes.crossing),
  };
}

/** What the computer (or the "pick for me" button) chooses: the strongest formation and XI. */
export function autoTactics(
  players: readonly Player[],
  date: ISODate,
  options: { formation?: FormationId; instructions?: TeamInstructions } = {},
): Tactics {
  const available = players.filter((p) => isAvailable(p, date));
  let formation = options.formation;
  let lineup: Array<Id | null> = [];
  if (formation) {
    lineup = bestLineup(available, formation).lineup;
  } else {
    let best = -1;
    for (const id of FORMATION_IDS) {
      const pick = bestLineup(available, id);
      if (pick.strength > best) {
        best = pick.strength;
        formation = id;
        lineup = pick.lineup;
      }
    }
  }
  const chosen = new Set(lineup.filter((id): id is Id => id !== null));
  const onPitch = available.filter((p) => chosen.has(p.id));
  return {
    formation: formation ?? '4-4-2',
    lineup,
    bench: bestBench(available, chosen),
    instructions: { ...DEFAULT_INSTRUCTIONS, ...options.instructions },
    ...setPieceTakers(onPitch),
    players: {},
  };
}

/**
 * Makes a saved selection playable today: unavailable or departed players are replaced by the
 * best available option for their slot, and the bench is topped up. The manager's choices stay
 * wherever they're still possible.
 */
export function readyTactics(saved: Tactics, players: readonly Player[], date: ISODate): Tactics {
  const tactics = normalizeTactics(saved);
  const byId = new Map(players.map((p) => [p.id, p]));
  const ok = (id: Id | null): id is Id => id !== null && byId.has(id) && isAvailable(byId.get(id) as Player, date);
  const slots = FORMATIONS[tactics.formation];
  const lineup: Array<Id | null> = slots.map((_, i) => {
    const id = tactics.lineup[i] ?? null;
    return ok(id) ? id : null;
  });
  const used = new Set(lineup.filter((id): id is Id => id !== null));
  slots.forEach((slot, i) => {
    if (lineup[i] !== null) return;
    const pick = players
      .filter((p) => !used.has(p.id) && isAvailable(p, date))
      .sort((a, b) => selectionRating(b, slot.position) - selectionRating(a, slot.position))[0];
    if (pick) {
      lineup[i] = pick.id;
      used.add(pick.id);
    }
  });
  const bench = tactics.bench.filter((id) => ok(id) && !used.has(id)).slice(0, MAX_BENCH);
  if (bench.length < MAX_BENCH) {
    const extra = bestBench(players.filter((p) => isAvailable(p, date)), new Set([...used, ...bench]));
    bench.push(...extra.slice(0, MAX_BENCH - bench.length));
  }
  const onPitch = lineup.filter((id): id is Id => id !== null).map((id) => byId.get(id) as Player);
  const auto = setPieceTakers(onPitch);
  const keep = (id: Id | null, fallback: Id | null) => (id !== null && used.has(id) ? id : fallback);
  return {
    ...tactics,
    lineup,
    bench,
    captainId: keep(tactics.captainId, auto.captainId),
    penaltyTakerId: keep(tactics.penaltyTakerId, auto.penaltyTakerId),
    freeKickTakerId: keep(tactics.freeKickTakerId, auto.freeKickTakerId),
    cornerTakerId: keep(tactics.cornerTakerId, auto.cornerTakerId),
  };
}

/** Puts a player in a slot (or on the bench); if they were already picked elsewhere, the two swap. */
export function assignPlayer(tactics: Tactics, target: { slot: number } | { bench: number }, playerId: Id | null): Tactics {
  const lineup = [...tactics.lineup];
  const bench = [...tactics.bench];
  const current = 'slot' in target ? (lineup[target.slot] ?? null) : (bench[target.bench] ?? null);
  if (playerId !== null) {
    const inLineup = lineup.indexOf(playerId);
    const onBench = bench.indexOf(playerId);
    if (inLineup >= 0) lineup[inLineup] = current;
    if (onBench >= 0) {
      if (current) bench[onBench] = current;
      else bench.splice(onBench, 1);
    }
  }
  if ('slot' in target) {
    lineup[target.slot] = playerId;
  } else if (playerId === null) {
    bench.splice(target.bench, 1);
  } else if (target.bench >= bench.length) {
    bench.push(playerId);
  } else {
    bench[target.bench] = playerId;
  }
  return { ...tactics, lineup, bench: bench.filter((id): id is Id => Boolean(id)).slice(0, MAX_BENCH) };
}

/** Changing formation keeps players in slots of the same position where possible. */
export function changeFormation(tactics: Tactics, formation: FormationId, players: readonly Player[], date: ISODate): Tactics {
  const oldSlots = FORMATIONS[tactics.formation];
  const pool = tactics.lineup.map((id, i) => ({ id, position: oldSlots[i]?.position })).filter((x) => x.id !== null);
  const lineup: Array<Id | null> = FORMATIONS[formation].map((slot) => {
    const index = pool.findIndex((x) => x.position === slot.position);
    if (index < 0) return null;
    const [taken] = pool.splice(index, 1);
    return taken?.id ?? null;
  });
  // Left-over players fill the remaining slots in order.
  lineup.forEach((id, i) => {
    if (id === null && pool.length > 0) lineup[i] = pool.shift()?.id ?? null;
  });
  return readyTactics({ ...tactics, formation, lineup }, players, date);
}
