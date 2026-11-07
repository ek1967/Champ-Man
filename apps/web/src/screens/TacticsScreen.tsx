import {
  abilityStars, ageOn, assignPlayer, ATTRIBUTE_LABELS, type AttributeKey, attributeBand, autoTactics, changeFormation,
  DEFAULT_PLAYER_INSTRUCTIONS, FORMATION_IDS, FORMATIONS, type FormationId, type GameState, INSTRUCTION_OPTIONS,
  isAvailable, mainPosition, MAX_BENCH, normalizeTactics, PLAYER_INSTRUCTION_OPTIONS, type Player,
  type PlayerInstructions, type Position, POSITION_PROFILES, POSITIONS, positionStars, selectionRating, shortName,
  squadOf, type Tactics, type TeamInstructions, POSITION_FIT_LABELS, type PositionFit, positionFit,
} from '@moc/engine';
import { FitLegend, PositionTags } from '../components/Positions.tsx';
import { useState } from 'react';
import { EntityLink } from '../components/EntityLink.tsx';
import { ConditionBar, FormChips, Stars } from '../components/Ratings.tsx';
import { type Column, SortableTable } from '../components/SortableTable.tsx';
import { ensureTactics, saveTactics } from '../state/store.ts';
import { PotentialEstimate, sortablePotential } from '../components/Scouting.tsx';

export const INSTRUCTION_LABELS: Record<keyof TeamInstructions, string> = {
  mentality: 'Mentality',
  passing: 'Passing',
  tempo: 'Tempo',
  width: 'Width',
  pressing: 'Pressing',
  line: 'Defensive line',
  tackling: 'Tackling',
  counter: 'Counter-attack',
  offsideTrap: 'Offside trap',
};

/** What each choice does, in plain words, shown under the setting. */
const INSTRUCTION_HELP: { [K in keyof TeamInstructions]: Record<TeamInstructions[K], string> } = {
  mentality: {
    'ultra-defensive': 'Everyone behind the ball. Very hard to break down, but you will rarely threaten.',
    defensive: 'Keep players back and protect what you have.',
    cautious: 'Safety first; attack in numbers only when it is on.',
    balanced: 'An even split between attack and defence.',
    positive: 'Take the initiative and get bodies forward.',
    attacking: 'Commit players forward: more chances at both ends.',
    'ultra-attacking': 'All-out attack. Lots of chances, wide open at the back, and tiring.',
  },
  passing: {
    short: 'Keep the ball and work openings: fewer chances, but better ones.',
    mixed: 'Mix it up as the game demands.',
    direct: 'Get it forward quickly: more attacks, lower-quality chances.',
  },
  tempo: {
    slow: 'Slow the game down: fewer attacks for both sides, saves energy.',
    normal: 'Play at a natural pace.',
    fast: 'Speed everything up: more attacks for both sides, tiring.',
  },
  width: {
    narrow: 'Stay compact through the middle: harder to play through, fewer crosses.',
    normal: 'Use the whole pitch as needed.',
    wide: 'Stretch the pitch: more crosses and headed chances.',
  },
  pressing: {
    low: 'Drop off and hold shape: less tiring, gives up the ball.',
    medium: 'Press when the moment is right.',
    high: 'Hunt the ball high up: more possession, more fouls, very tiring.',
  },
  line: {
    deep: 'Defend near your own box: hard to get behind, less support going forward.',
    normal: 'A standard back line.',
    high: 'Squeeze up to dominate the ball, but quick forwards can get in behind.',
  },
  tackling: {
    easy: 'Stay on your feet: fewer fouls and cards, a little easier to get past.',
    normal: 'Tackle when it is on.',
    hard: 'Get stuck in: win more of the ball, risk more fouls and cards.',
  },
  counter: {
    off: 'Build attacks in the usual way.',
    on: 'Sit a little deeper and break fast when you win it back. Deadly against sides that push up.',
  },
  offsideTrap: {
    off: 'Defenders track the runners.',
    on: 'Step up together to catch forwards offside. Quick forwards can beat it.',
  },
};

const PLAYER_INSTRUCTION_LABELS: Record<keyof PlayerInstructions, string> = {
  runs: 'Forward runs',
  shooting: 'Long shots',
  closingDown: 'Closing down',
};

const PLAYER_INSTRUCTION_HELP: { [K in keyof PlayerInstructions]: Record<PlayerInstructions[K], string> } = {
  runs: {
    stay: 'Holds position and protects the defence.',
    mixed: 'Joins attacks when it makes sense.',
    forward: 'Gets into the box at every chance: more shots, less defending, more tiring.',
  },
  shooting: {
    rarely: 'Looks for a pass rather than shooting from distance.',
    normal: 'Shoots from range when there is a sight of goal.',
    often: 'Shoots on sight from range.',
  },
  closingDown: {
    less: 'Holds shape rather than pressing.',
    normal: 'Presses when the moment is right.',
    more: 'Presses the player on the ball: wins it back more, fouls more, tires faster.',
  },
};

export const optionLabel = (s: string) => {
  const text = s.replace('-', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** How comfortable a player is in a position, in words. */
export function fitLabel(player: Player, position: Position): { label: string; tone: PositionFit } {
  const tone = positionFit(player, position);
  return { label: POSITION_FIT_LABELS[tone], tone };
}

export function statusOf(player: Player, date: string): string | null {
  if (player.injury && player.injury.until > date) return `Injured: ${player.injury.name.toLowerCase()} (back ${player.injury.until.slice(5).split('-').reverse().join('/')})`;
  if (player.suspension > 0) return `Suspended for ${player.suspension} match${player.suspension > 1 ? 'es' : ''}`;
  return null;
}

/** Kept for screens that show fitness as a single value. */
export function Condition({ value }: { value: number }) {
  return <ConditionBar value={value} />;
}


function seasonLine(game: GameState, player: Player) {
  const club = player.clubId ? game.world.clubs[player.clubId] : undefined;
  const seasonId = club ? game.currentSeason[club.leagueId] : undefined;
  const label = seasonId ? game.seasons[seasonId]?.label : undefined;
  const s = player.stats.find((x) => x.season === label && x.competitionId === club?.leagueId);
  return { apps: s?.apps ?? 0, goals: s?.goals ?? 0, assists: s?.assists ?? 0, rating: s && s.apps > 0 ? s.ratingTotal / s.apps : null };
}

export function InstructionsForm(props: { value: TeamInstructions; onChange: (next: TeamInstructions) => void; idPrefix: string; help?: boolean }) {
  return (
    <div className="instruction-grid">
      {(Object.keys(INSTRUCTION_OPTIONS) as Array<keyof TeamInstructions>).map((key) => (
        <div key={key} className="instruction">
          <label className="instruction-head" htmlFor={`${props.idPrefix}-${key}`}>
            <span>{INSTRUCTION_LABELS[key]}</span>
            <select
              id={`${props.idPrefix}-${key}`}
              value={props.value[key]}
              onChange={(e) => props.onChange({ ...props.value, [key]: e.target.value })}
            >
              {INSTRUCTION_OPTIONS[key].map((option) => (
                <option key={option} value={option}>
                  {optionLabel(option)}
                </option>
              ))}
            </select>
          </label>
          {props.help !== false && (
            <p className="instruction-help">{(INSTRUCTION_HELP[key] as Record<string, string>)[props.value[key]]}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Top-down pitch with the formation, each shirt showing the player, their stars and fitness. */
export function PitchBoard(props: {
  formation: FormationId;
  lineup: ReadonlyArray<string | null>;
  players: Record<string, Player>;
  date: string;
  selected?: number | null;
  onSelect?: (slot: number) => void;
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
        return (
          <button
            key={i}
            type="button"
            className={`slot ${props.selected === i ? 'is-selected' : ''} ${status ? 'is-unavailable' : ''} fit-${fit?.tone ?? 'none'}`}
            style={{ left: `${slot.x}%`, bottom: `${slot.y}%` }}
            onClick={() => props.onSelect?.(i)}
            title={player ? `${shortName(player)}: ${fit?.label}${status ? ` · ${status}` : ''}` : 'Empty: filled automatically on match day'}
          >
            <span className="slot-pos">{slot.position}</span>
            <span className="slot-name">{player ? shortName(player) : 'Empty'}</span>
            {player && (
              <span className="slot-meta">
                <Stars value={positionStars(player, slot.position)} label="Ability in this position" small />
                <ConditionBar value={player.condition} compact />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PlayerCard(props: { game: GameState; player: Player; position: Position; tactics: Tactics; onInstructions: (pi: PlayerInstructions) => void }) {
  const { game, player, position, tactics } = props;
  const pi = { ...DEFAULT_PLAYER_INSTRUCTIONS, ...tactics.players?.[player.id] };
  const status = statusOf(player, game.date);
  const season = seasonLine(game, player);
  const profile = POSITION_PROFILES[position];
  const keyAttributes = (Object.entries(profile) as Array<[AttributeKey, number]>).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const fit = fitLabel(player, position);
  const nation = game.world.nations[player.nationId];
  return (
    <div className="player-card">
      <div className="player-card-head">
        <div>
          <h3 className="player-card-name">
            <EntityLink type="player" id={player.id}>
              {player.knownAs ?? `${player.firstName} ${player.lastName}`}
            </EntityLink>
          </h3>
          <p className="muted small">
            <PositionTags player={player} /> · {ageOn(player.dateOfBirth, game.date)} · {nation?.code}
          </p>
        </div>
        <span className={`fit ${fit.tone}`}>
          {position}: {fit.label}
        </span>
      </div>
      {status && <p className="warning small">{status}</p>}
      <dl className="card-facts">
        <div><dt>Ability</dt><dd><Stars value={abilityStars(player.ca)} /></dd></div>
        <div><dt>Potential</dt><dd><PotentialEstimate game={game} player={player} /></dd></div>
        <div><dt>In this position</dt><dd><Stars value={positionStars(player, position)} label="Ability in this position" /></dd></div>
        <div><dt>Fitness</dt><dd><ConditionBar value={player.condition} /></dd></div>
        <div><dt>Form</dt><dd><FormChips form={player.form} /></dd></div>
        <div>
          <dt>Season</dt>
          <dd>
            {season.apps} apps · {season.goals} gls · {season.assists} ast
            {season.rating !== null && ` · ${season.rating.toFixed(2)} avg`}
          </dd>
        </div>
      </dl>
      <h4>Key attributes for {position}</h4>
      <dl className="key-attrs">
        {keyAttributes.map(([key]) => (
          <div key={key}>
            <dt>{ATTRIBUTE_LABELS[key]}</dt>
            <dd className={`attr ${attributeBand(player.attributes[key])}`}>{player.attributes[key]}</dd>
          </div>
        ))}
      </dl>
      {position !== 'GK' && (
        <>
          <h4>Player instructions</h4>
          {(Object.keys(PLAYER_INSTRUCTION_OPTIONS) as Array<keyof PlayerInstructions>).map((key) => (
            <div key={key} className="instruction">
              <label className="instruction-head" htmlFor={`pi-${key}`}>
                <span>{PLAYER_INSTRUCTION_LABELS[key]}</span>
                <select id={`pi-${key}`} value={pi[key]} onChange={(e) => props.onInstructions({ ...pi, [key]: e.target.value })}>
                  {PLAYER_INSTRUCTION_OPTIONS[key].map((option) => (
                    <option key={option} value={option}>
                      {optionLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="instruction-help">{(PLAYER_INSTRUCTION_HELP[key] as Record<string, string>)[pi[key]]}</p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

type Selection = { kind: 'slot'; index: number } | { kind: 'bench'; index: number } | { kind: 'none' };

export function TacticsScreen({ game }: { game: GameState }) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const clubId = game.manager.clubId;
  const saved = ensureTactics();
  if (!clubId || !saved) return <p>You need a club to set tactics.</p>;
  const tactics = normalizeTactics(saved);
  const squad = squadOf(game, clubId);
  const players = game.world.players;
  const date = game.date;
  const slots = FORMATIONS[tactics.formation];
  const update = (next: Tactics) => saveTactics(next);

  const selectionOf = (id: string): Selection => {
    const slot = tactics.lineup.indexOf(id);
    if (slot >= 0) return { kind: 'slot', index: slot };
    const bench = tactics.bench.indexOf(id);
    if (bench >= 0) return { kind: 'bench', index: bench };
    return { kind: 'none' };
  };
  const unavailablePicked = [...tactics.lineup, ...tactics.bench].filter((id) => id && players[id] && !isAvailable(players[id] as Player, date));
  const emptySlots = tactics.lineup.filter((id) => id === null).length;
  const onPitch = tactics.lineup.filter((id): id is string => id !== null).map((id) => players[id]).filter((p): p is Player => !!p);

  const selectedPosition = selectedSlot !== null ? slots[selectedSlot]?.position : undefined;
  const selectedPlayerId = selectedSlot !== null ? tactics.lineup[selectedSlot] ?? null : null;
  const selectedPlayer = selectedPlayerId ? players[selectedPlayerId] : undefined;
  const alternatives = selectedPosition
    ? squad
        .filter((p) => p.id !== selectedPlayerId && isAvailable(p, date))
        .sort((a, b) => selectionRating(b, selectedPosition) - selectionRating(a, selectedPosition))
        .slice(0, 6)
    : [];

  const setSelection = (player: Player, value: string) => {
    const current = selectionOf(player.id);
    if (value === 'none') {
      if (current.kind === 'slot') update(assignPlayer(tactics, { slot: current.index }, null));
      if (current.kind === 'bench') update(assignPlayer(tactics, { bench: current.index }, null));
      return;
    }
    if (value.startsWith('bench:')) {
      // A particular bench place: replaces that substitute (who drops out of the squad), or swaps
      // places with them if this player is starting or already on the bench.
      update(assignPlayer(tactics, { bench: Number(value.slice(6)) }, player.id));
      return;
    }
    if (value === 'bench') {
      if (current.kind === 'bench' || tactics.bench.length >= MAX_BENCH) return;
      if (current.kind === 'slot') {
        // Move to a new place on the bench and leave the slot open.
        const cleared = assignPlayer(tactics, { slot: current.index }, null);
        update(assignPlayer(cleared, { bench: cleared.bench.length }, player.id));
      } else {
        update(assignPlayer(tactics, { bench: tactics.bench.length }, player.id));
      }
      return;
    }
    update(assignPlayer(tactics, { slot: Number(value) }, player.id));
  };

  const slotName = (i: number) => {
    const pos = slots[i]?.position ?? '';
    const same = slots.filter((s) => s.position === pos).length;
    const nth = slots.slice(0, i + 1).filter((s) => s.position === pos).length;
    return same > 1 ? `${pos} ${nth}` : pos;
  };

  const columns: Column<Player>[] = [
    {
      id: 'sel',
      label: 'Selection',
      render: (p) => {
        const sel = selectionOf(p.id);
        const value = sel.kind === 'slot' ? String(sel.index) : sel.kind === 'bench' ? `bench:${sel.index}` : 'none';
        return (
          <select id={`sel-${p.id}`} className={`sel sel-${sel.kind}`} value={value} onChange={(e) => setSelection(p, e.target.value)}>
            <option value="none">—</option>
            <optgroup label="Starting">
              {slots.map((_, i) => (
                <option key={i} value={String(i)}>
                  {slotName(i)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Substitutes">
              {tactics.bench.map((id, i) => {
                const sub = players[id];
                return (
                  <option key={id} value={`bench:${i}`}>
                    {`Sub ${i + 1}${sub && sub.id !== p.id ? `: ${shortName(sub)}` : ''}`}
                  </option>
                );
              })}
              {tactics.bench.length < MAX_BENCH && sel.kind !== 'bench' && <option value="bench">New sub</option>}
            </optgroup>
          </select>
        );
      },
      sortValue: (p) => {
        const sel = selectionOf(p.id);
        return sel.kind === 'slot' ? sel.index : sel.kind === 'bench' ? 20 + sel.index : 99;
      },
    },
    {
      id: 'name',
      label: 'Name',
      render: (p) => (
        <EntityLink type="player" id={p.id}>
          {shortName(p)}
        </EntityLink>
      ),
      sortValue: (p) => p.knownAs ?? p.lastName,
    },
    { id: 'pos', label: 'Pos', render: (p) => <PositionTags player={p} />, sortValue: (p) => POSITIONS.indexOf(mainPosition(p)) },
    { id: 'ability', label: 'Ability', render: (p) => <Stars value={abilityStars(p.ca)} />, sortValue: (p) => p.ca },
    { id: 'potential', label: 'Potential', render: (p) => <PotentialEstimate game={game} player={p} />, sortValue: (p) => sortablePotential(game, p) },
    {
      id: 'fit',
      label: selectedPosition ? `As ${selectedPosition}` : 'In role',
      title: selectedPosition ? `How good each player would be as ${selectedPosition}` : 'How good they are in the position they are picked for',
      render: (p) => {
        const sel = selectionOf(p.id);
        const pos = selectedPosition ?? (sel.kind === 'slot' ? slots[sel.index]?.position : mainPosition(p)) ?? mainPosition(p);
        const fit = fitLabel(p, pos);
        return (
          <span className="fit-cell">
            <Stars value={positionStars(p, pos)} label={`Ability as ${pos}`} small />
            <span className={`fit ${fit.tone}`}>{fit.label}</span>
          </span>
        );
      },
      sortValue: (p) => {
        const sel = selectionOf(p.id);
        const pos = selectedPosition ?? (sel.kind === 'slot' ? slots[sel.index]?.position : mainPosition(p)) ?? mainPosition(p);
        return selectionRating(p, pos);
      },
    },
    { id: 'cond', label: 'Fitness', render: (p) => <ConditionBar value={p.condition} />, sortValue: (p) => p.condition },
    { id: 'form', label: 'Form', render: (p) => <FormChips form={p.form} />, sortValue: (p) => (p.form.length ? p.form.reduce((a, b) => a + b, 0) / p.form.length : 0) },
    {
      id: 'season',
      label: 'Apps/Gls',
      render: (p) => {
        const s = seasonLine(game, p);
        return `${s.apps} / ${s.goals}`;
      },
      sortValue: (p) => seasonLine(game, p).apps,
      align: 'right',
    },
    {
      id: 'status',
      label: 'Status',
      render: (p) => {
        const status = statusOf(p, date);
        return status ? <span className="tag danger" title={status}>{status.startsWith('Injured') ? 'Injured' : 'Banned'}</span> : <span className="tag ok">Fit</span>;
      },
      sortValue: (p) => (statusOf(p, date) ? 1 : 0),
    },
    { id: 'age', label: 'Age', render: (p) => ageOn(p.dateOfBirth, date), sortValue: (p) => ageOn(p.dateOfBirth, date), align: 'right' },
  ];

  const setPiece = (key: 'captainId' | 'penaltyTakerId' | 'freeKickTakerId' | 'cornerTakerId', label: string) => (
    <label className="instruction-head" htmlFor={`setpiece-${key}`}>
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

  return (
    <div className="screen">
      <header className="screen-head with-controls">
        <div>
          <h1>Tactics</h1>
          <p className="muted">Click a shirt to see the player, give them instructions or swap them. Changes save straight away.</p>
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

      {(unavailablePicked.length > 0 || emptySlots > 0) && (
        <p className="warning">
          {unavailablePicked.length > 0 &&
            `${unavailablePicked.length} picked player${unavailablePicked.length > 1 ? 's are' : ' is'} injured or banned. `}
          {emptySlots > 0 && `${emptySlots} position${emptySlots > 1 ? 's are' : ' is'} empty. `}
          On match day these are filled with the best available player.
        </p>
      )}

      <div className="tactics-layout">
        <section className="tactics-board">
          <label className="instruction-head" htmlFor="formation">
            <span>Formation</span>
            <select id="formation" value={tactics.formation} onChange={(e) => update(changeFormation(tactics, e.target.value as FormationId, squad, date))}>
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
          <FitLegend />
          <p className="legend-line">Shirts show how well each player knows the position; stars show ability there.</p>
        </section>

        <section className="tactics-side">
          {selectedSlot !== null && selectedPosition ? (
            <>
              <div className="panel-head">
                <h2>{slotName(selectedSlot)}</h2>
                <button className="btn small ghost" onClick={() => setSelectedSlot(null)}>
                  Close
                </button>
              </div>
              {selectedPlayer ? (
                <PlayerCard
                  game={game}
                  player={selectedPlayer}
                  position={selectedPosition}
                  tactics={tactics}
                  onInstructions={(pi) => update({ ...tactics, players: { ...tactics.players, [selectedPlayer.id]: pi } })}
                />
              ) : (
                <p className="muted">Nobody picked here yet.</p>
              )}
              <h4>Best options for {selectedPosition}</h4>
              <ul className="alternatives">
                {alternatives.map((p) => {
                  const sel = selectionOf(p.id);
                  return (
                    <li key={p.id}>
                      <span className="alt-name">
                        {shortName(p)}
                        <span className="muted small"> {sel.kind === 'slot' ? `(playing ${slotName(sel.index)})` : sel.kind === 'bench' ? '(sub)' : ''}</span>
                      </span>
                      <Stars value={positionStars(p, selectedPosition)} label={`Ability as ${selectedPosition}`} small />
                      <ConditionBar value={p.condition} />
                      <button className="btn small" onClick={() => update(assignPlayer(tactics, { slot: selectedSlot }, p.id))}>
                        {sel.kind === 'slot' ? 'Swap' : 'Pick'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              <h2>Team instructions</h2>
              <InstructionsForm value={tactics.instructions} onChange={(instructions) => update({ ...tactics, instructions })} idPrefix="ins" />
              <h2>Captain and set pieces</h2>
              <div className="instruction-grid">
                {setPiece('captainId', 'Captain')}
                {setPiece('penaltyTakerId', 'Penalties')}
                {setPiece('freeKickTakerId', 'Free kicks')}
                {setPiece('cornerTakerId', 'Corners')}
              </div>
            </>
          )}
        </section>
      </div>

      <h2>
        Squad <span className="muted small">· {tactics.bench.length}/{MAX_BENCH} substitutes</span>
      </h2>
      <SortableTable
        rows={squad}
        columns={columns}
        rowKey={(p) => p.id}
        rowClassName={(p) => {
          const sel = selectionOf(p.id);
          return `${sel.kind === 'slot' ? 'is-picked' : sel.kind === 'bench' ? 'is-sub' : ''} ${p.id === selectedPlayerId ? 'is-mine' : ''}`;
        }}
        initialSort={{ id: 'sel', desc: false }}
      />
    </div>
  );
}
