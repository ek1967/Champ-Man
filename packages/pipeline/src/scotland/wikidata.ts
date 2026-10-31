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

const ALLOWED: Record<'DF' | 'MF' | 'FW', Position[]> = {
  DF: ['DC', 'DL', 'DR', 'WBL', 'WBR', 'DM'],
  MF: ['DM', 'MC', 'AMC', 'AML', 'AMR', 'ML', 'MR', 'WBL', 'WBR'],
  FW: ['ST', 'AML', 'AMR', 'AMC'],
};

/** The game's position for one label, e.g. 'Left-back' → DL; null when it says nothing useful. */
function positionForLabel(label: string, side: 'L' | 'R'): Position | null {
  const t = label.toLowerCase();
  const rules: Array<[RegExp, Position]> = [
    [/goalkeeper|goaltender/, 'GK'],
    [/centre[- ]back|center[- ]back|central defender|sweeper|libero/, 'DC'],
    [/left wing[- ]back/, 'WBL'],
    [/right wing[- ]back/, 'WBR'],
    [/wing[- ]back/, side === 'L' ? 'WBL' : 'WBR'],
    [/left[- ]back|left full[- ]back/, 'DL'],
    [/right[- ]back|right full[- ]back/, 'DR'],
    [/full[- ]back|fullback/, side === 'L' ? 'DL' : 'DR'],
    [/defensive midfield|holding midfield/, 'DM'],
    [/attacking midfield|playmaker|number 10/, 'AMC'],
    [/left wing|left midfield/, 'AML'],
    [/right wing|right midfield/, 'AMR'],
    [/winger|wide midfield/, side === 'L' ? 'AML' : 'AMR'],
    [/centre[- ]forward|center[- ]forward|striker|second striker/, 'ST'],
    [/central midfield|box-to-box|midfield/, 'MC'],
    [/forward/, 'ST'],
    [/defender/, 'DC'],
  ];
  for (const [re, position] of rules) if (re.test(t)) return position;
  return null;
}

/**
 * The game's positions for a player, most important first: labels in the order given (the article's
 * infobox, or Wikidata), kept within the broad position from the squad list (a "midfielder" listed
 * as DF plays at the back). A bare "defender" only counts when nothing more precise is known.
 * `side` breaks ties for wide players whose side isn't known.
 */
export function gamePositions(
  labels: readonly string[], wikiPos: 'GK' | 'DF' | 'MF' | 'FW', side: 'L' | 'R', ordered = false,
): Position[] {
  if (wikiPos === 'GK') return ['GK'];
  // An article's infobox lists positions in order of importance, so a generic first label counts there;
  // Wikidata's order means nothing, so precise labels win.
  const precise = ordered ? [...labels] : labels.filter((l) => !/^\s*(defender|midfielder)\s*$/i.test(l));
  const out: Position[] = [];
  for (const label of [...precise, ...labels]) {
    // Generic labels are only a fallback.
    if (out.length > 0 && !precise.includes(label)) break;
    const p = positionForLabel(label, side);
    if (p && p !== 'GK' && ALLOWED[wikiPos].includes(p) && !out.includes(p)) out.push(p);
  }
  if (out.length > 0) return out;
  return [wikiPos === 'DF' ? 'DC' : wikiPos === 'MF' ? 'MC' : 'ST'];
}

export function gamePosition(labels: readonly string[], wikiPos: 'GK' | 'DF' | 'MF' | 'FW', side: 'L' | 'R'): Position {
  return gamePositions(labels, wikiPos, side)[0]!;
}

/** Follows Wikipedia's normalisation and redirects from a title as linked to the page's real title. */
function resolver(q: { normalized?: Array<{ from: string; to: string }>; redirects?: Array<{ from: string; to: string }> }): (title: string) => string {
  const normalized = new Map((q.normalized ?? []).map((n) => [n.from, n.to]));
  const redirects = new Map((q.redirects ?? []).map((r) => [r.from, r.to]));
  return (title) => {
    let t = normalized.get(title) ?? title;
    for (let hops = 0; hops < 3 && redirects.has(t); hops++) t = redirects.get(t)!;
    return t;
  };
}

/** Wikipedia API request for the current text of up to 50 articles (redirects followed). */
export function articlesUrl(titles: readonly string[]): string {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1',
    titles: titles.join('|'),
  });
  return `https://en.wikipedia.org/w/api.php?${params.toString()}`;
}

interface RevisionsJson {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
    pages?: Array<{ title: string; revisions?: Array<{ slots?: { main?: { content?: string } } }> }>;
  };
}

/** Article title as linked → its wikitext. */
export function parseArticles(json: RevisionsJson, titles: readonly string[]): Map<string, string> {
  const q = json.query ?? {};
  const resolve = resolver(q);
  const texts = new Map<string, string>();
  for (const page of q.pages ?? []) {
    const content = page.revisions?.[0]?.slots?.main?.content;
    if (content) texts.set(page.title, content);
  }
  const out = new Map<string, string>();
  for (const title of titles) {
    const text = texts.get(resolve(title));
    if (text) out.set(title, text);
  }
  return out;
}
