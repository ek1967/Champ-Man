/**
 * Looks players up on Wikidata by their English Wikipedia article: date of birth, playing
 * positions, and whether they have played for a senior national team.
 */
import type { Position } from '@moc/engine';

export interface WikidataPlayer {
  article: string;
  dateOfBirth: string | null;
  /** Position labels, e.g. 'centre-back', 'winger'. */
  positions: string[];
  /** Has been in a senior national team (not an under-age or B side). */
  seniorInternational: boolean;
}

/** A SPARQL query for a batch of article titles. */
export function playersQuery(articles: readonly string[]): string {
  const values = articles
    .map((a) => `<https://en.wikipedia.org/wiki/${encodeURIComponent(a.replace(/ /g, '_')).replace(/%2F/g, '/')}>`)
    .join(' ');
  return `SELECT ?article ?dob ?posLabel ?teamLabel WHERE {
  VALUES ?article { ${values} }
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
  OPTIONAL { ?item wdt:P569 ?dob . }
  OPTIONAL { ?item wdt:P413 ?pos . ?pos rdfs:label ?posLabel . FILTER(LANG(?posLabel) = "en") }
  OPTIONAL {
    ?item wdt:P54 ?team .
    ?team rdfs:label ?teamLabel . FILTER(LANG(?teamLabel) = "en" && CONTAINS(?teamLabel, "national"))
  }
}`;
}

interface SparqlJson {
  results: { bindings: Array<Record<string, { value: string } | undefined>> };
}

/** Article title from a Wikipedia URL. */
function titleOf(url: string): string {
  return decodeURIComponent(url.replace('https://en.wikipedia.org/wiki/', '')).replace(/_/g, ' ');
}

/** True for senior national teams ("Scotland national football team"), not U21, B or Olympic sides. */
export function isSeniorNationalTeam(label: string): boolean {
  return /national (association )?football team/i.test(label) && !/under-?\s?\d|\bU-?\d{2}\b|\bB\b|olympic|youth|amateur|futsal|beach/i.test(label);
}

export function parsePlayers(json: SparqlJson): Map<string, WikidataPlayer> {
  const out = new Map<string, WikidataPlayer>();
  for (const b of json.results.bindings) {
    const url = b.article?.value;
    if (!url) continue;
    const article = titleOf(url);
    let p = out.get(article);
    if (!p) out.set(article, (p = { article, dateOfBirth: null, positions: [], seniorInternational: false }));
    const dob = b.dob?.value;
    if (dob && !p.dateOfBirth && /^\+?\d{4}-\d{2}-\d{2}/.test(dob)) p.dateOfBirth = dob.replace(/^\+/, '').slice(0, 10);
    const pos = b.posLabel?.value;
    if (pos && !p.positions.includes(pos)) p.positions.push(pos);
    const team = b.teamLabel?.value;
    if (team && isSeniorNationalTeam(team)) p.seniorInternational = true;
  }
  return out;
}

/**
 * The game's position for a player: Wikidata's detailed labels first, then the GK/DF/MF/FW from
 * the squad list. `side` breaks ties for wide players whose side isn't known.
 */
export function gamePosition(labels: readonly string[], wikiPos: 'GK' | 'DF' | 'MF' | 'FW', side: 'L' | 'R'): Position {
  const text = labels.join(' | ').toLowerCase();
  if (wikiPos === 'GK' || /goalkeeper/.test(text)) return 'GK';
  const wide = side === 'L' ? 'L' : 'R';
  const rules: Array<[RegExp, Position]> = [
    [/centre-back|center-back|central defender|sweeper/, 'DC'],
    [/left-back|left back/, 'DL'],
    [/right-back|right back/, 'DR'],
    [/left wing-back/, 'WBL'],
    [/right wing-back/, 'WBR'],
    [/wing-back/, wide === 'L' ? 'WBL' : 'WBR'],
    [/full-back|fullback/, wide === 'L' ? 'DL' : 'DR'],
    [/defensive midfielder|holding midfielder/, 'DM'],
    [/attacking midfielder|playmaker/, 'AMC'],
    [/left winger/, 'AML'],
    [/right winger/, 'AMR'],
    [/winger|wide midfielder/, wide === 'L' ? 'AML' : 'AMR'],
    [/centre-forward|center forward|striker|second striker/, 'ST'],
    [/central midfielder|box-to-box|midfielder/, 'MC'],
    [/forward/, 'ST'],
    [/defender/, 'DC'],
  ];
  // The squad list's broad position decides which labels count (a "midfielder" listed as DF plays at the back).
  const allowed: Record<string, Position[]> = {
    DF: ['DC', 'DL', 'DR', 'WBL', 'WBR', 'DM'],
    MF: ['DM', 'MC', 'AMC', 'AML', 'AMR', 'ML', 'MR', 'WBL', 'WBR'],
    FW: ['ST', 'AML', 'AMR', 'AMC'],
  };
  for (const [re, position] of rules) {
    if (re.test(text) && allowed[wikiPos]!.includes(position)) return position;
  }
  return wikiPos === 'DF' ? 'DC' : wikiPos === 'MF' ? 'MC' : 'ST';
}
