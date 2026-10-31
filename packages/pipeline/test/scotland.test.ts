import { describe, expect, it } from 'vitest';
import { fitToLevel, headroomFor, relativeAbility } from '../src/scotland/estimate.ts';
import { gamePosition, isSeniorNationalTeam, pagePropsUrl, parsePageProps, parsePlayers, playersQuery } from '../src/scotland/wikidata.ts';
import { parseName, parseSquad, splitParams } from '../src/scotland/wikitext.ts';

const WIKITEXT = `
== Players ==
=== First-team squad ===
{{Fs start}}
{{Fs player|no=1|nat=DEN|pos=GK|name=[[Kasper Schmeichel]]}}
{{Fs player|no=42|nat=SCO|pos=MF|name=[[Callum McGregor]]|other=[[Captain (association football)|captain]]}}
{{Fs player|no=9|nat=JPN|pos=FW|name=[[Kyogo Furuhashi (footballer)|Kyogo Furuhashi]]<ref>{{cite web|url=x}}</ref>}}
{{Fs player|no=22|nat=ENG|pos=DF|name={{sortname|Joe|Bloggs|Joe Bloggs (footballer, born 2001)}}|other=on loan from [[Chelsea F.C.|Chelsea]]}}
{{Fs player|no=|nat=SCO|pos=DF|name=Unlinked Player}}
{{Fs end}}

=== Out on loan ===
{{Fs start}}
{{Fs player|no=30|nat=SCO|pos=FW|name=[[Loaned Striker]]|other=at [[Ayr United F.C.|Ayr United]] until June 2027}}
{{Fs end}}

== B team ==
{{Fs player|no=60|nat=SCO|pos=MF|name=[[Academy Kid]]}}
`;

describe('reading squads from Wikipedia', () => {
  it('splits template parameters only on top-level pipes', () => {
    expect(splitParams('Fs player|name=[[A|B]]|other={{x|y}}')).toEqual(['Fs player', 'name=[[A|B]]', 'other={{x|y}}']);
  });

  it('reads names, links and sortname templates', () => {
    expect(parseName('[[Kyogo Furuhashi (footballer)|Kyogo Furuhashi]]')).toEqual({ name: 'Kyogo Furuhashi', article: 'Kyogo Furuhashi (footballer)' });
    expect(parseName('{{sortname|Joe|Bloggs|Joe Bloggs (footballer)}}')).toEqual({ name: 'Joe Bloggs', article: 'Joe Bloggs (footballer)' });
    expect(parseName("'''Plain Name'''")).toEqual({ name: 'Plain Name', article: null });
  });

  it('separates the squad from loans and academy sections', () => {
    const squad = parseSquad(WIKITEXT);
    expect(squad.current.map((r) => r.name)).toEqual(['Kasper Schmeichel', 'Callum McGregor', 'Kyogo Furuhashi', 'Joe Bloggs', 'Unlinked Player']);
    expect(squad.current[0]).toMatchObject({ number: 1, nat: 'DEN', pos: 'GK', article: 'Kasper Schmeichel' });
    expect(squad.current[1]!.other).toBe('captain');
    expect(squad.current[3]!.other).toBe('on loan from Chelsea');
    expect(squad.current[4]!.number).toBeNull();
    expect(squad.outOnLoan.map((r) => r.name)).toEqual(['Loaned Striker']);
    expect(squad.skipped).toEqual(['B team']);
  });
});

describe('Wikidata', () => {
  it('finds Wikidata ids through redirects and normalised titles', () => {
    expect(pagePropsUrl(['Callum McGregor', 'Jota (footballer, born 1999)'])).toContain('redirects=1');
    const ids = parsePageProps({
      query: {
        normalized: [{ from: 'callum McGregor', to: 'Callum McGregor' }],
        redirects: [{ from: 'Jota (Portuguese footballer)', to: 'Jota (footballer, born 1999)' }],
        pages: [
          { title: 'Callum McGregor', pageprops: { wikibase_item: 'Q5025010' } },
          { title: 'Jota (footballer, born 1999)', pageprops: { wikibase_item: 'Q27869446' } },
          { title: 'Nobody', missing: true },
        ],
      },
    }, ['callum McGregor', 'Jota (Portuguese footballer)', 'Nobody']);
    expect([...ids]).toEqual([['callum McGregor', 'Q5025010'], ['Jota (Portuguese footballer)', 'Q27869446']]);
  });

  it('builds a query and reads birth dates, positions and senior caps', () => {
    expect(playersQuery(['Q5025010', 'Q1'])).toContain('wd:Q5025010 wd:Q1');
    const players = parsePlayers({
      results: {
        bindings: [
          { item: { value: 'http://www.wikidata.org/entity/Q5025010' }, dob: { value: '1993-06-14T00:00:00Z' }, posLabel: { value: 'midfielder' }, teamLabel: { value: 'Scotland national football team' } },
          { item: { value: 'http://www.wikidata.org/entity/Q5025010' }, posLabel: { value: 'defensive midfielder' }, teamLabel: { value: 'Scotland national under-21 football team' } },
          { item: { value: 'http://www.wikidata.org/entity/Q9' }, dob: { value: '2007-02-01T00:00:00Z' }, teamLabel: { value: 'Scotland national under-19 football team' } },
        ],
      },
    });
    expect(players.get('Q5025010')).toEqual({
      id: 'Q5025010', dateOfBirth: '1993-06-14', positions: ['midfielder', 'defensive midfielder'], seniorInternational: true,
    });
    expect(players.get('Q9')!.seniorInternational).toBe(false);
    expect(isSeniorNationalTeam('Republic of Ireland national association football team')).toBe(true);
    expect(isSeniorNationalTeam('England national under-21 football team')).toBe(false);
  });

  it('maps positions within the broad position from the squad list', () => {
    expect(gamePosition(['centre-back'], 'DF', 'L')).toBe('DC');
    expect(gamePosition(['full-back'], 'DF', 'L')).toBe('DL');
    expect(gamePosition(['midfielder', 'defensive midfielder'], 'MF', 'R')).toBe('DM');
    expect(gamePosition(['winger'], 'FW', 'R')).toBe('AMR');
    expect(gamePosition(['forward'], 'FW', 'R')).toBe('ST');
    expect(gamePosition([], 'MF', 'R')).toBe('MC');
    expect(gamePosition(['midfielder'], 'GK', 'R')).toBe('GK');
  });
});

describe('estimated ratings', () => {
  it('rates experienced internationals above academy players, and fits each club to its level', () => {
    const base = { keeper: false, loanedIn: false };
    const star = relativeAbility({ id: 'a', age: 27, number: 10, seniorInternational: true, ...base });
    const kid = relativeAbility({ id: 'b', age: 18, number: 56, seniorInternational: false, ...base });
    expect(star - kid).toBeGreaterThan(25);
    const abilities = fitToLevel([5, 4, 3, 2, 1, 0, 0, -1, -2, -3, -4, -20, -30], 120);
    const best = [...abilities].sort((a, b) => b - a).slice(0, 11);
    expect(Math.round(best.reduce((a, b) => a + b, 0) / 11)).toBe(120);
    expect(headroomFor(18)).toBeGreaterThan(headroomFor(24));
    expect(headroomFor(30)).toBe(0);
  });
});
