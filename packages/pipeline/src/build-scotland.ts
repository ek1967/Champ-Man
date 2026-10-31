/**
 * Builds the Scotland 2026-27 world pack: a playable Scottish Premiership (with the split after
 * 33 rounds) and a shadow Scottish Championship (PLAN §3.1).
 *
 *   npm run data:scotland                  real squads from Wikipedia and Wikidata (cached in data/raw)
 *   npm run data:scotland -- --refresh     download fresh copies
 *   npm run data:scotland -- --generated   made-up squads (no network needed)
 *
 * Squads (names, numbers, broad positions, nationalities) come from each club's Wikipedia article;
 * dates of birth, detailed positions and senior caps from Wikidata. Both are openly licensed.
 * There are no open match statistics for Scotland, so abilities are estimates (scotland/estimate.ts)
 * listed in a review report; corrections go in scotland/overrides.ts. Writes
 * data/packs/scotland-2026-27.json (also copied to the web app).
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ageOn, type Club, type Competition, createRng, ENGLISH_STYLE_TIEBREAKERS, EUROPEAN_INTERNATIONAL_BREAKS,
  generatePlayer, hashString, type LeagueRules, makeDate, type Nation, NATIONS, normal, type PackPlayer,
  type Position, POSITIONS, randInt, validatePack, weightedPick, type WorldPack,
} from '@moc/engine';
import { DATA_DIR, fetchCached } from './fetch.ts';
import { FPL_REGIONS } from './nations.ts';
import { PREMIERSHIP_CLUBS, SCOTTISH_CHAMPIONSHIP_CLUBS, SCOTTISH_OWNERS, type ScottishClub } from './scotland/clubs.ts';
import { type EstimateInput, fitToLevel, headroomFor, relativeAbility } from './scotland/estimate.ts';
import { SCOTTISH_OVERRIDES } from './scotland/overrides.ts';
import {
  articlesUrl, gamePositions, pagePropsUrl, parseArticles, parsePageProps, parsePlayers, playersQuery, type WikidataPlayer,
} from './scotland/wikidata.ts';
import { infoboxPositions, parseSquad, type SquadRow } from './scotland/wikitext.ts';

const refresh = process.argv.includes('--refresh');
const generatedOnly = process.argv.includes('--generated');
/** Wikimedia asks automated clients to identify themselves. */
const HEADERS = { 'User-Agent': 'ManagerOfChampions-data-pipeline/0.1 (personal, non-commercial game project)' };

const TODAY = '2026-06-15';
const PREMIERSHIP = 'sco-1';
const CHAMPIONSHIP = 'sco-2';

/** Scottish clubs have far less money than English clubs of a similar standing. */
const SCOTLAND_WEALTH = 0.3;

const PREMIERSHIP_RULES: LeagueRules = {
  format: 'league',
  rounds: 3,
  points: { win: 3, draw: 1, loss: 0 },
  tieBreakers: ENGLISH_STYLE_TIEBREAKERS,
  season: { calendar: 'aug-may', start: '08-01', end: '05-16', rollover: '06-20', blocked: EUROPEAN_INTERNATIONAL_BREAKS },
  relegation: { places: 1, to: CHAMPIONSHIP },
  split: { after: 33, groups: 2 },
  zones: [
    { from: 1, to: 1, kind: 'champion', label: 'Champions' },
    { from: 2, to: 2, kind: 'continental', label: 'Champions League qualifying' },
    { from: 3, to: 4, kind: 'continental', label: 'European qualifying' },
    { from: 11, to: 11, kind: 'playoff', label: 'Relegation play-off' },
    { from: 12, to: 12, kind: 'relegation', label: 'Relegated' },
  ],
};

const CHAMPIONSHIP_RULES: LeagueRules = {
  format: 'league',
  rounds: 4,
  points: { win: 3, draw: 1, loss: 0 },
  tieBreakers: ENGLISH_STYLE_TIEBREAKERS,
  season: { calendar: 'aug-may', start: '08-01', end: '04-30', rollover: '06-20', blocked: EUROPEAN_INTERNATIONAL_BREAKS },
  promotion: { places: 1, to: PREMIERSHIP },
  promotionPlayoff: { from: 2, to: 4, finalLegs: 2, versusPlace: 11 },
  zones: [
    { from: 1, to: 1, kind: 'promotion', label: 'Promoted' },
    { from: 2, to: 4, kind: 'playoff', label: 'Play-offs' },
  ],
};

const COMPETITIONS: Competition[] = [
  { id: PREMIERSHIP, name: 'Scottish Premiership', shortName: 'Premiership', nationId: 'sco', tier: 1, mode: 'playable', rules: PREMIERSHIP_RULES },
  { id: CHAMPIONSHIP, name: 'Scottish Championship', shortName: 'Sco Championship', nationId: 'sco', tier: 2, mode: 'shadow', rules: CHAMPIONSHIP_RULES },
];

/** Where non-Scottish players in Scottish squads come from, roughly. */
const FOREIGN: Array<[string, number]> = [
  ['eng', 30], ['irl', 8], ['nir', 7], ['wal', 3], ['aus', 3], ['can', 2], ['usa', 2], ['den', 2], ['nor', 2],
  ['ned', 3], ['bel', 2], ['fra', 3], ['ger', 2], ['por', 2], ['esp', 1], ['jpn', 3], ['kor', 1], ['nga', 2],
  ['gha', 1], ['sen', 1], ['pol', 1], ['swe', 1], ['isl', 1], ['cro', 1], ['srb', 1], ['bra', 1],
];

const allNations = new Map<string, Nation>();
for (const n of Object.values(FPL_REGIONS)) allNations.set(n.id, n);
for (const n of NATIONS) if (!allNations.has(n.id)) allNations.set(n.id, n);

function nation(id: string): Nation {
  const n = allNations.get(id);
  if (!n) throw new Error(`Unknown nation ${id}`);
  return id === 'sco' ? { ...n, wealth: SCOTLAND_WEALTH } : n;
}

function toClub(info: ScottishClub, leagueId: string): Club {
  return {
    id: info.id,
    name: info.name,
    shortName: info.shortName,
    nationId: 'sco',
    reputation: info.reputation,
    stadium: info.stadium,
    founded: info.founded,
    colours: { primary: info.colours[0], secondary: info.colours[1] },
    leagueId,
    ...(SCOTTISH_OWNERS[info.id] ? { owner: SCOTTISH_OWNERS[info.id]!.owner } : {}),
    ...(SCOTTISH_OWNERS[info.id]?.cash !== undefined ? { startingCash: SCOTTISH_OWNERS[info.id]!.cash } : {}),
  };
}

/** The first 14 are the first-choice players (a full side plus cover); the rest are backups. */
const SHAPE: Position[] = [
  'GK', 'DC', 'DC', 'DL', 'DR', 'DM', 'MC', 'MC', 'AML', 'AMR', 'ST', 'ST', 'AMC', 'DC',
  'GK', 'GK', 'DL', 'DR', 'DM', 'MC', 'ML', 'MR', 'ST', 'DC',
];

function squad(info: ScottishClub, size: number, used: Map<string, Nation>, positions?: readonly Position[], prefix = 'gen'): PackPlayer[] {
  const rng = createRng(hashString(prefix === 'gen' ? `scotland:${info.id}` : `scotland:${prefix}:${info.id}`));
  // Bigger clubs recruit more widely.
  const domesticShare = 0.78 - info.reputation / 200;
  const foreign = FOREIGN.filter(([id]) => allNations.has(id));
  // Generated starters land a little above `meanCa`, backups below, so the best XI averages about `xi`.
  const meanCa = info.xi - 7;
  const players: PackPlayer[] = [];
  for (let n = 0; n < size; n++) {
    const position = positions?.[n] ?? (SHAPE[n % SHAPE.length] as Position);
    const nationId = randInt(rng, 1, 1000) / 1000 < domesticShare ? 'sco' : weightedPick(rng, foreign, ([, w]) => w)[0];
    const nat = nation(nationId);
    used.set(nat.id, nat);
    const starter = n < 14;
    const age = starter ? randInt(rng, 21, 32) : randInt(rng, 17, 24);
    const generated = generatePlayer(rng, {
      id: prefix === 'gen' ? `sco-${info.id}-${n + 1}` : `sco-${info.id}-${prefix}-${n + 1}`,
      position,
      ca: meanCa + (starter ? 4 : -10) + normal(rng, 0, 7),
      age,
      nationId: nat.id,
      namePool: nat.namePool,
      clubId: info.id,
      today: TODAY,
    });
    players.push({
      id: generated.id,
      firstName: generated.firstName,
      lastName: generated.lastName,
      ...(generated.knownAs ? { knownAs: generated.knownAs } : {}),
      nationId: nat.id,
      dateOfBirth: generated.dateOfBirth,
      clubId: info.id,
      positions: generated.positions,
      foot: generated.foot,
      attributes: generated.attributes,
      ca: generated.ca,
      potentialHeadroom: generated.pa - generated.ca,
      squadNumber: null,
      contractExpires: generated.contract?.expires ?? makeDate(2028, 6, 30),
      generated: true,
    });
  }
  return players;
}

/** Players to make a squad up to `size`: two keepers at least, then the usual shape. */
function topUp(info: ScottishClub, have: readonly PackPlayer[], size: number, used: Map<string, Nation>): PackPlayer[] {
  const needed: Position[] = [];
  const keepers = have.filter((p) => p.positions.GK === 20).length;
  for (let k = keepers; k < 2; k++) needed.push('GK');
  const outfield = SHAPE.filter((p) => p !== 'GK');
  for (let i = 0; have.length + needed.length < size; i++) needed.push(outfield[i % outfield.length] as Position);
  if (needed.length === 0) return [];
  const generated = squad(info, needed.length, used, needed, 'top');
  // Top-ups are reserves.
  return generated.map((p) => ({ ...p, ca: Math.max(35, p.ca - 10) }));
}

/** Countries in Scottish squads that no English squad has (FIFA code → name, name pool). */
const EXTRA_NATIONS: Record<string, [string, string]> = {
  FIN: ['Finland', 'dutch'], MTN: ['Mauritania', 'french'], MKD: ['North Macedonia', 'czech'], FRO: ['Faroe Islands', 'dutch'],
  UGA: ['Uganda', 'english'], ZAM: ['Zambia', 'english'], TOG: ['Togo', 'french'], SLE: ['Sierra Leone', 'english'],
  MDA: ['Moldova', 'czech'], GRN: ['Grenada', 'english'], SKN: ['Saint Kitts and Nevis', 'english'], KEN: ['Kenya', 'english'],
  CYP: ['Cyprus', 'english'], JER: ['Jersey', 'english'], ISL: ['Iceland', 'dutch'], LTU: ['Lithuania', 'czech'],
  LVA: ['Latvia', 'czech'], EST: ['Estonia', 'czech'], MLT: ['Malta', 'italian'], GIB: ['Gibraltar', 'english'],
  BER: ['Bermuda', 'english'], TRI: ['Trinidad and Tobago', 'english'], GUY: ['Guyana', 'english'], LBR: ['Liberia', 'english'],
  GAM: ['Gambia', 'english'], GUI: ['Guinea', 'french'], MLI: ['Mali', 'french'], BEN: ['Benin', 'french'], NZL: ['New Zealand', 'english'],
  PHI: ['Philippines', 'english'], THA: ['Thailand', 'english'], CUW: ['Curaçao', 'dutch'], SUR: ['Suriname', 'dutch'],
};

/** Country for a FIFA code from the squad list ('SCO' → Scotland). */
function nationForCode(code: string, unknown: Set<string>): Nation {
  const id = code.toLowerCase();
  const known = allNations.get(id);
  if (known) return id === 'sco' ? nation('sco') : known;
  const extra = EXTRA_NATIONS[code];
  if (extra) return { id, name: extra[0], code, namePool: extra[1] };
  unknown.add(code);
  return { id: id || 'unk', name: code || 'Unknown', code: code || '???', namePool: 'english' };
}

function splitName(name: string): { firstName: string; lastName: string; knownAs?: string } {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: name, lastName: name, knownAs: name };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

function estimatedContractEnd(id: string, age: number): string {
  const rng = createRng(hashString(`contract:${id}`));
  const years = age >= 31 ? randInt(rng, 1, 2) : age >= 27 ? randInt(rng, 1, 3) : randInt(rng, 1, 4);
  return makeDate(2026 + years, 6, 30);
}

interface ReportRow { club: ScottishClub; player: PackPlayer; source: SquadRow | null; flags: string[] }

async function realSquads(used: Map<string, Nation>): Promise<{ players: PackPlayer[]; rows: ReportRow[]; notes: string[] }> {
  const notes: string[] = [];
  const unknownCodes = new Set<string>();
  const squads = new Map<string, { club: ScottishClub; rows: SquadRow[]; outOnLoan: number }>();
  for (const club of [...PREMIERSHIP_CLUBS, ...SCOTTISH_CHAMPIONSHIP_CLUBS]) {
    const url = `https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&prop=wikitext&redirects=1&page=${encodeURIComponent(club.wiki)}`;
    const json = JSON.parse(await fetchCached(url, `scotland/wikipedia-${club.id}.json`, refresh, HEADERS)) as { parse?: { wikitext?: string } };
    // Be gentle with Wikipedia: one request every second or so.
    if (refresh) await new Promise((resolve) => setTimeout(resolve, 1200));
    const parsed = parseSquad(json.parse?.wikitext ?? '');
    if (parsed.current.length < 11) notes.push(`${club.name}: only ${parsed.current.length} players found on Wikipedia.`);
    if (parsed.skipped.length > 0) notes.push(`${club.name}: left out sections ${parsed.skipped.map((s) => `"${s}"`).join(', ')}.`);
    squads.set(club.id, { club, rows: parsed.current, outOnLoan: parsed.outOnLoan.length });
  }

  // A player listed by two clubs (on loan at one) belongs where they are playing: the first list wins.
  const claimed = new Set<string>();
  for (const { rows } of squads.values()) {
    for (let i = rows.length - 1; i >= 0; i--) {
      const key = rows[i]!.article ?? rows[i]!.name;
      if (claimed.has(key)) rows.splice(i, 1);
      else claimed.add(key);
    }
  }

  // Wikidata ids through Wikipedia (which follows redirects), then the details from Wikidata.
  const articles = [...new Set([...squads.values()].flatMap((s) => s.rows.map((r) => r.article).filter((a): a is string => !!a)))];
  const idByArticle = new Map<string, string>();
  for (let i = 0; i < articles.length; i += 50) {
    const batch = articles.slice(i, i + 50);
    const url = pagePropsUrl(batch);
    const text = await fetchCached(url, `scotland/pageprops-${hashString(url).toString(16)}.json`, refresh, HEADERS);
    for (const [title, id] of parsePageProps(JSON.parse(text), batch)) idByArticle.set(title, id);
    if (refresh) await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  // Each player's own article: its infobox says exactly where they play ("Left-back", "Winger").
  const infobox = new Map<string, string[]>();
  for (let i = 0; i < articles.length; i += 50) {
    const batch = articles.slice(i, i + 50);
    const url = articlesUrl(batch);
    const text = await fetchCached(url, `scotland/articles-${hashString(url).toString(16)}.json`, refresh, HEADERS);
    for (const [title, wikitext] of parseArticles(JSON.parse(text), batch)) infobox.set(title, infoboxPositions(wikitext));
    if (refresh) await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  const missing = articles.filter((a) => !idByArticle.has(a));
  if (missing.length > 0) notes.push(`No Wikidata entry found for ${missing.length} linked article(s): ${missing.slice(0, 30).join(', ')}${missing.length > 30 ? ', …' : ''}.`);
  const ids = [...new Set(idByArticle.values())];
  const wikidata = new Map<string, WikidataPlayer>();
  for (let i = 0; i < ids.length; i += 60) {
    const query = playersQuery(ids.slice(i, i + 60));
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
    const text = await fetchCached(url, `scotland/wikidata-${hashString(query).toString(16)}.json`, refresh, { ...HEADERS, Accept: 'application/sparql-results+json' });
    for (const [k, v] of parsePlayers(JSON.parse(text))) wikidata.set(k, v);
    if (refresh) await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const players: PackPlayer[] = [];
  const rows: ReportRow[] = [];
  const usedOverrides = new Set<number>();
  for (const { club, rows: squadRows } of squads.values()) {
    const built: Array<{ row: SquadRow; input: EstimateInput; position: Position; secondary: Position[]; nation: Nation; dob: string; flags: string[] }> = [];
    for (const row of squadRows) {
      const id = `sco-${hashString(row.article ?? `${club.id}:${row.name}`).toString(36)}`;
      const qid = row.article ? idByArticle.get(row.article) : undefined;
      const wd = qid ? wikidata.get(qid) : undefined;
      const flags: string[] = [];
      let dob = wd?.dateOfBirth ?? null;
      if (!dob) {
        // Players without a Wikipedia article are mostly academy and fringe players: high numbers are teenagers.
        const n = row.number ?? 99;
        const age = n >= 40 ? 18 : n >= 30 ? 20 : 24;
        flags.push(`no birth date (age ${age} guessed)`);
        dob = makeDate(2026 - age, 1 + (hashString(`dob:${row.name}`) % 12), 1 + (hashString(`dob-day:${row.name}`) % 28));
      }
      const side = hashString(id) % 2 === 0 ? 'L' : 'R';
      const fromInfobox = row.article ? infobox.get(row.article) ?? [] : [];
      const labels = fromInfobox.length > 0 ? fromInfobox : wd?.positions ?? [];
      const [position, ...secondary] = gamePositions(labels, row.pos, side, fromInfobox.length > 0) as [Position, ...Position[]];
      if (labels.length === 0) flags.push('position from squad list only');
      else if (fromInfobox.length === 0) flags.push('position from Wikidata');
      const nat = nationForCode(row.nat, unknownCodes);
      used.set(nat.id, nat);
      built.push({
        row, position, secondary, nation: nat, dob, flags,
        input: {
          id, age: ageOn(dob, TODAY), number: row.number, seniorInternational: wd?.seniorInternational ?? false,
          keeper: position === 'GK', loanedIn: /on loan from/i.test(row.other),
        },
      });
    }
    const abilities = fitToLevel(built.map((b) => relativeAbility(b.input)), club.xi);
    const clubPlayers: PackPlayer[] = [];
    built.forEach((b, i) => {
      let ca = abilities[i]!;
      let position = b.position;
      const o = SCOTTISH_OVERRIDES.findIndex((x) => x.club === club.id && x.name.toLowerCase() === b.row.name.toLowerCase());
      if (o >= 0) {
        usedOverrides.add(o);
        const override = SCOTTISH_OVERRIDES[o]!;
        if (override.ca) ca = override.ca;
        if (override.position && (POSITIONS as readonly string[]).includes(override.position)) position = override.position as Position;
        b.flags.push('corrected by hand');
      }
      // Attributes and secondary positions are generated to fit the position and ability.
      const rng = createRng(hashString(`sco-player:${b.input.id}`));
      const shape = generatePlayer(rng, {
        id: b.input.id, position, ca, age: b.input.age, nationId: b.nation.id, namePool: b.nation.namePool, clubId: club.id, today: TODAY,
      });
      const player: PackPlayer = {
        id: b.input.id,
        ...splitName(b.row.name),
        nationId: b.nation.id,
        dateOfBirth: b.dob,
        clubId: club.id,
        // Other positions named in the sources are well known to the player.
        positions: {
          ...shape.positions,
          ...Object.fromEntries((position === b.position ? b.secondary : []).map((p) => [p, Math.max(shape.positions[p] ?? 0, 17)])),
        },
        foot: shape.foot,
        attributes: shape.attributes,
        ca: shape.ca,
        potentialHeadroom: Math.round(headroomFor(b.input.age) * (0.6 + 0.8 * ((hashString(`pa:${b.input.id}`) % 100) / 100))),
        squadNumber: b.row.number,
        contractExpires: estimatedContractEnd(b.input.id, b.input.age),
      };
      clubPlayers.push(player);
      rows.push({ club, player, source: b.row, flags: b.flags });
    });
    const size = PREMIERSHIP_CLUBS.includes(club) ? 22 : 20;
    const extra = topUp(club, clubPlayers, size, used);
    if (extra.length > 0) notes.push(`${club.name}: ${extra.length} generated player(s) added to make a squad of ${size}.`);
    for (const p of extra) rows.push({ club, player: p, source: null, flags: ['generated'] });
    players.push(...clubPlayers, ...extra);
  }
  SCOTTISH_OVERRIDES.forEach((o, i) => {
    if (!usedOverrides.has(i)) notes.push(`Override not matched: ${o.name} (${o.club}).`);
  });
  if (unknownCodes.size > 0) notes.push(`Country codes not recognised: ${[...unknownCodes].join(', ')}.`);
  return { players, rows, notes };
}

function report(rows: readonly ReportRow[], notes: readonly string[]): string {
  const lines = [
    '# Scotland 2026-27: squads and estimated ratings',
    '',
    'Squads from Wikipedia, birth dates and positions from Wikidata. Abilities are estimates from',
    "each club's level, age, squad number and senior caps; correct them in",
    '`packages/pipeline/src/scotland/overrides.ts`. Stars = ability on the game\'s 0.5–5 scale.',
    '',
    '## Notes',
    '',
    ...(notes.length > 0 ? notes.map((n) => `- ${n}`) : ['- None.']),
  ];
  const stars = (ca: number) => Math.round(Math.max(0.5, Math.min(5, (ca - 60) / 25)) * 2) / 2;
  for (const club of [...PREMIERSHIP_CLUBS, ...SCOTTISH_CHAMPIONSHIP_CLUBS]) {
    const mine = rows.filter((r) => r.club === club).sort((a, b) => b.player.ca - a.player.ca);
    lines.push('', `## ${club.name} (best XI target ${club.xi})`, '', '| No | Player | Pos | Age | Nat | CA | ★ | Notes |', '|---|---|---|---|---|---|---|---|');
    for (const r of mine) {
      const main = Object.entries(r.player.positions).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?';
      const name = r.player.knownAs ?? `${r.player.firstName} ${r.player.lastName}`;
      lines.push(`| ${r.player.squadNumber ?? ''} | ${name} | ${main} | ${ageOn(r.player.dateOfBirth, TODAY)} | ${r.player.nationId.toUpperCase()} | ${r.player.ca} | ${stars(r.player.ca)} | ${r.flags.join('; ')} |`);
    }
  }
  return lines.join('\n') + '\n';
}

async function main(): Promise<void> {
  const used = new Map<string, Nation>([['sco', nation('sco')]]);
  const clubs = [
    ...PREMIERSHIP_CLUBS.map((c) => toClub(c, PREMIERSHIP)),
    ...SCOTTISH_CHAMPIONSHIP_CLUBS.map((c) => toClub(c, CHAMPIONSHIP)),
  ];
  let players: PackPlayer[];
  let reportText: string | null = null;
  if (generatedOnly) {
    players = [
      ...PREMIERSHIP_CLUBS.flatMap((c) => squad(c, 24, used)),
      ...SCOTTISH_CHAMPIONSHIP_CLUBS.flatMap((c) => squad(c, 22, used)),
    ];
  } else {
    let real;
    try {
      real = await realSquads(used);
    } catch (error) {
      console.error(String(error));
      console.error('\nCould not download the Scottish squads. en.wikipedia.org and query.wikidata.org must be reachable');
      console.error('(allow them in the environment\'s network settings), or run with --generated for made-up squads.');
      process.exit(1);
    }
    players = real.players;
    reportText = report(real.rows, real.notes);
    for (const n of real.notes) console.warn(`note: ${n}`);
  }

  const pack: WorldPack = {
    format: 1,
    id: 'scotland-2026-27',
    name: 'Scotland 2026-27',
    notice: generatedOnly
      ? 'Real Scottish clubs with generated players.'
      : 'Real Scottish squads from Wikipedia and Wikidata; ratings are estimates.',
    createdAt: new Date().toISOString(),
    sources: generatedOnly ? [] : [
      { name: 'Wikipedia (squads, CC BY-SA)', url: 'https://en.wikipedia.org/', usage: 'open' },
      { name: 'Wikidata (birth dates, positions, caps, CC0)', url: 'https://www.wikidata.org/', usage: 'open' },
    ],
    nations: [...used.values()],
    competitions: COMPETITIONS,
    clubs,
    players,
    fixtures: [],
  };

  const problems = validatePack(pack);
  if (problems.length > 0) {
    console.error(`Pack has ${problems.length} problem(s):\n${problems.join('\n')}`);
    process.exit(1);
  }

  const packPath = join(DATA_DIR, 'packs', 'scotland-2026-27.json');
  mkdirSync(join(DATA_DIR, 'packs'), { recursive: true });
  writeFileSync(packPath, JSON.stringify(pack));
  const webPacks = join(import.meta.dirname, '../../../apps/web/public/packs');
  mkdirSync(webPacks, { recursive: true });
  copyFileSync(packPath, join(webPacks, 'scotland-2026-27.json'));
  if (reportText) {
    const reportPath = join(DATA_DIR, 'reports', 'scotland-2026-27-squads.md');
    mkdirSync(join(DATA_DIR, 'reports'), { recursive: true });
    writeFileSync(reportPath, reportText);
    console.log(`Review report: ${reportPath}`);
  }

  const real = players.filter((p) => !p.generated).length;
  console.log(`Wrote ${packPath}`);
  console.log(`  ${clubs.length} clubs, ${players.length} players (${real} real, ${players.length - real} generated)`);
  for (const info of [...PREMIERSHIP_CLUBS, ...SCOTTISH_CHAMPIONSHIP_CLUBS]) {
    const xi = players.filter((p) => p.clubId === info.id).map((p) => p.ca).sort((a, b) => b - a).slice(0, 11);
    console.log(`  ${info.shortName.padEnd(16)} best XI ${(xi.reduce((a, b) => a + b, 0) / 11).toFixed(0)} (target ${info.xi})`);
  }
}

await main();
