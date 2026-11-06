import { describe, expect, it } from 'vitest';
import { assignPlayer, MAX_BENCH, type Tactics } from '../src/tactics.ts';

function tactics(): Tactics {
  const lineup = Array.from({ length: 11 }, (_, i) => `s${i}`);
  const bench = Array.from({ length: MAX_BENCH }, (_, i) => `b${i}`);
  return { formation: '4-4-2', lineup, bench } as unknown as Tactics;
}

describe('picking substitutes', () => {
  it('replaces a substitute with a player who was not selected, even with a full bench', () => {
    const t = assignPlayer(tactics(), { bench: 2 }, 'outsider');
    expect(t.bench).toHaveLength(MAX_BENCH);
    expect(t.bench[2]).toBe('outsider');
    expect(t.bench).not.toContain('b2');
    expect(t.lineup).not.toContain('b2');
  });

  it('swaps a starter with a substitute', () => {
    const t = assignPlayer(tactics(), { bench: 4 }, 's3');
    expect(t.bench[4]).toBe('s3');
    expect(t.lineup[3]).toBe('b4');
    expect(t.bench).toHaveLength(MAX_BENCH);
  });

  it('swaps two substitutes round', () => {
    const t = assignPlayer(tactics(), { bench: 0 }, 'b5');
    expect(t.bench[0]).toBe('b5');
    expect(t.bench[5]).toBe('b0');
  });
});
