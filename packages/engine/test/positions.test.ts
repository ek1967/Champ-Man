import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game.ts';
import { mainPosition, positionFit, rolePositions } from '../src/players.ts';
import { deserializeGame, serializeGame } from '../src/save.ts';
import type { Player } from '../src/types.ts';

function game() {
  return createGame({ seed: 'positions', managerName: 'Test' });
}

describe('positions around a player\'s own', () => {
  it('gives most outfield players somewhere else they can play', () => {
    const players = Object.values(game().world.players).filter((p) => mainPosition(p) !== 'GK');
    const versatile = players.filter((p) => Object.values(p.positions).filter((v) => (v ?? 0) >= 10).length >= 2);
    expect(versatile.length / players.length).toBeGreaterThan(0.95);
  });

  it('keeps goalkeepers in goal and outfielders out of it', () => {
    for (const p of Object.values(game().world.players)) {
      if (mainPosition(p) === 'GK') expect(Object.keys(p.positions)).toEqual(['GK']);
      else expect(p.positions.GK ?? 0).toBeLessThan(10);
    }
  });

  it('never lowers a position and gives the same answer twice', () => {
    const p = Object.values(game().world.players).find((x) => mainPosition(x) === 'DL') as Player;
    const once = rolePositions(p);
    for (const [pos, v] of Object.entries(p.positions)) expect(once[pos as keyof typeof once]).toBeGreaterThanOrEqual(v ?? 0);
    expect(rolePositions({ ...p, positions: once })).toEqual(once);
    expect(positionFit({ ...p, positions: once }, 'WBL')).not.toBe('awkward');
  });

  it('brings older saves up to date', () => {
    const state = game();
    const p = Object.values(state.world.players).find((x) => mainPosition(x) === 'ST') as Player;
    p.positions = { ST: 20 };
    const old = JSON.parse(serializeGame(state));
    old.version = 5;
    const loaded = deserializeGame(JSON.stringify(old));
    expect(loaded.version).toBe(6);
    const after = loaded.world.players[p.id]!;
    expect(after.positions.ST).toBe(20);
    expect(after.positions.AMC ?? 0).toBeGreaterThanOrEqual(8);
  });
});
