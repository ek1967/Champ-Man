import {
  ageOn, assignPlayer, autoTactics, changeFormation, FORMATION_IDS, FORMATIONS, type FormationId, type GameState,
  INSTRUCTION_OPTIONS, isAvailable, mainPosition, MAX_BENCH, type Player, type Position, shortName, squadOf,
  type Tactics, type TeamInstructions,
} from '@moc/engine';
import { useState } from 'react';
import { EntityLink } from '../components/EntityLink.tsx';
import { ensureTactics, saveTactics } from '../state/store.ts';

export const INSTRUCTION_LABELS: Record<keyof TeamInstructions, string> = {
  mentality: 'Mentality',
  passing: 'Passing',
  tempo: 'Tempo',
  width: 'Width',
  pressing: 'Pressing',
  line: 'Defensive line',
  tackling: 'Tackling',
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** How comfortable a player is in a position, in words. */
export function fitLabel(player: Player, position: Position): { label: string; tone: 'good' | 'ok' | 'poor' } {
  const f = player.positions[position] ?? 0;
  if (f >= 18) return { label: 'Natural', tone: 'good' };
  if (f >= 14) return { label: 'Good', tone: 'good' };
  if (f >= 9) return { label: 'Can play', tone: 'ok' };
  return { label: 'Out of position', tone: 'poor' };
}

export function statusOf(player: Player, date: string): string | null {
  if (player.injury && player.injury.until > date) return `Injured: ${player.injury.name.toLowerCase()}`;
  if (player.suspension > 0) return `Suspended (${player.suspension})`;
  return null;
}

function optionLabel(p: Player, date: string): string {
  const status = statusOf(p, date);
  return `${shortName(p)} · ${mainPosition(p)} · ${p.condition}%${status ? ` · ${status}` : ''}`;
}

export function InstructionsForm(props: { value: TeamInstructions; onChange: (next: TeamInstructions) => void; idPrefix: string }) {
  return (
    <div className="instructions">
      {(Object.keys(INSTRUCTION_OPTIONS) as Array<keyof TeamInstructions>).map((key) => (
        <label key={key} className="field inline-field">
          <span>{INSTRUCTION_LABELS[key]}</span>
          <select
            id={`${props.idPrefix}-${key}`}
            value={props.value[key]}
            onChange={(e) => props.onChange({ ...props.value, [key]: e.target.value })}
          >
            {INSTRUCTION_OPTIONS[key].map((option) => (
              <option key={option} value={option}>
                {capital(option)}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

/** Top-down pitch with the formation and the players picked for it. */
export function PitchBoard(props: {
  formation: FormationId;
  lineup: ReadonlyArray<string | null>;
  players: Record<string, Player>;
  date: string;
  selected?: number | null;
  onSelect?: (slot: number) => void;
  badge?: (playerId: string) => string | null;
}) {
  return (
    <div className="pitch" role="group" aria-label="Team shape">
      <div className="pitch-markings" aria-hidden="true">
        <span className="halfway" />
        <span className="circle" />
        <span className="box top" />
        <span className="box bottom" />
      </div>
      {FORMATIONS[props.formation].map((slot, i) => {
        const id = props.lineup[i] ?? null;
        const player = id ? props.players[id] : undefined;
        const status = player ? statusOf(player, props.date) : null;
        const fit = player ? fitLabel(player, slot.position) : null;
        const badge = id && props.badge ? props.badge(id) : null;
        return (
          <button
            key={i}
            type="button"
            className={`slot ${props.selected === i ? 'is-selected' : ''} ${status ? 'is-unavailable' : ''} fit-${fit?.tone ?? 'none'}`}
            style={{ left: `${slot.x}%`, bottom: `${slot.y}%` }}
            onClick={() => props.onSelect?.(i)}
            title={player ? `${shortName(player)}: ${fit?.label}${status ? ` · ${status}` : ''}` : 'Empty'}
          >
            <span className="slot-pos">{slot.position}</span>
            <span className="slot-name">{player ? shortName(player) : '—'}</span>
            {badge && <span className="slot-badge">{badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TacticsScreen({ game }: { game: GameState }) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const clubId = game.manager.clubId;
  const tactics = ensureTactics();
  if (!clubId || !tactics) return <p>You need a club to set tactics.</p>;
  const squad = squadOf(game, clubId);
  const players = game.world.players;
  const date = game.date;
  const slots = FORMATIONS[tactics.formation];
  const picked = new Set([...tactics.lineup, ...tactics.bench].filter((id): id is string => id !== null));
  const unavailablePicked = [...tactics.lineup, ...tactics.bench].filter((id) => id && players[id] && !isAvailable(players[id] as Player, date));
  const update = (next: Tactics) => saveTactics(next);
  const onPitch = tactics.lineup.filter((id): id is string => id !== null).map((id) => players[id]).filter((p): p is Player => !!p);

  const playerSelect = (value: string | null, onChange: (id: string | null) => void, id: string, allowEmpty: boolean) => (
    <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowEmpty && <option value="">— None —</option>}
      {squad.map((p) => (
        <option key={p.id} value={p.id}>
          {optionLabel(p, date)}
          {picked.has(p.id) && p.id !== value ? ' (picked)' : ''}
        </option>
      ))}
    </select>
  );

  const setPiece = (key: 'captainId' | 'penaltyTakerId' | 'freeKickTakerId' | 'cornerTakerId', label: string) => (
    <label className="field inline-field">
      <span>{label}</span>
      <select id={`setpiece-${key}`} value={tactics[key] ?? ''} onChange={(e) => update({ ...tactics, [key]: e.target.value || null })}>
        {onPitch.map((p) => (
          <option key={p.id} value={p.id}>
            {shortName(p)}
          </option>
        ))}
      </select>
    </label>
  );

  const resting = squad.filter((p) => !picked.has(p.id));

  return (
    <div className="screen">
      <header className="screen-head with-controls">
        <div>
          <h1>Tactics</h1>
          <p className="muted">Pick your team and how it plays. Changes are saved straight away and used for the next match.</p>
        </div>
        <div className="button-row">
          <button className="btn" onClick={() => update(autoTactics(squad, date, { formation: tactics.formation, instructions: tactics.instructions }))}>
            Pick best XI
          </button>
          <button className="btn" onClick={() => update(autoTactics(squad, date, { instructions: tactics.instructions }))}>
            Best formation
          </button>
        </div>
      </header>

      {unavailablePicked.length > 0 && (
        <p className="warning">
          {unavailablePicked.length} picked player{unavailablePicked.length > 1 ? 's are' : ' is'} injured or suspended. They will be
          replaced automatically on match day unless you change the selection.
        </p>
      )}

      <div className="tactics-layout">
        <section className="tactics-board">
          <label className="field inline-field">
            <span>Formation</span>
            <select
              id="formation"
              value={tactics.formation}
              onChange={(e) => update(changeFormation(tactics, e.target.value as FormationId, squad, date))}
            >
              {FORMATION_IDS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <PitchBoard
            formation={tactics.formation}
            lineup={tactics.lineup}
            players={players}
            date={date}
            selected={selectedSlot}
            onSelect={(i) => setSelectedSlot(i === selectedSlot ? null : i)}
          />
          <p className="note">Click a shirt to highlight its row below.</p>
        </section>

        <section className="tactics-side">
          <h2>Team instructions</h2>
          <InstructionsForm value={tactics.instructions} onChange={(instructions) => update({ ...tactics, instructions })} idPrefix="ins" />
          <h2>Captain and set pieces</h2>
          <div className="instructions">
            {setPiece('captainId', 'Captain')}
            {setPiece('penaltyTakerId', 'Penalties')}
            {setPiece('freeKickTakerId', 'Free kicks')}
            {setPiece('cornerTakerId', 'Corners')}
          </div>
        </section>
      </div>

      <h2>Starting XI</h2>
      <div className="table-wrap">
        <table className="data selection">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Player</th>
              <th>Fit</th>
              <th className="right">Cond</th>
              <th className="right">Age</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, i) => {
              const id = tactics.lineup[i] ?? null;
              const player = id ? players[id] : undefined;
              const fit = player ? fitLabel(player, slot.position) : null;
              return (
                <tr key={i} className={selectedSlot === i ? 'is-mine' : ''} onClick={() => setSelectedSlot(i)}>
                  <td className="strong">{slot.position}</td>
                  <td>{playerSelect(id, (pid) => update(assignPlayer(tactics, { slot: i }, pid)), `slot-${i}`, false)}</td>
                  <td>{fit && <span className={`fit ${fit.tone}`}>{fit.label}</span>}</td>
                  <td className="right">{player ? <Condition value={player.condition} /> : ''}</td>
                  <td className="right">{player ? ageOn(player.dateOfBirth, date) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>
        Substitutes <span className="muted small">({tactics.bench.length}/{MAX_BENCH})</span>
      </h2>
      <div className="table-wrap">
        <table className="data selection">
          <tbody>
            {Array.from({ length: MAX_BENCH }, (_, i) => {
              const id = tactics.bench[i] ?? null;
              const player = id ? players[id] : undefined;
              return (
                <tr key={i}>
                  <td className="strong">S{i + 1}</td>
                  <td>{playerSelect(id, (pid) => update(assignPlayer(tactics, { bench: i }, pid)), `bench-${i}`, true)}</td>
                  <td className="right">{player ? <Condition value={player.condition} /> : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {resting.length > 0 && (
        <>
          <h2>Not in the squad</h2>
          <p className="resting">
            {resting.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ', '}
                <EntityLink type="player" id={p.id}>
                  {shortName(p)}
                </EntityLink>
                {statusOf(p, date) ? <span className="muted"> ({statusOf(p, date)})</span> : null}
              </span>
            ))}
          </p>
        </>
      )}
    </div>
  );
}

export function Condition({ value }: { value: number }) {
  const tone = value >= 90 ? 'good' : value >= 75 ? 'ok' : 'poor';
  return <span className={`condition ${tone}`}>{value}%</span>;
}
