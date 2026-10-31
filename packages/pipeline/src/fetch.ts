import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DATA_DIR = join(import.meta.dirname, '../../../data');

/**
 * Downloads a source file once and keeps the raw snapshot under data/raw, so builds are
 * reproducible and the network is only needed for a refresh (`--refresh`).
 */
export async function fetchCached(url: string, cacheName: string, refresh: boolean, headers: Record<string, string> = {}): Promise<string> {
  const path = join(DATA_DIR, 'raw', cacheName);
  if (!refresh && existsSync(path)) return readFileSync(path, 'utf8');
  const text = await download(url, headers);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return text;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Downloads with retries: busy servers (429, 5xx) are given time to recover. */
async function download(url: string, headers: Record<string, string>): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await sleep(2000 * 2 ** (attempt - 1));
    try {
      const response = await fetch(url, { headers });
      if (response.ok) return await response.text();
      lastError = new Error(`HTTP ${response.status}`);
      if (response.status !== 429 && response.status < 500) break;
      const retryAfter = Number(response.headers.get('retry-after'));
      if (retryAfter > 0) await sleep(Math.min(60, retryAfter) * 1000);
      continue;
    } catch (error) {
      lastError = error;
    }
    // Node's fetch ignores HTTP(S)_PROXY on some setups; curl honours it.
    try {
      const headerArgs = Object.entries(headers).flatMap(([k, v]) => ['-H', `${k}: ${v}`]);
      return execFileSync('curl', ['-sSfL', ...headerArgs, url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Could not download ${url}: ${String(lastError)}`);
}
