import {
  autoTactics, completeMatch, continueGame, type GameState, humanFixtureOn, type LiveMatch, type MatchEvent,
  matchContext, playFixtures, playToEnd, setInstructions, squadOf, startMatch, stepMatch, type StopReason,
  substitute, type Tactics, type TeamInstructions,
} from '@moc/engine';
import { useSyncExternalStore } from 'react';
import { maybeCloudSave, saveToCloud } from './cloud.ts';
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
  live = null;
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
    if (!game) return;
    void saveCareer(game);
    maybeCloudSave(game);
  }, 400);
}

// Leaving the page (switching app on an iPad, closing the tab): save everywhere straight away.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !game) return;
    void saveCareer(game);
    void saveToCloud(game);
  });
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

// ---------- Tactics ----------

/** The manager's tactics, created from the best available XI the first time they're needed. */
export function ensureTactics(): Tactics | null {
  if (!game || !game.manager.clubId) return null;
  if (!game.manager.tactics) {
    game.manager.tactics = autoTactics(squadOf(game, game.manager.clubId), game.date);
  }
  return game.manager.tactics;
}

export function saveTactics(tactics: Tactics): void {
  if (!game) return;
  game.manager.tactics = tactics;
  emit();
  scheduleAutosave();
}

// ---------- Live match ----------

/**
 * The match being watched lives outside the saved game until it finishes; the other fixtures
 * of the day are played (and saved) at kick-off.
 */
let live: LiveMatch | null = null;

export function getLiveMatch(): LiveMatch | null {
  return live;
}

export function kickOffLive(): LiveMatch | null {
  if (!game) return null;
  const fixture = humanFixtureOn(game, game.date);
  if (!fixture) return null;
  if (live?.fixtureId === fixture.id) return live;
  playFixtures(game, game.date, fixture.id);
  live = startMatch(game, fixture, true);
  emit();
  return live;
}

export function stepLive(): MatchEvent[] {
  if (!game || !live) return [];
  const events = stepMatch(matchContext(game), live);
  emit();
  return events;
}

export function playLiveToEnd(): void {
  if (!game || !live) return;
  playToEnd(matchContext(game), live);
  emit();
}

export function substituteLive(outId: string, inId: string): boolean {
  if (!game || !live) return false;
  const side = live.home.human ? 'home' : 'away';
  const ok = substitute(matchContext(game), live, side, outId, inId);
  emit();
  return ok;
}

export function instructLive(instructions: TeamInstructions): void {
  if (!live) return;
  setInstructions(live, live.home.human ? 'home' : 'away', instructions);
  emit();
}

/** Writes the finished match into the game and returns the id of its news report. */
export function finishLive(): string | null {
  if (!game || !live || live.period !== 'full') return null;
  const fixture = game.fixtures[live.fixtureId];
  if (!fixture) return null;
  completeMatch(game, fixture, live);
  live = null;
  emit();
  scheduleAutosave();
  return game.news[0]?.id ?? null;
}

export function clearLive(): void {
  live = null;
  emit();
}

// ---------- Transfers ----------

/** Runs a game action, then refreshes the screens and autosaves. */
export function act<T>(action: (game: GameState) => T): T | null {
  if (!game) return null;
  const result = action(game);
  emit();
  scheduleAutosave();
  return result;
}
