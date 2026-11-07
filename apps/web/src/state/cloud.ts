/**
 * Cloud saves: when the game runs as a published Claude page, the career is also kept on
 * Anthropic's servers under the viewer's own account, so it survives the browser clearing its
 * storage (Safari on iPad does this after a while) and can be picked up on another device.
 *
 * The save itself is an artifact asset (a JSON file, a few megabytes); a small private document
 * at data/users/<viewer>/career points at the latest one and says what's in it. Elsewhere (local
 * development, a viewer who can't upload) every function reports "unavailable" and the game
 * carries on with its browser save.
 */
import { deserializeGame, type GameState, serializeGame } from '@moc/engine';
import { useSyncExternalStore } from 'react';

interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}
interface AssetsApi {
  upload(blob: Blob, options?: { type?: string }): Promise<{ id: string; sizeBytes: number }>;
  delete(ref: string): Promise<{ deleted: boolean }>;
}
interface DocSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface DocRef {
  get(): Promise<DocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
}
interface DbApi {
  doc(path: string): DocRef;
}
interface UserApi {
  id(): Promise<string | null>;
}

export interface CloudSummary {
  managerName: string;
  clubName: string | null;
  /** In-game date. */
  date: string;
  /** When it was saved (ISO time). */
  savedAt: string;
}

async function use<T>(name: string): Promise<T | null> {
  try {
    const runtime = (window as unknown as { claude?: ClaudeRuntime }).claude;
    return ((await runtime?.use(name)) as T | null | undefined) ?? null;
  } catch {
    return null;
  }
}

/** The viewer's cloud-save pointer document and the asset store, or null when cloud saves can't work here. */
async function connect(): Promise<{ doc: DocRef; assets: AssetsApi } | null> {
  const [db, user, assets] = await Promise.all([use<DbApi>('db'), use<UserApi>('user'), use<AssetsApi>('assets')]);
  if (!db || !user || !assets) return null;
  const uid = await user.id().catch(() => null);
  if (!uid) return null;
  return { doc: db.doc(`data/users/${uid}/career`), assets };
}

// ---------- Status, for the screens ----------

export type CloudState =
  | { kind: 'checking' }
  | { kind: 'unavailable' }
  | { kind: 'idle'; last: CloudSummary | null }
  | { kind: 'saving'; last: CloudSummary | null }
  | { kind: 'error'; message: string; last: CloudSummary | null };

let status: CloudState = { kind: 'checking' };
const listeners = new Set<() => void>();
function setStatus(next: CloudState): void {
  status = next;
  for (const l of listeners) l();
}
export function useCloudStatus(): CloudState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}
function lastSaved(): CloudSummary | null {
  return 'last' in status ? status.last : null;
}

function summaryOf(data: Record<string, unknown> | undefined): CloudSummary | null {
  if (!data || typeof data.asset !== 'string') return null;
  return {
    managerName: String(data.managerName ?? ''),
    clubName: typeof data.clubName === 'string' ? data.clubName : null,
    date: String(data.date ?? ''),
    savedAt: String(data.savedAt ?? ''),
  };
}

/** What's in the cloud save, if anything. Also tells the screens whether cloud saves work here. */
export async function cloudSummary(): Promise<CloudSummary | null> {
  const c = await connect();
  if (!c) {
    setStatus({ kind: 'unavailable' });
    return null;
  }
  try {
    const summary = summaryOf((await c.doc.get()).data());
    setStatus({ kind: 'idle', last: summary });
    return summary;
  } catch {
    setStatus({ kind: 'error', message: 'Could not reach the cloud save.', last: null });
    return null;
  }
}

let saving: Promise<void> | null = null;

/** Uploads the career and points the viewer's save document at it; the previous upload is removed. */
export async function saveToCloud(state: GameState): Promise<{ ok: boolean; message: string }> {
  if (saving) await saving.catch(() => undefined);
  const c = await connect();
  if (!c) {
    setStatus({ kind: 'unavailable' });
    return { ok: false, message: 'Cloud saves only work in the published game page.' };
  }
  const last = lastSaved();
  setStatus({ kind: 'saving', last });
  const clubId = state.manager.clubId;
  const summary: CloudSummary = {
    managerName: state.manager.name,
    clubName: clubId ? (state.world.clubs[clubId]?.name ?? null) : null,
    date: state.date,
    savedAt: new Date().toISOString(),
  };
  let result: { ok: boolean; message: string } = { ok: true, message: 'Saved to the cloud.' };
  saving = (async () => {
    try {
      const previous = (await c.doc.get()).data()?.asset;
      const blob = new Blob([serializeGame(state)], { type: 'application/json' });
      const uploaded = await c.assets.upload(blob, { type: 'application/json' });
      await c.doc.set({ ...summary, asset: uploaded.id });
      // The old upload is no longer pointed at; remove it so saves don't pile up.
      if (typeof previous === 'string' && previous !== uploaded.id) await c.assets.delete(previous).catch(() => undefined);
      setStatus({ kind: 'idle', last: summary });
    } catch (error) {
      const code = (error as { code?: string }).code;
      const message =
        code === 'quota_or_state' ? 'The cloud store is full.' : code === 'rate_limited' ? 'Saving too often; it will try again shortly.' : 'The cloud save failed; your browser save is fine.';
      result = { ok: false, message };
      setStatus({ kind: 'error', message, last });
    }
  })();
  await saving;
  saving = null;
  return result;
}

/** Downloads the career from the cloud. */
export async function loadFromCloud(): Promise<GameState | null> {
  const c = await connect();
  if (!c) return null;
  const asset = (await c.doc.get()).data()?.asset;
  if (typeof asset !== 'string') return null;
  const response = await fetch(`/_blob/${asset}`);
  if (!response.ok) throw new Error('The cloud save could not be downloaded.');
  return deserializeGame(await response.text());
}

// ---------- Automatic saving ----------

let lastAutoDate = '';
let lastAutoTime = 0;
const AUTO_MIN_DAYS = 7;
const AUTO_MIN_MS = 90_000;

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(b) - Date.parse(a)) / 86_400_000;
}

/**
 * Called after the game moves on: saves to the cloud at most every in-game week and every minute
 * and a half, so playing on an iPad never risks more than a few days of progress.
 */
export function maybeCloudSave(state: GameState): void {
  if (status.kind === 'unavailable' || saving) return;
  const now = Date.now();
  if (lastAutoDate && daysBetween(lastAutoDate, state.date) < AUTO_MIN_DAYS) return;
  if (now - lastAutoTime < AUTO_MIN_MS) return;
  lastAutoDate = state.date;
  lastAutoTime = now;
  void saveToCloud(state);
}
