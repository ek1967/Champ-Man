/**
 * Builds the Scotland 2026-27 world pack: a playable Scottish Premiership (with the split after
 * 33 rounds) and a shadow Scottish Championship (PLAN §3.1).
 *
 *   npm run data:scotland
 *
 * The clubs are real; the players are generated, because no open source of Scottish squads is
 * reachable from the build. Nothing here is personal-use data. Writes
 * data/packs/scotland-2026-27.json (also copied to the web app).
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Club, type Competition, createRng, ENGLISH_STYLE_TIEBREAKERS, EUROPEAN_INTERNATIONAL_BREAKS,
  generatePlayer, hashString, type LeagueRules, makeDate, type Nation, NATIONS, normal, type PackPlayer,
  type Position, randInt, validatePack, weightedPick, type WorldPack,
} from '@moc/engine';
import { DATA_DIR } from './fetch.ts';
import { FPL_REGIONS } from './nations.ts';
import { PREMIERSHIP_CLUBS, SCOTTISH_CHAMPIONSHIP_CLUBS, type ScottishClub } from './scotland/clubs.ts';

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
  };
}

/** The first 14 are the first-choice players (a full side plus cover); the rest are backups. */
const SHAPE: Position[] = [
  'GK', 'DC', 'DC', 'DL', 'DR', 'DM', 'MC', 'MC', 'AML', 'AMR', 'ST', 'ST', 'AMC', 'DC',
  'GK', 'GK', 'DL', 'DR', 'DM', 'MC', 'ML', 'MR', 'ST', 'DC',
];

function squad(info: ScottishClub, size: number, used: Map<string, Nation>): PackPlayer[] {
  const rng = createRng(hashString(`scotland:${info.id}`));
  // Bigger clubs recruit more widely.
  const domesticShare = 0.78 - info.reputation / 200;
  const foreign = FOREIGN.filter(([id]) => allNations.has(id));
  // Generated starters land a little above `meanCa`, backups below, so the best XI averages about `xi`.
  const meanCa = info.xi - 7;
  const players: PackPlayer[] = [];
  for (let n = 0; n < size; n++) {
    const position = SHAPE[n % SHAPE.length] as Position;
    const nationId = randInt(rng, 1, 1000) / 1000 < domesticShare ? 'sco' : weightedPick(rng, foreign, ([, w]) => w)[0];
    const nat = nation(nationId);
    used.set(nat.id, nat);
    const starter = n < 14;
    const age = starter ? randInt(rng, 21, 32) : randInt(rng, 17, 24);
    const generated = generatePlayer(rng, {
      id: `sco-${info.id}-${n + 1}`,
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

function main(): void {
  const used = new Map<string, Nation>([['sco', nation('sco')]]);
  const clubs = [
    ...PREMIERSHIP_CLUBS.map((c) => toClub(c, PREMIERSHIP)),
    ...SCOTTISH_CHAMPIONSHIP_CLUBS.map((c) => toClub(c, CHAMPIONSHIP)),
  ];
  const players = [
    ...PREMIERSHIP_CLUBS.flatMap((c) => squad(c, 24, used)),
    ...SCOTTISH_CHAMPIONSHIP_CLUBS.flatMap((c) => squad(c, 22, used)),
  ];

  const pack: WorldPack = {
    format: 1,
    id: 'scotland-2026-27',
    name: 'Scotland 2026-27',
    notice: 'Real Scottish clubs with generated players, until real squads can be added.',
    createdAt: new Date().toISOString(),
    sources: [],
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

  console.log(`Wrote ${packPath}`);
  console.log(`  ${clubs.length} clubs, ${players.length} generated players`);
  for (const info of [...PREMIERSHIP_CLUBS, ...SCOTTISH_CHAMPIONSHIP_CLUBS]) {
    const xi = players.filter((p) => p.clubId === info.id).map((p) => p.ca).sort((a, b) => b - a).slice(0, 11);
    console.log(`  ${info.shortName.padEnd(16)} best XI ${(xi.reduce((a, b) => a + b, 0) / 11).toFixed(0)} (target ${info.xi})`);
  }
}

main();
