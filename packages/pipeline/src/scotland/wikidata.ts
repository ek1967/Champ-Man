/**
 * Looks players up on Wikidata by their English Wikipedia article: date of birth, playing
 * positions, and whether they have played for a senior national team.
 */
import type { Position } from '@moc/engine';

export interface WikidataPlayer {
  /** Wikidata item id, e.g. 'Q312584'. */
  id: string;
  dateOfBirth: string | null;
  /** Position labels, e.g. 'centre-back', 'winger'. */
  positions: string[];
  /** Has been in a senior national team (not an under-age or B side). */
  seniorInternational: boolean;
}

/**
 * Wikipedia API request for the Wikidata ids of up to 50 articles. Redirects are followed, so a
 * squad list linking to "Jota (footballer, born 1999)" or an old title still finds the player.
 */
export function pagePropsUrl(titles: readonly string[]): string {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1',
    titles: titles.join('|'),
  });
  return `https://en.wikipedia.org/w/api.php?${params.toString()}`;
}

interface PagePropsJson {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
    pages?: Array<{ title: string; missing?: boolean; pageprops?: { wikibase_item?: string } }>;
  };
}

/** Article title as linked → Wikidata id, through Wikipedia's normalisation and redirects. */
export function parsePageProps(json: PagePropsJson, titles: readonly string[]): Map<string, string> {
  const q = json.query ?? {};
  const normalized = new Map((q.normalized ?? []).map((n) => [n.from, n.to]));
  const redirects = new Map((q.redirects ?? []).map((r) => [r.from, r.to]));
  const ids = new Map<string, string>();
  for (const page of q.pages ?? []) if (page.pageprops?.wikibase_item) ids.set(page.title, page.pageprops.wikibase_item);
  const out = new Map<string, string>();
  for (const title of titles) {
    let t = normalized.get(title) ?? title;
    for (let hops = 0; hops < 3 && redirects.has(t); hops++) t = redirects.get(t)!;
    const id = ids.get(t);
    if (id) out.set(title, id);
  }
  return out;
}

/** A SPARQL query for a batch of Wikidata items. */
export function playersQuery(ids: readonly string[]): string {
  return `SELECT ?item ?dob ?posLabel ?teamLabel WHERE {
  VALUES ?item { ${ids.map((id) => `wd:${id}`).join(' ')} }
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

/** True for senior national teams ("Scotland national football team"), not U21, B or Olympic sides. */
export function isSeniorNationalTeam(label: string): boolean {
  return /national (association )?football team/i.test(label) && !/under-?\s?\d|\bU-?\d{2}\b|\bB\b|olympic|youth|amateur|futsal|beach/i.test(label);
}

/** Wikidata id → birth date, positions and senior caps. */
export function parsePlayers(json: SparqlJson): Map<string, WikidataPlayer> {
  const out = new Map<string, WikidataPlayer>();
  for (const b of json.results.bindings) {
    const url = b.item?.value;
    if (!url) continue;
    const id = url.slice(url.lastIndexOf('/') + 1);
    let p = out.get(id);
    if (!p) out.set(id, (p = { id, dateOfBirth: null, positions: [], seniorInternational: false }));
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
