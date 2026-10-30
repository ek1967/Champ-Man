import type { Position } from './attributes.ts';
import { positionRating } from './players.ts';
import type { Id, Player } from './types.ts';

export const FORMATION_442: readonly Position[] = ['GK', 'DR', 'DC', 'DC', 'DL', 'MR', 'MC', 'MC', 'ML', 'ST', 'ST'];
export const FORMATION_433: readonly Position[] = ['GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'MC', 'MC', 'AMR', 'AML', 'ST'];
export const FORMATION_4231: readonly Position[] = ['GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'MC', 'AMR', 'AMC', 'AML', 'ST'];

/** Formations the computer chooses between until managers set tactics (Phase 5). */
export const AUTO_FORMATIONS: ReadonlyArray<readonly Position[]> = [FORMATION_442, FORMATION_433, FORMATION_4231];

export interface Lineup {
  /** Player ids in the same order as the formation's slots. */
  playerIds: Id[];
  positions: Position[];
  /** Average effective rating of the XI: the team's strength for the quick simulation. */
  strength: number;
}

/**
 * Picks the strongest XI for a formation. Greedy over all (player, slot) pairs, best first,
 * which handles players who could fill several slots better than filling slots one by one.
 */
export function pickStartingXI(players: readonly Player[], formation: readonly Position[] = FORMATION_442): Lineup {
  const options: Array<{ slot: number; player: Player; rating: number }> = [];
  formation.forEach((position, slot) => {
    for (const player of players) options.push({ slot, player, rating: positionRating(player, position) });
  });
  options.sort((a, b) => b.rating - a.rating);

  const filled: Array<{ player: Player; rating: number } | undefined> = new Array(formation.length);
  const used = new Set<Id>();
  for (const option of options) {
    if (filled[option.slot] || used.has(option.player.id)) continue;
    filled[option.slot] = { player: option.player, rating: option.rating };
    used.add(option.player.id);
  }

  const picked = filled.filter((f): f is { player: Player; rating: number } => f !== undefined);
  const strength = picked.length === 0 ? 0 : picked.reduce((sum, p) => sum + p.rating, 0) / formation.length;
  return {
    playerIds: filled.map((f) => f?.player.id ?? ''),
    positions: [...formation],
    strength,
  };
}

/** The strongest XI across the standard formations, so a squad isn't forced out of position. */
export function pickBestLineup(players: readonly Player[]): Lineup {
  let best: Lineup | null = null;
  for (const formation of AUTO_FORMATIONS) {
    const lineup = pickStartingXI(players, formation);
    if (!best || lineup.strength > best.strength) best = lineup;
  }
  return best as Lineup;
}
