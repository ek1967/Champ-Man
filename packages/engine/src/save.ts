import { SAVE_VERSION } from './game.ts';
import type { GameState } from './types.ts';

/** Saves are the game state as JSON; the RNG state is included, so loading resumes exactly. */
export function serializeGame(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeGame(json: string): GameState {
  const state = JSON.parse(json) as GameState;
  if (typeof state !== 'object' || state === null || !state.world || !state.rng) {
    throw new Error('Not a Manager of Champions save file');
  }
  if (state.version !== SAVE_VERSION) {
    throw new Error(`Save version ${state.version} is not supported (expected ${SAVE_VERSION})`);
  }
  return state;
}
