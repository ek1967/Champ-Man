import type { Attributes, HiddenAttributes, Position } from './attributes.ts';
import type { ISODate } from './dates.ts';
import { generateHidden, estimateValue, estimateWage, rolePositions } from './players.ts';
import { createRng, hashString, normal, type Rng } from './rng.ts';
import type { Club, Competition, Nation, Player, World } from './types.ts';
import { assignSquadNumbers } from './worldgen.ts';

/**
 * A world pack is a real-world database (PLAN §5.2, §6): nations, competitions, clubs and
 * players with ratings, plus the real fixture list for the first season. It is produced by
 * the data pipeline and loaded at the start of a new game.
 */
export interface WorldPack {
  format: 1;
  id: string;
  name: string;
  /** Shown on the start screen, e.g. 'Real players, for personal use only'. */
  notice: string;
  createdAt: string;
  sources: Array<{ name: string; url: string; usage: 'personal-only' | 'open' }>;
  nations: Nation[];
  competitions: Competition[];
  clubs: Club[];
  players: PackPlayer[];
  fixtures: PackFixture[];
}

export interface PackPlayer {
  id: string;
  firstName: string;
  lastName: string;
  knownAs?: string;
  nationId: string;
  dateOfBirth: ISODate;
  clubId: string;
  positions: Partial<Record<Position, number>>;
  foot: 'L' | 'R' | 'B';
  attributes: Attributes;
  /** Current Ability, 1–200. */
  ca: number;
  /**
   * Expected room to grow. Each new game rolls the actual Potential Ability around this,
   * so wonderkids differ between saves.
   */
  potentialHeadroom: number;
  squadNumber: number | null;
  /** Contract end; estimated when the source has none. */
  contractExpires: ISODate;
  /** True for players generated to fill out a squad the source doesn't cover. */
  generated?: boolean;
}

export interface PackFixture {
  competitionId: string;
  round: number;
  date: ISODate;
  homeId: string;
  awayId: string;
}

/** Potential Ability for this save: the pack's headroom, varied per game. */
function rollPotential(rng: Rng, player: PackPlayer): number {
  const headroom = Math.max(0, player.potentialHeadroom * (1 + normal(rng, 0, 0.3)));
  return Math.min(200, Math.round(player.ca + headroom));
}

/** Builds the game world from a pack. `seed` only affects per-save variation (potential, hidden traits). */
export function worldFromPack(pack: WorldPack, seed: string, today: ISODate): World {
  const world: World = { nations: {}, clubs: {}, players: {}, competitions: {} };
  for (const nation of pack.nations) world.nations[nation.id] = { ...nation };
  for (const competition of pack.competitions) world.competitions[competition.id] = structuredClone(competition);
  for (const club of pack.clubs) world.clubs[club.id] = { ...club, colours: { ...club.colours } };

  const needsNumbers = new Set<string>();
  for (const source of pack.players) {
    // Each player gets their own generator so adding a player to the pack doesn't change everyone else.
    const rng = createRng(hashString(`${seed}:${source.id}`));
    const hidden: HiddenAttributes = generateHidden(rng, source.ca);
    const pa = rollPotential(rng, source);
    const age = Number(today.slice(0, 4)) - Number(source.dateOfBirth.slice(0, 4));
    const player: Player = {
      id: source.id,
      firstName: source.firstName,
      lastName: source.lastName,
      nationId: source.nationId,
      dateOfBirth: source.dateOfBirth,
      clubId: source.clubId,
      positions: { ...source.positions },
      foot: source.foot,
      attributes: { ...source.attributes },
      hidden,
      ca: source.ca,
      pa,
      contract: { wage: estimateWage(source.ca), expires: source.contractExpires },
      value: estimateValue(source.ca, pa, age),
      squadNumber: source.squadNumber,
      stats: [],
      condition: 100,
      injury: null,
      suspension: 0,
      form: [],
      transferListed: false,
      abilityHistory: [],
      growthCarry: 0,
    };
    if (source.knownAs) player.knownAs = source.knownAs;
    player.positions = rolePositions(player);
    world.players[player.id] = player;
    if (player.squadNumber === null) needsNumbers.add(source.clubId);
  }

  // Clubs whose numbers aren't in the source get them assigned the usual way.
  for (const clubId of needsNumbers) {
    const squad = Object.values(world.players).filter((p) => p.clubId === clubId);
    if (squad.every((p) => p.squadNumber === null)) assignSquadNumbers(squad);
  }
  return world;
}

/**
 * Several packs played as one world (e.g. England and Scotland), so players can move between
 * their leagues. Nations listed in more than one pack are merged, later packs winning.
 */
export function mergePacks(packs: readonly WorldPack[]): WorldPack {
  if (packs.length === 1) return packs[0] as WorldPack;
  const nations = new Map<string, Nation>();
  for (const pack of packs) for (const n of pack.nations) nations.set(n.id, { ...nations.get(n.id), ...n });
  return {
    format: 1,
    id: packs.map((p) => p.id).join('+'),
    name: packs.map((p) => p.name).join(' + '),
    notice: packs.map((p) => p.notice).join(' '),
    createdAt: packs.map((p) => p.createdAt).sort().at(-1) ?? '',
    sources: packs.flatMap((p) => p.sources),
    nations: [...nations.values()],
    competitions: packs.flatMap((p) => p.competitions),
    clubs: packs.flatMap((p) => p.clubs),
    players: packs.flatMap((p) => p.players),
    fixtures: packs.flatMap((p) => p.fixtures),
  };
}

/** Basic integrity checks, run by the pipeline before writing a pack and by tests. */
export function validatePack(pack: WorldPack): string[] {
  const problems: string[] = [];
  const nations = new Set(pack.nations.map((n) => n.id));
  const clubs = new Set(pack.clubs.map((c) => c.id));
  const competitions = new Set(pack.competitions.map((c) => c.id));
  for (const club of pack.clubs) {
    if (!competitions.has(club.leagueId)) problems.push(`Club ${club.id} is in unknown league ${club.leagueId}`);
  }
  const clubIds = new Set<string>();
  for (const club of pack.clubs) {
    if (clubIds.has(club.id)) problems.push(`Duplicate club id ${club.id}`);
    clubIds.add(club.id);
  }
  const seen = new Set<string>();
  for (const p of pack.players) {
    if (seen.has(p.id)) problems.push(`Duplicate player id ${p.id}`);
    seen.add(p.id);
    if (!clubs.has(p.clubId)) problems.push(`Player ${p.id} at unknown club ${p.clubId}`);
    if (!nations.has(p.nationId)) problems.push(`Player ${p.id} has unknown nation ${p.nationId}`);
    if (p.ca < 1 || p.ca > 200) problems.push(`Player ${p.id} has CA ${p.ca}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dateOfBirth)) problems.push(`Player ${p.id} has bad birth date ${p.dateOfBirth}`);
  }
  for (const club of pack.clubs) {
    const squad = pack.players.filter((p) => p.clubId === club.id);
    if (squad.length < 16) problems.push(`${club.name} has only ${squad.length} players`);
    if (!squad.some((p) => p.positions.GK === 20)) problems.push(`${club.name} has no goalkeeper`);
  }
  for (const f of pack.fixtures) {
    if (!clubs.has(f.homeId) || !clubs.has(f.awayId)) problems.push(`Fixture with unknown club ${f.homeId} v ${f.awayId}`);
    if (!competitions.has(f.competitionId)) problems.push(`Fixture in unknown competition ${f.competitionId}`);
  }
  return problems;
}
