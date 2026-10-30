import type { Nation } from './types.ts';

/** The made-up country the demo world is set in. */
export const DEMO_NATION: Nation = { id: 'aln', name: 'Albion', code: 'ALN', namePool: 'english' };

/** Real nations used for player nationalities. */
export const NATIONS: readonly Nation[] = [
  { id: 'eng', name: 'England', code: 'ENG', namePool: 'english' },
  { id: 'sco', name: 'Scotland', code: 'SCO', namePool: 'scottish' },
  { id: 'esp', name: 'Spain', code: 'ESP', namePool: 'spanish' },
  { id: 'ita', name: 'Italy', code: 'ITA', namePool: 'italian' },
  { id: 'ger', name: 'Germany', code: 'GER', namePool: 'german' },
  { id: 'ned', name: 'Netherlands', code: 'NED', namePool: 'dutch' },
  { id: 'por', name: 'Portugal', code: 'POR', namePool: 'portuguese' },
  { id: 'cze', name: 'Czech Republic', code: 'CZE', namePool: 'czech' },
  { id: 'arg', name: 'Argentina', code: 'ARG', namePool: 'argentine' },
  { id: 'bra', name: 'Brazil', code: 'BRA', namePool: 'brazilian' },
  { id: 'usa', name: 'USA', code: 'USA', namePool: 'american' },
  { id: 'fra', name: 'France', code: 'FRA', namePool: 'french' },
];
