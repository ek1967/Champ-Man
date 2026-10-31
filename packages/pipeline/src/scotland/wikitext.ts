/**
 * Reads a club's squad from the wikitext of its Wikipedia article. Squads there are written with
 * the {{Fs player}} template (older pages: {{football squad player}}), one per player, under
 * headings such as "First-team squad" and "Out on loan".
 */

export type WikiPosition = 'GK' | 'DF' | 'MF' | 'FW';

export interface SquadRow {
  number: number | null;
  /** FIFA country code as written on the page, e.g. 'SCO', 'JPN'. */
  nat: string;
  pos: WikiPosition;
  /** Name as displayed. */
  name: string;
  /** Linked article title, used to look the player up on Wikidata. */
  article: string | null;
  /** Free text such as "captain" or "on loan from Chelsea". */
  other: string;
}

export interface ParsedSquad {
  /** Players at the club now, including loanees from elsewhere. */
  current: SquadRow[];
  /** The club's players out on loan elsewhere. */
  outOnLoan: SquadRow[];
  /** Headings whose players were left out (academy, B team, ...). */
  skipped: string[];
}

/** Splits template parameters on top-level pipes (not inside [[links]] or {{templates}}). */
export function splitParams(body: string): string[] {
  const parts: string[] = [];
  let depthLink = 0;
  let depthTemplate = 0;
  let current = '';
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '[[') { depthLink++; current += two; i++; continue; }
    if (two === ']]') { depthLink = Math.max(0, depthLink - 1); current += two; i++; continue; }
    if (two === '{{') { depthTemplate++; current += two; i++; continue; }
    if (two === '}}') { depthTemplate = Math.max(0, depthTemplate - 1); current += two; i++; continue; }
    const ch = body[i]!;
    if (ch === '|' && depthLink === 0 && depthTemplate === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/** All templates whose name matches, with their raw bodies (between the braces), in order, with positions. */
function findTemplates(text: string, names: RegExp): Array<{ start: number; body: string }> {
  const found: Array<{ start: number; body: string }> = [];
  let i = 0;
  while ((i = text.indexOf('{{', i)) !== -1) {
    let depth = 0;
    let j = i;
    for (; j < text.length - 1; j++) {
      if (text.startsWith('{{', j)) { depth++; j++; continue; }
      if (text.startsWith('}}', j)) { depth--; j++; if (depth === 0) break; }
    }
    const body = text.slice(i + 2, j - 1);
    const name = body.split('|')[0]!.trim();
    if (names.test(name)) found.push({ start: i, body });
    i += 2;
  }
  return found;
}

/** "[[Callum McGregor]]" → name and article; "[[Kasper Schmeichel (footballer)|Kasper Schmeichel]]" too. */
export function parseName(raw: string): { name: string; article: string | null } {
  const value = raw.replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/'''?/g, '').trim();
  const sort = /\{\{\s*sortname\s*\|([^|}]*)\|([^|}]*)(?:\|([^|}]*))?/i.exec(value);
  if (sort) {
    const name = `${sort[1]!.trim()} ${sort[2]!.trim()}`.trim();
    const article = sort[3]?.trim() && sort[3].trim() !== 'nolink' ? sort[3].trim() : name;
    return { name, article };
  }
  const link = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(value);
  if (link) return { name: (link[2] ?? link[1]!).trim(), article: link[1]!.trim() };
  return { name: value.replace(/\{\{[^}]*\}\}/g, '').trim(), article: null };
}

function plainText(raw: string): string {
  return raw
    .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/'''?/g, '')
    .trim();
}

function toRow(body: string): SquadRow | null {
  const params: Record<string, string> = {};
  for (const part of splitParams(body).slice(1)) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
  }
  const pos = (params.pos ?? '').toUpperCase();
  if (!['GK', 'DF', 'MF', 'FW'].includes(pos) || !params.name) return null;
  const { name, article } = parseName(params.name);
  if (!name) return null;
  const n = Number((params.no ?? params.num ?? '').replace(/[^\d]/g, ''));
  return {
    number: Number.isInteger(n) && n > 0 ? n : null,
    nat: (params.nat ?? '').toUpperCase(),
    pos: pos as WikiPosition,
    name,
    article,
    other: plainText(params.other ?? ''),
  };
}

const LOAN_HEADING = /loan/i;
const SKIP_HEADING = /academy|reserve|\bB team\b|youth|development|under[- ]?\d|U-?\d\d|women|former|notable|retired|records?|staff|hall of fame|internationals/i;

/** Squad rows grouped by the section they appear in. */
export function parseSquad(wikitext: string): ParsedSquad {
  const headings: Array<{ at: number; title: string }> = [];
  const headingRe = /^(=+)\s*(.*?)\s*\1\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(wikitext))) headings.push({ at: m.index, title: m[2]! });
  const headingAt = (pos: number): string => {
    let title = '';
    for (const h of headings) if (h.at <= pos) title = h.title;
    return title;
  };

  const result: ParsedSquad = { current: [], outOnLoan: [], skipped: [] };
  const seen = new Set<string>();
  for (const t of findTemplates(wikitext, /^(fs player|football squad player)$/i)) {
    const row = toRow(t.body);
    if (!row) continue;
    const heading = headingAt(t.start);
    if (LOAN_HEADING.test(heading) && !/first|current/i.test(heading)) {
      result.outOnLoan.push(row);
    } else if (SKIP_HEADING.test(heading)) {
      if (!result.skipped.includes(heading)) result.skipped.push(heading);
    } else {
      const key = row.article ?? row.name;
      if (seen.has(key)) continue;
      seen.add(key);
      result.current.push(row);
    }
  }
  return result;
}
