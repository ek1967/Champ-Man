/**
 * Builds the England 2026-27 world pack: a playable Premier League with real squads and a
 * shadow Championship (PLAN §3.1).
 *
 *   npm run data:england              uses cached downloads in data/raw
 *   npm run data:england -- --refresh downloads fresh copies
 *
 * Writes data/packs/england-2026-27.json (also copied to the web app) and a review report in
 * data/reports. FPL-derived data is for personal use only and is kept out of git.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Club, type Competition, createRng, ENGLISH_STYLE_TIEBREAKERS, EUROPEAN_INTERNATIONAL_BREAKS,
  generatePlayer, hashString, type LeagueRules, makeDate, mainPosition, type Nation, normal, NATIONS,
  type PackFixture, type PackPlayer, type Position, randInt, validatePack, weightedPick, type WorldPack,
} from '@moc/engine';
import { parseCsv } from './csv.ts';
import { CHAMPIONSHIP_CLUBS, type ClubInfo, ENGLISH_OWNERS, findClub, PREMIER_LEAGUE_CLUBS } from './england/clubs.ts';
import { DATA_DIR, fetchCached } from './fetch.ts';
import { FPL_REGIONS, UNKNOWN_NATION } from './nations.ts';
import { OVERRIDES } from './england/overrides.ts';
import {
  type FplPosition, percentiles, preferredFoot, type RatingInput, rateAttributes, ratePlayer, type Rating,
} from './ratings.ts';

const refresh = process.argv.includes('--refresh');
const TODAY = '2026-06-15';
const PL = 'eng-1';
const CHAMPIONSHIP = 'eng-2';

const SOURCES = {
  fixturesPl: 'https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.1.json',
  fixturesChampionship: 'https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.2.json',
  fplPlayers: 'https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2026-27/players_raw.csv',
  fplTeams: 'https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2026-27/teams.csv',
  fplPlayersLast: 'https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2025-26/players_raw.csv',
  fplTeamsLast: 'https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2025-26/teams.csv',
};

// ---------- Competitions ----------

const PL_RULES: LeagueRules = {
  format: 'league',
  rounds: 2,
  points: { win: 3, draw: 1, loss: 0 },
  tieBreakers: ENGLISH_STYLE_TIEBREAKERS,
  season: { calendar: 'aug-may', start: '08-14', end: '05-24', rollover: '06-20', blocked: EUROPEAN_INTERNATIONAL_BREAKS },
  relegation: { places: 3, to: CHAMPIONSHIP },
  zones: [
    { from: 1, to: 1, kind: 'champion', label: 'Champions' },
    { from: 2, to: 4, kind: 'continental', label: 'Champions League' },
    { from: 5, to: 5, kind: 'continental', label: 'Europa League' },
    { from: 18, to: 20, kind: 'relegation', label: 'Relegated' },
  ],
};

const CHAMPIONSHIP_RULES: LeagueRules = {
  format: 'league',
  rounds: 2,
  points: { win: 3, draw: 1, loss: 0 },
  tieBreakers: ENGLISH_STYLE_TIEBREAKERS,
  season: { calendar: 'aug-may', start: '08-07', end: '05-02', rollover: '06-20', blocked: EUROPEAN_INTERNATIONAL_BREAKS },
  promotion: { places: 2, to: PL },
  promotionPlayoff: { from: 3, to: 6 },
  zones: [
    { from: 1, to: 2, kind: 'promotion', label: 'Promoted' },
    { from: 3, to: 6, kind: 'playoff', label: 'Play-offs' },
  ],
};

const COMPETITIONS: Competition[] = [
  { id: PL, name: 'Premier League', shortName: 'Premier League', nationId: 'eng', tier: 1, mode: 'playable', rules: PL_RULES },
  { id: CHAMPIONSHIP, name: 'EFL Championship', shortName: 'Championship', nationId: 'eng', tier: 2, mode: 'shadow', rules: CHAMPIONSHIP_RULES },
];

// ---------- Helpers ----------

interface OpenFootballMatch {
  round: string;
  date: string;
  team1: string;
  team2: string;
  score?: { ft?: [number, number] };
}

const num = (value: string | undefined): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function toClub(info: ClubInfo, leagueId: string): Club {
  return {
    id: info.id,
    name: info.name,
    shortName: info.shortName,
    nationId: 'eng',
    reputation: info.reputation,
    stadium: info.stadium,
    founded: info.founded,
    colours: { primary: info.colours[0], secondary: info.colours[1] },
    leagueId,
    ...(ENGLISH_OWNERS[info.id] ? { owner: ENGLISH_OWNERS[info.id] } : {}),
  };
}

/** FPL team strength (1–5). The 2026-27 file is missing a column, so take whichever fields hold 1–5 values. */
function teamTier(row: Record<string, string>): number {
  const values = [row.strength, row.strength_overall_home, row.strength_overall_away]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v >= 1 && v <= 5);
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 3;
}

/**
 * Display names: FPL's known_name when given ('Bruno Fernandes', 'Alisson'), otherwise the
 * first given name plus surname. Single names become `knownAs`.
 */
function names(row: Record<string, string>): { firstName: string; lastName: string; knownAs?: string } {
  const known = row.known_name?.trim();
  if (known) {
    const parts = known.split(/\s+/);
    if (parts.length === 1) return { firstName: row.first_name ?? known, lastName: row.second_name ?? '', knownAs: known };
    return { firstName: parts[0] as string, lastName: parts.slice(1).join(' ') };
  }
  const first = (row.first_name ?? '').trim().split(/\s+/)[0] ?? '';
  const surname = (row.second_name ?? '').trim();
  // FPL's short name drops second surnames ('Porro' for 'Porro Sauceda'); use it when it's part of the surname.
  let web = (row.web_name ?? '').replace(/^\p{Lu}\.\s*/u, '').trim();
  if (web.startsWith(`${first} `)) web = web.slice(first.length + 1);
  const lastName = web && surname.toLowerCase().startsWith(web.toLowerCase()) ? surname.slice(0, web.length) : surname;
  return { firstName: first, lastName };
}

const GROUP: Record<string, FplPosition> = { '1': 'GK', '2': 'DEF', '3': 'MID', '4': 'FWD' };

function ageOn(dob: string, date: string): number {
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = date.split('-').map(Number) as [number, number, number];
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/** Contracts aren't in the data: estimate an end date, shorter for older players. */
function estimatedContractEnd(id: string, age: number): string {
  const rng = createRng(hashString(`contract:${id}`));
  const years = age >= 31 ? randInt(rng, 1, 2) : age >= 27 ? randInt(rng, 1, 4) : randInt(rng, 2, 5);
  return makeDate(2026 + years, 6, 30);
}

function per90(row: Record<string, string>) {
  const minutes = num(row.minutes);
  const f = (key: string) => (minutes > 0 ? (num(row[key]) * 90) / minutes : 0);
  return {
    minutes,
    per90: {
      xg: f('expected_goals'),
      xa: f('expected_assists'),
      threat: f('threat'),
      creativity: f('creativity'),
      tackles: f('tackles'),
      cbi: f('clearances_blocks_interceptions'),
      recoveries: f('recoveries'),
      bps: f('bps'),
    },
  };
}

const order = (value: string | undefined): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// ---------- Build ----------

async function main(): Promise<void> {
  const [fixturesPlText, fixturesChText, playersText, teamsText, playersLastText, teamsLastText] = await Promise.all([
    fetchCached(SOURCES.fixturesPl, 'openfootball/2026-27-en.1.json', refresh),
    fetchCached(SOURCES.fixturesChampionship, 'openfootball/2026-27-en.2.json', refresh),
    fetchCached(SOURCES.fplPlayers, 'fpl/2026-27-players_raw.csv', refresh),
    fetchCached(SOURCES.fplTeams, 'fpl/2026-27-teams.csv', refresh),
    fetchCached(SOURCES.fplPlayersLast, 'fpl/2025-26-players_raw.csv', refresh),
    fetchCached(SOURCES.fplTeamsLast, 'fpl/2025-26-teams.csv', refresh),
  ]);

  const warnings: string[] = [];
  const allClubs = [...PREMIER_LEAGUE_CLUBS, ...CHAMPIONSHIP_CLUBS];
  const clubs: Club[] = [
    ...PREMIER_LEAGUE_CLUBS.map((c) => toClub(c, PL)),
    ...CHAMPIONSHIP_CLUBS.map((c) => toClub(c, CHAMPIONSHIP)),
  ];

  // Fixtures (real 2026-27 lists). Results in the source are ignored: the game plays the season itself.
  const fixtures: PackFixture[] = [];
  for (const [competitionId, text, expectedClubs] of [
    [PL, fixturesPlText, PREMIER_LEAGUE_CLUBS],
    [CHAMPIONSHIP, fixturesChText, CHAMPIONSHIP_CLUBS],
  ] as const) {
    const matches = (JSON.parse(text) as { matches: OpenFootballMatch[] }).matches;
    const seen = new Set<string>();
    for (const m of matches) {
      const home = findClub(expectedClubs, m.team1);
      const away = findClub(expectedClubs, m.team2);
      if (!home || !away) {
        warnings.push(`Unknown club in ${competitionId} fixtures: ${m.team1} v ${m.team2}`);
        continue;
      }
      seen.add(home.id).add(away.id);
      fixtures.push({ competitionId, round: Number(m.round.replace(/\D/g, '')), date: m.date, homeId: home.id, awayId: away.id });
    }
    const missing = expectedClubs.filter((c) => !seen.has(c.id)).map((c) => c.name);
    if (missing.length > 0) warnings.push(`${competitionId}: clubs with no fixtures: ${missing.join(', ')}`);
  }

  // FPL teams → our clubs, with their strength tier.
  const teamClub = (rows: Array<Record<string, string>>) => {
    const map = new Map<string, { club: ClubInfo; tier: number }>();
    for (const row of rows) {
      const club = findClub(allClubs, row.name ?? '');
      if (!club) warnings.push(`FPL team not matched: ${row.name}`);
      else map.set(row.id ?? '', { club, tier: teamTier(row) });
    }
    return map;
  };
  const teamsNow = teamClub(parseCsv(teamsText));
  const teamsLast = teamClub(parseCsv(teamsLastText));

  const rowsNow = parseCsv(playersText);
  const rowsLast = parseCsv(playersLastText);
  const lastByCode = new Map(rowsLast.map((r) => [r.code ?? '', r]));
  const codesNow = new Set(rowsNow.map((r) => r.code ?? ''));

  // Games each club has played so far, from its most-used player (usually the keeper).
  const gamesPlayed = new Map<string, number>();
  for (const r of rowsNow) {
    const club = teamsNow.get(r.team ?? '')?.club.id;
    if (!club) continue;
    gamesPlayed.set(club, Math.max(gamesPlayed.get(club) ?? 0, Math.ceil(num(r.minutes) / 90)));
  }

  // Squad members: current PL players, plus last season's players at the relegated clubs.
  interface Candidate { row: Record<string, string>; clubId: string; tier: number; current: boolean }
  const candidates: Candidate[] = [];
  let excluded = 0;
  // Ages drive development, so players without a birth date are left out rather than guessed.
  const noBirthDate: string[] = [];
  const hasBirthDate = (row: Record<string, string>): boolean => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(row.birth_date ?? '')) return true;
    noBirthDate.push(`${row.first_name} ${row.second_name}`);
    return false;
  };
  for (const row of rowsNow) {
    const team = teamsNow.get(row.team ?? '');
    if (!team) continue;
    // 'u' = unavailable: left the club, or out on loan for the season.
    if (row.status === 'u') {
      excluded++;
      continue;
    }
    if (!hasBirthDate(row)) continue;
    candidates.push({ row, clubId: team.club.id, tier: team.tier, current: true });
  }
  const relegated = new Set(CHAMPIONSHIP_CLUBS.map((c) => c.id));
  for (const row of rowsLast) {
    const team = teamsLast.get(row.team ?? '');
    if (!team || !relegated.has(team.club.id)) continue;
    if (codesNow.has(row.code ?? '') || row.status === 'u') continue;
    if (!hasBirthDate(row)) continue;
    candidates.push({ row, clubId: team.club.id, tier: team.tier, current: false });
  }

  const inputs: RatingInput[] = candidates.map(({ row, clubId, tier, current }) => {
    const last = current ? lastByCode.get(row.code ?? '') : row;
    const now = current ? per90(row) : null;
    const prev = last ? per90(last) : null;
    const games = Math.max(1, gamesPlayed.get(clubId) ?? 1);
    // Per-90 figures from whichever season has more minutes behind them.
    const basis = prev && (!now || prev.minutes >= now.minutes) ? prev : now;
    return {
      id: `fpl-${row.code}`,
      group: GROUP[row.element_type ?? ''] ?? 'MID',
      price: num(row.now_cost) / 10,
      age: ageOn(row.birth_date ?? TODAY, TODAY),
      clubTier: tier,
      minutesNow: now ? Math.min(1, now.minutes / (games * 90)) : 0,
      minutesLast: prev ? Math.min(1, prev.minutes / (38 * 90)) : null,
      per90Minutes: basis?.minutes ?? 0,
      per90: basis ? basis.per90 : null,
      setPieces: {
        corners: order(row.corners_and_indirect_freekicks_order),
        freeKicks: order(row.direct_freekicks_order),
        penalties: order(row.penalties_order),
      },
    };
  });
  // Relegated clubs' players count as current at their club for minutes.
  inputs.forEach((input, i) => {
    if (!candidates[i]?.current) {
      input.minutesNow = input.minutesLast ?? 0;
    }
  });

  const pct = percentiles(inputs);
  const nations = new Map<string, Nation>();
  const players: PackPlayer[] = [];
  const ratings = new Map<string, Rating>();
  const unknownNations: string[] = [];

  const usedOverrides = new Set<number>();
  candidates.forEach(({ row, clubId }, i) => {
    const input = inputs[i] as RatingInput;
    const rating = ratePlayer(input, pct.get(input.id));
    const display = names(row);
    const fullName = display.knownAs ?? `${display.firstName} ${display.lastName}`;
    const overrideIndex = OVERRIDES.findIndex((o) => o.name === fullName && o.club === clubId);
    const override = OVERRIDES[overrideIndex];
    if (override) {
      usedOverrides.add(overrideIndex);
      if (override.main) {
        const main = override.main;
        rating.positions = { ...Object.fromEntries(Object.entries(rating.positions).map(([k, v]) => [k, Math.min(v ?? 0, 15)])), [main]: 20 };
        rating.foot = preferredFoot(input.id, main);
      }
      if (override.ca !== undefined) rating.ca = override.ca;
      const main = override.main ?? (Object.entries(rating.positions).find(([, v]) => v === 20)?.[0] as Position);
      rating.attributes = rateAttributes(input, main, rating.ca, pct.get(input.id));
    }
    ratings.set(input.id, rating);
    let nation = FPL_REGIONS[row.region ?? ''];
    if (!nation) {
      nation = UNKNOWN_NATION;
      unknownNations.push(`${row.first_name} ${row.second_name} (region ${row.region})`);
    }
    nations.set(nation.id, nation);
    const squadNumber = Number(row.squad_number);
    players.push({
      id: input.id,
      ...names(row),
      nationId: nation.id,
      dateOfBirth: row.birth_date ?? '2000-01-01',
      clubId,
      positions: rating.positions,
      foot: rating.foot,
      attributes: rating.attributes,
      ca: rating.ca,
      potentialHeadroom: rating.potentialHeadroom,
      squadNumber: Number.isInteger(squadNumber) && squadNumber > 0 ? squadNumber : null,
      contractExpires: estimatedContractEnd(input.id, input.age),
    });
  });

  OVERRIDES.forEach((o, i) => {
    if (!usedOverrides.has(i)) warnings.push(`Override not matched: ${o.name} (${o.club})`);
  });

  // Fill every squad to a playable size; Championship clubs outside the data are fully generated.
  const generatedCounts = new Map<string, number>();
  for (const info of allClubs) {
    const squad = players.filter((p) => p.clubId === info.id);
    const isPl = PREMIER_LEAGUE_CLUBS.includes(info);
    const target = isPl ? 24 : 22;
    const keepers = squad.filter((p) => p.positions.GK === 20).length;
    const shape: Position[] = ['GK', 'GK', 'GK', 'DC', 'DC', 'DC', 'DC', 'DL', 'DR', 'DL', 'DR', 'DM', 'MC', 'MC', 'MC', 'DM', 'AML', 'AMR', 'AMC', 'ML', 'MR', 'ST', 'ST', 'ST'];
    const needed: Position[] = [];
    for (let k = keepers; k < 2; k++) needed.push('GK');
    const rng = createRng(hashString(`generated:${info.id}`));
    while (squad.length + needed.length < target) needed.push(shape[(squad.length + needed.length) % shape.length] as Position);
    // Generated players match the level of the club's real players, or its reputation if it has none.
    const meanCa = squad.length >= 11
      ? [...squad].sort((a, b) => b.ca - a.ca).slice(0, 18).reduce((s, p) => s + p.ca, 0) / 18 - 8
      : 50 + info.reputation;
    needed.forEach((position, n) => {
      const nationId = weightedPick(rng, ['eng', 'eng', 'eng', 'eng', 'sco', 'wal', 'irl', 'nir'], () => 1);
      const nation = FPL_REGIONS[String({ eng: 241, sco: 243, wal: 244, irl: 104, nir: 242 }[nationId])] as Nation;
      nations.set(nation.id, nation);
      const starter = squad.length + n < 14;
      const age = starter ? randInt(rng, 21, 31) : randInt(rng, 18, 24);
      const generated = generatePlayer(rng, {
        id: `gen-${info.id}-${n + 1}`,
        position,
        ca: meanCa + (starter ? 4 : -8) + normal(rng, 0, 7),
        age,
        nationId: nation.id,
        namePool: nation.namePool,
        clubId: info.id,
        today: TODAY,
      });
      players.push({
        id: generated.id,
        firstName: generated.firstName,
        lastName: generated.lastName,
        nationId: nation.id,
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
    });
    generatedCounts.set(info.id, needed.length);
  }

  // Nations: everyone in the data plus the engine's list (used for regens later).
  for (const n of NATIONS) if (!nations.has(n.id)) nations.set(n.id, n);

  const pack: WorldPack = {
    format: 1,
    id: 'england-2026-27',
    name: 'England 2026-27',
    notice: 'Real Premier League players from Fantasy Premier League data. For personal use only.',
    createdAt: new Date().toISOString(),
    sources: [
      { name: 'openfootball (fixtures)', url: 'https://github.com/openfootball/football.json', usage: 'open' },
      { name: 'Fantasy Premier League via vaastav/Fantasy-Premier-League (squads, stats)', url: 'https://github.com/vaastav/Fantasy-Premier-League', usage: 'personal-only' },
    ],
    nations: [...nations.values()],
    competitions: COMPETITIONS,
    clubs,
    players,
    fixtures,
  };

  const problems = validatePack(pack);
  if (problems.length > 0) {
    console.error(`Pack has ${problems.length} problem(s):\n${problems.join('\n')}`);
    process.exit(1);
  }

  const packPath = join(DATA_DIR, 'packs', 'england-2026-27.json');
  mkdirSync(join(DATA_DIR, 'packs'), { recursive: true });
  writeFileSync(packPath, JSON.stringify(pack));
  const webPacks = join(import.meta.dirname, '../../../apps/web/public/packs');
  mkdirSync(webPacks, { recursive: true });
  copyFileSync(packPath, join(webPacks, 'england-2026-27.json'));

  const reportPath = join(DATA_DIR, 'reports', 'england-2026-27-ratings.md');
  mkdirSync(join(DATA_DIR, 'reports'), { recursive: true });
  writeFileSync(reportPath, report(pack, ratings, generatedCounts, excluded, unknownNations, noBirthDate, warnings));

  const real = players.filter((p) => !p.generated).length;
  console.log(`Wrote ${packPath}`);
  console.log(`  ${clubs.length} clubs, ${players.length} players (${real} real, ${players.length - real} generated), ${fixtures.length} fixtures`);
  console.log(`  ${excluded} players left out (left the club or out on loan), ${noBirthDate.length} with no birth date`);
  console.log(`Review report: ${reportPath}`);
  for (const w of warnings) console.warn(`warning: ${w}`);
}

function report(
  pack: WorldPack,
  ratings: Map<string, Rating>,
  generated: Map<string, number>,
  excluded: number,
  unknownNations: string[],
  noBirthDate: string[],
  warnings: string[],
): string {
  const clubName = new Map(pack.clubs.map((c) => [c.id, c.shortName]));
  const display = (p: PackPlayer) => p.knownAs ?? `${p.firstName} ${p.lastName}`;
  const age = (p: PackPlayer) => ageOn(p.dateOfBirth, TODAY);
  const main = (p: PackPlayer) => mainPosition({ positions: p.positions } as never);
  const sig = (p: PackPlayer) => {
    const s = ratings.get(p.id)?.signals;
    if (!s) return 'generated';
    const f = (x: number | null) => (x === null ? '–' : x.toFixed(2));
    return `price ${f(s.price)} · regular ${f(s.regularity)} · perf ${f(s.performance)} · club ${f(s.club)}`;
  };
  const lines: string[] = [];
  lines.push('# England 2026-27 ratings review', '');
  lines.push('Current Ability (CA) is on a 1–200 scale. Potential is rolled per save around CA + headroom.', '');
  lines.push(`Players left out because they left their club or are on loan elsewhere: ${excluded}.`, '');

  const real = pack.players.filter((p) => !p.generated).sort((a, b) => b.ca - a.ca);
  lines.push('## Top 60 players', '', '| # | Player | Club | Pos | Age | CA | Signals |', '|---|---|---|---|---|---|---|');
  real.slice(0, 60).forEach((p, i) => {
    lines.push(`| ${i + 1} | ${display(p)} | ${clubName.get(p.clubId)} | ${main(p)} | ${age(p)} | ${p.ca} | ${sig(p)} |`);
  });

  lines.push('', '## Best young players (21 and under)', '', '| Player | Club | Pos | Age | CA | Headroom |', '|---|---|---|---|---|---|');
  for (const p of real.filter((x) => age(x) <= 21).slice(0, 25)) {
    lines.push(`| ${display(p)} | ${clubName.get(p.clubId)} | ${main(p)} | ${age(p)} | ${p.ca} | +${p.potentialHeadroom} |`);
  }

  lines.push('', '## Club strength (average CA of the best 11)', '', '| Club | League | Best XI | Squad | Generated |', '|---|---|---|---|---|');
  const strength = pack.clubs.map((c) => {
    const squad = pack.players.filter((p) => p.clubId === c.id).sort((a, b) => b.ca - a.ca);
    const xi = squad.slice(0, 11).reduce((s, p) => s + p.ca, 0) / 11;
    return { c, xi, size: squad.length };
  }).sort((a, b) => b.xi - a.xi);
  for (const { c, xi, size } of strength) {
    lines.push(`| ${c.name} | ${c.leagueId === 'eng-1' ? 'PL' : 'Champ'} | ${xi.toFixed(1)} | ${size} | ${generated.get(c.id) ?? 0} |`);
  }

  lines.push('', '## Premier League squads', '');
  for (const c of pack.clubs.filter((x) => x.leagueId === 'eng-1')) {
    lines.push(`### ${c.name}`, '', '| Player | Pos | Age | CA | Nat |', '|---|---|---|---|---|');
    for (const p of pack.players.filter((x) => x.clubId === c.id).sort((a, b) => b.ca - a.ca)) {
      lines.push(`| ${display(p)}${p.generated ? ' *(generated)*' : ''} | ${main(p)} | ${age(p)} | ${p.ca} | ${p.nationId.toUpperCase()} |`);
    }
    lines.push('');
  }
  if (noBirthDate.length > 0) lines.push('## Left out: no birth date in the data', '', ...noBirthDate.map((n) => `- ${n}`), '');
  if (unknownNations.length > 0) lines.push('## Unknown nationality', '', ...unknownNations.map((n) => `- ${n}`), '');
  if (warnings.length > 0) lines.push('## Warnings', '', ...warnings.map((w) => `- ${w}`), '');
  return lines.join('\n');
}

await main();
