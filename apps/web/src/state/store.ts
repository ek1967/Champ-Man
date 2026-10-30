import { continueGame, type GameState, type StopReason } from '@moc/engine';
import { useSyncExternalStore } from 'react';
import { saveCareer } from './persistence.ts';

/**
 * The game state lives outside React and is mutated by the engine.
 * Components subscribe to a version number that bumps after every change.
 */
let game: GameState | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version++;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGame(): GameState | null {
  return game;
}

export function setGame(next: GameState | null): void {
  game = next;
  emit();
}

/** Call after mutating the game state directly (e.g. marking news as read). */
export function touchGame(): void {
  emit();
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleAutosave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (game) void saveCareer(game);
  }, 400);
}

export function continueOnce(): StopReason | null {
  if (!game) return null;
  const reason = continueGame(game);
  emit();
  scheduleAutosave();
  return reason;
}

/** Re-renders the caller whenever the game changes and returns the current state. */
export function useGame(): GameState | null {
  useSyncExternalStore(subscribe, () => version);
  return game;
}
