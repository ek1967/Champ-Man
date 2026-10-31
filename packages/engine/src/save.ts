import { SAVE_VERSION } from './game.ts';
import type { GameState } from './types.ts';

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
