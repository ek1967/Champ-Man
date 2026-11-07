import { mainPosition, type Player, type Position, type PositionFit, POSITION_FIT_LABELS, POSITIONS, positionFit } from '@moc/engine';

/** One position, coloured by how well the player plays it (dark green, light green, yellow, red). */
export function FitChip({ player, position }: { player: Player; position: Position }) {
  const fit = positionFit(player, position);
  return (
    <span className={`fit-chip ${fit}`} title={`${position}: ${POSITION_FIT_LABELS[fit]}`}>
      {position}
    </span>
  );
}

/** The positions a player is comfortable in (accomplished or better), main one first, coloured. */
export function PositionTags({ player, limit = 3, min = 15 }: { player: Player; limit?: number; min?: number }) {
  const main = mainPosition(player);
  const others = POSITIONS.filter((p) => p !== main && (player.positions[p] ?? 0) >= min).sort(
    (a, b) => (player.positions[b] ?? 0) - (player.positions[a] ?? 0),
  );
  const shown = [main, ...others].slice(0, limit);
  return (
    <span className="fit-tags">
      {shown.map((p) => (
        <FitChip key={p} player={player} position={p} />
      ))}
    </span>
  );
}

/** Rows of a pitch, attack at the top, as the positions sit on it. */
const PITCH_ROWS: Array<Array<Position | null>> = [
  [null, 'ST', null],
  ['AML', 'AMC', 'AMR'],
  ['ML', 'MC', 'MR'],
  ['WBL', 'DM', 'WBR'],
  ['DL', 'DC', 'DR'],
  [null, 'GK', null],
];

/** Every position on a small pitch, coloured by how well the player plays there. */
export function PositionPitch({ player }: { player: Player }) {
  return (
    <figure className="position-pitch" aria-label="Positions">
      <div className="position-grid">
        {PITCH_ROWS.flat().map((p, i) =>
          p ? (
            <span key={p} className={`fit-chip ${positionFit(player, p)}`} title={`${p}: ${POSITION_FIT_LABELS[positionFit(player, p)]}`}>
              {p}
            </span>
          ) : (
            <span key={`gap-${i}`} />
          ),
        )}
      </div>
      <FitLegend />
    </figure>
  );
}

export function FitLegend() {
  return (
    <div className="fit-legend">
      {(Object.keys(POSITION_FIT_LABELS) as PositionFit[]).map((fit) => (
        <span key={fit}>
          <span className={`fit-dot ${fit}`} aria-hidden="true" /> {POSITION_FIT_LABELS[fit]}
        </span>
      ))}
    </div>
  );
}
