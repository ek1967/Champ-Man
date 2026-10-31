import { abilityStars, formatShort, type Player } from '@moc/engine';
import { useState } from 'react';

const WIDTH = 320;
const HEIGHT = 96;
const PAD = { top: 8, right: 10, bottom: 18, left: 26 };

/** Ability over the last three years as a single line, on the star scale, with a hover readout. */
export function AbilityChart({ player }: { player: Player }) {
  const [hover, setHover] = useState<number | null>(null);
  const points = player.abilityHistory;
  if (points.length < 2) return <p className="muted small">Not enough history yet: development is recorded monthly.</p>;

  const values = points.map(([, ca]) => ca);
  const min = Math.max(0, Math.min(...values) - 8);
  const max = Math.min(200, Math.max(...values) + 8);
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (ca: number) => PAD.top + (1 - (ca - min) / Math.max(1, max - min)) * (HEIGHT - PAD.top - PAD.bottom);
  const line = points.map(([, ca], i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(ca).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${HEIGHT - PAD.bottom} L${x(0).toFixed(1)},${HEIGHT - PAD.bottom} Z`;
  // Gridlines at whole stars that fall inside the range (CA = 60 + 25 × stars).
  const grid = [1, 2, 3, 4, 5].map((s) => ({ s, ca: 60 + 25 * s })).filter((g) => g.ca >= min && g.ca <= max);
  const last = points.length - 1;
  const shown = hover ?? last;
  const [date, ca] = points[shown]!;

  return (
    <figure className="ability-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Ability from ${formatShort(points[0]![0])} to now: ${abilityStars(values[0]!)} to ${abilityStars(values[last]!)} stars`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
          const i = Math.round(((px - PAD.left) / (WIDTH - PAD.left - PAD.right)) * (points.length - 1));
          setHover(Math.max(0, Math.min(last, i)));
        }}
      >
        {grid.map((g) => (
          <g key={g.s}>
            <line className="chart-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(g.ca)} y2={y(g.ca)} />
            <text className="chart-axis" x={PAD.left - 4} y={y(g.ca) + 3} textAnchor="end">
              {g.s}★
            </text>
          </g>
        ))}
        <path className="chart-area" d={area} />
        <path className="chart-line" d={line} />
        <text className="chart-axis" x={PAD.left} y={HEIGHT - 4}>
          {formatShort(points[0]![0])} {points[0]![0].slice(0, 4)}
        </text>
        <text className="chart-axis" x={WIDTH - PAD.right} y={HEIGHT - 4} textAnchor="end">
          {formatShort(points[last]![0])} {points[last]![0].slice(0, 4)}
        </text>
        {hover !== null && <line className="chart-crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={HEIGHT - PAD.bottom} />}
        <circle className="chart-point" cx={x(shown)} cy={y(ca)} r={4} />
      </svg>
      <figcaption className="small">
        {formatShort(date)} {date.slice(0, 4)}: <strong>{abilityStars(ca)}★</strong>
      </figcaption>
    </figure>
  );
}
