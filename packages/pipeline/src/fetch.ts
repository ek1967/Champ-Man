import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DATA_DIR = join(import.meta.dirname, '../../../data');

/**
 * Downloads a source file once and keeps the raw snapshot under data/raw, so builds are
 * reproducible and the network is only needed for a refresh (`--refresh`).
 */
export async function fetchCached(url: string, cacheName: string, refresh: boolean): Promise<string> {
  const path = join(DATA_DIR, 'raw', cacheName);
  if (!refresh && existsSync(path)) return readFileSync(path, 'utf8');
  let text: string;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    text = await response.text();
  } catch (error) {
    // Node's fetch ignores HTTP(S)_PROXY on some setups; curl honours it.
    try {
      text = execFileSync('curl', ['-sSfL', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch {
      throw new Error(`Could not download ${url}: ${String(error)}`);
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return text;
}
