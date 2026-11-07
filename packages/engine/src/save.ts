import type { Position } from './attributes.ts';
import { initEconomy } from './finance.ts';
import { SAVE_VERSION } from './game.ts';
import { rolePositions } from './players.ts';
import type { GameState } from './types.ts';

/**
 * Positions corrected in the data after careers had started: brought into existing saves too.
 * Matched by id and surname, so a save from another world is left alone.
 */
const POSITION_FIXES: Array<{ id: string; lastName: string; main: Position; also?: Position[] }> = [
  { id: 'sco-xdjnch', lastName: 'Tierney', main: 'DL' },
  { id: 'sco-1hbzs33', lastName: 'Donovan', main: 'DR' },
  { id: 'sco-t25y79', lastName: 'Lotomba', main: 'DR' },
  { id: 'sco-1cmczz8', lastName: 'Emenalo', main: 'DL', also: ['MC', 'DM'] },
  { id: 'sco-5nipyy', lastName: 'Durán', main: 'ST', also: ['AMR'] },
];

/** Saves are the game state as JSON; the RNG state is included, so loading resumes exactly. */
export function serializeGame(state: GameState): string {
  return JSON.stringify(state);
}

/** Brings older saves up to date. */
function migrate(state: GameState): GameState {
  if (state.version === 1) {
    // v2: fitness, injuries, suspensions, richer stats and the manager's tactics.
    for (const player of Object.values(state.world.players)) {
      player.condition ??= 100;
      player.injury ??= null;
      player.suspension ??= 0;
      for (const s of player.stats) {
        s.ratingTotal ??= s.apps * 6.5;
        s.yellow ??= 0;
        s.red ??= 0;
      }
    }
    state.manager.tactics ??= null;
    state.version = 2;
  }
  if (state.version === 2) {
    // v3: recent form; new instructions are filled in when tactics are next used.
    for (const player of Object.values(state.world.players)) player.form ??= [];
    state.version = 3;
  }
  if (state.version === 3) {
    // v4: transfer market. Budgets are created from each club's current squad when first needed.
    for (const player of Object.values(state.world.players)) player.transferListed ??= false;
    state.finances ??= {};
    state.transfers ??= { bids: [], history: [], counter: 0 };
    state.version = 4;
  }
  if (state.version === 4) {
    // v5: development history.
    for (const player of Object.values(state.world.players)) {
      player.abilityHistory ??= [];
      player.growthCarry ??= 0;
    }
    state.version = 5;
  }
  if (state.version === 5) {
    // v6: players can cover the positions around their own; a few positions corrected.
    for (const fix of POSITION_FIXES) {
      const player = state.world.players[fix.id];
      if (!player || player.lastName !== fix.lastName) continue;
      const positions: Partial<Record<Position, number>> = {};
      for (const [pos, value] of Object.entries(player.positions) as Array<[Position, number]>) positions[pos] = Math.min(value, 17);
      for (const pos of fix.also ?? []) positions[pos] = Math.max(positions[pos] ?? 0, 17);
      positions[fix.main] = 20;
      player.positions = positions;
    }
    for (const player of Object.values(state.world.players)) player.positions = rolePositions(player);
    state.version = 6;
  }
  // Saves from before club finances: set up income and cash in the bank from the squads as they are now.
  if (!state.economy) initEconomy(state);
  return state;
}

export function deserializeGame(json: string): GameState {
  const state = JSON.parse(json) as GameState;
  if (typeof state !== 'object' || state === null || !state.world || !state.rng) {
    throw new Error('Not a Manager of Champions save file');
  }
  if (typeof state.version !== 'number' || state.version > SAVE_VERSION) {
    throw new Error(`Save version ${state.version} is not supported (this game reads up to ${SAVE_VERSION})`);
  }
  return migrate(state);
}
