import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/csv.ts';

describe('parseCsv', () => {
  it('reads headers, quotes, escaped quotes and embedded newlines', () => {
    const rows = parseCsv('name,news\nSaka,"Out, back soon"\n"O""Brien","line one\nline two"\n');
    expect(rows).toEqual([
      { name: 'Saka', news: 'Out, back soon' },
      { name: 'O"Brien', news: 'line one\nline two' },
    ]);
  });

  it('handles CRLF line endings and a missing final newline', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([{ a: '1', b: '2' }]);
  });
});
