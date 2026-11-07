import { deserializeGame, type GameState, serializeGame } from '@moc/engine';
import { saveFileViaClaude, sendFileToClaude } from './claude.ts';

/** One career slot in IndexedDB. Small and dependency-free; more slots can come later. */
const DB_NAME = 'manager-of-champions';
const STORE = 'saves';
const SLOT = 'career';

export interface SaveSummary {
  managerName: string;
  clubName: string | null;
  date: string;
  savedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCareer(state: GameState): Promise<void> {
  const clubId = state.manager.clubId;
  const summary: SaveSummary = {
    managerName: state.manager.name,
    clubName: clubId ? (state.world.clubs[clubId]?.name ?? null) : null,
    date: state.date,
    savedAt: new Date().toISOString(),
  };
  try {
    await run('readwrite', (store) => store.put({ summary, data: serializeGame(state) }, SLOT));
  } catch (error) {
    console.warn('Autosave failed', error);
  }
}

export async function loadCareerSummary(): Promise<SaveSummary | null> {
  try {
    const record = (await run('readonly', (store) => store.get(SLOT))) as { summary: SaveSummary } | undefined;
    return record?.summary ?? null;
  } catch {
    return null;
  }
}

export async function loadCareer(): Promise<GameState | null> {
  const record = (await run('readonly', (store) => store.get(SLOT))) as { data: string } | undefined;
  return record ? deserializeGame(record.data) : null;
}

export async function deleteCareer(): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(SLOT));
  } catch {
    // Nothing to delete.
  }
}

/** Downloads the save as a file, so careers can be backed up or moved between browsers. */
export async function exportCareer(state: GameState): Promise<void> {
  const blob = new Blob([serializeGame(state)], { type: 'application/json' });
  const filename = `manager-of-champions-${state.date}.json`;
  // Inside a Claude page, downloads go through the page runtime (which asks the viewer first).
  const viaClaude = await saveFileViaClaude(filename, blob);
  if (viaClaude !== false) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Reads a downloaded save file (from "Download save") back into a game. */
export async function readSaveFile(file: File): Promise<GameState> {
  return deserializeGame(await file.text());
}

/** Hands the current save to Claude (only possible when the game runs as a Claude page). */
export async function sendCareerToClaude(state: GameState): Promise<string> {
  const blob = new Blob([serializeGame(state)], { type: 'application/json' });
  const id = await sendFileToClaude(blob);
  if (!id) throw new Error('Sending a save to Claude only works in the published Claude page.');
  return id;
}
