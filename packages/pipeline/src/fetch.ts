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
  let text: string;
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    text = await response.text();
  } catch (error) {
    // Node's fetch ignores HTTP(S)_PROXY on some setups; curl honours it.
    try {
      const headerArgs = Object.entries(headers).flatMap(([k, v]) => ['-H', `${k}: ${v}`]);
      text = execFileSync('curl', ['-sSfL', ...headerArgs, url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch {
      throw new Error(`Could not download ${url}: ${String(error)}`);
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return text;
}
