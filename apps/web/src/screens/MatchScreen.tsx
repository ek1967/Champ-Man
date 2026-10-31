import {
  displayMinute, FORMATIONS, type GameState, humanFixtureOn, type LiveMatch, livePossession, matchTactics,
  MAX_SUBSTITUTIONS, readyTactics, shortName, type Side, squadOf, type TeamMatchStats,
} from '@moc/engine';
import { useEffect, useRef, useState } from 'react';
import { ClubName } from '../components/ClubName.tsx';
import { Tabs } from '../components/Tabs.tsx';
import { RouteLink } from '../components/EntityLink.tsx';
import { navigate } from '../state/nav.ts';
import {
  ensureTactics, finishLive, getLiveMatch, instructLive, kickOffLive, playLiveToEnd, stepLive, substituteLive,
} from '../state/store.ts';
import { Condition, InstructionsForm, PitchBoard } from './TacticsScreen.tsx';

type Speed = 'normal' | 'fast' | 'veryFast' | 'keyEvents';
const SPEEDS: Array<{ id: Speed; label: string; ms: number }> = [
  { id: 'normal', label: 'Normal', ms: 900 },
  { id: 'fast', label: 'Fast', ms: 350 },
  { id: 'veryFast', label: 'Very fast', ms: 90 },
  { id: 'keyEvents', label: 'Key events only', ms: 120 },
];

function readSpeed(): Speed {
  try {
    const saved = localStorage.getItem('moc-match-speed');
    if (saved && SPEEDS.some((s) => s.id === saved)) return saved as Speed;
  } catch {
    // Storage unavailable: use the default.
  }
  return 'fast';
}

export function MatchScreen({ game }: { game: GameState }) {
  const live = getLiveMatch();
  const fixture = humanFixtureOn(game, game.date);
  if (live) return <LiveView game={game} live={live} />;
  if (!fixture) {
    return (
      <div className="screen">
        <h1>No match today</h1>
        <p className="muted">Your next match will open here on match day.</p>
        <RouteLink to={{ screen: 'inbox' }}>Back to inbox</RouteLink>
      </div>
    );
  }
  return <PreMatch game={game} />;
}

function PreMatch({ game }: { game: GameState }) {
  const fixture = humanFixtureOn(game, game.date);
  const tactics = ensureTactics();
  if (!fixture || !tactics || !game.manager.clubId) return null;
  const home = game.world.clubs[fixture.homeId];
  const away = game.world.clubs[fixture.awayId];
  const competition = game.world.competitions[fixture.competitionId];
  const mine = readyTactics(tactics, squadOf(game, game.manager.clubId), game.date);
  const opponentId = fixture.homeId === game.manager.clubId ? fixture.awayId : fixture.homeId;
  const theirs = matchTactics(game, opponentId, game.manager.clubId, fixture.homeId === opponentId);
  const opponent = game.world.clubs[opponentId];

  return (
    <div className="screen">
      <header className="screen-head">
        <p className="muted small">
          {competition?.name}, round {fixture.round} · {home?.stadium}
        </p>
        <h1 className="fixture-title">
          {home && <ClubName club={home} />} <span className="muted">v</span> {away && <ClubName club={away} />}
        </h1>
      </header>
      <div className="prematch">
        <section>
          <h2>Your team ({mine.formation})</h2>
          <PitchBoard formation={mine.formation} lineup={mine.lineup} players={game.world.players} date={game.date} />
          <p>
            <RouteLink to={{ screen: 'tactics' }}>Change team or tactics →</RouteLink>
          </p>
        </section>
        <section>
          <h2>
            {opponent?.shortName} expected line-up ({theirs.formation})
          </h2>
          <PitchBoard formation={theirs.formation} lineup={theirs.lineup} players={game.world.players} date={game.date} />
          <p className="muted small">Expected approach: {theirs.instructions.mentality}.</p>
        </section>
      </div>
      <div className="kickoff-bar">
        <button
          className="btn primary big"
          onClick={() => {
            kickOffLive();
          }}
        >
          Kick off
        </button>
      </div>
    </div>
  );
}

function StatsTable({ home, away, possession }: { home: TeamMatchStats; away: TeamMatchStats; possession: [number, number] }) {
  const rows: Array<[string, number, number]> = [
    ['Possession %', possession[0], possession[1]],
    ['Shots', home.shots, away.shots],
    ['On target', home.onTarget, away.onTarget],
    ['Corners', home.corners, away.corners],
    ['Fouls', home.fouls, away.fouls],
    ['Yellow cards', home.yellow, away.yellow],
    ['Red cards', home.red, away.red],
  ];
  return (
    <table className="data match-stats">
      <tbody>
        {rows.map(([label, h, a]) => (
          <tr key={label}>
            <td className="right strong">{h}</td>
            <td className="center">
              <div className="stat-label">{label}</div>
              <div className="stat-bar" aria-hidden="true">
                <span style={{ width: `${h + a === 0 ? 50 : (h / (h + a)) * 100}%` }} />
              </div>
            </td>
            <td className="strong">{a}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LiveView({ game, live }: { game: GameState; live: LiveMatch }) {
  const [speed, setSpeed] = useState<Speed>(readSpeed);
  const [paused, setPaused] = useState(false);
  const [tab, setTab] = useState<'commentary' | 'stats' | 'teams' | 'scores'>('commentary');
  const [subOut, setSubOut] = useState<string>('');
  const [subIn, setSubIn] = useState<string>('');
  const mySide: Side = live.home.human ? 'home' : 'away';
  const theirSide: Side = mySide === 'home' ? 'away' : 'home';
  const me = live[mySide];
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Run the clock. Half-time and serious incidents for your team pause it so you can react.
  useEffect(() => {
    if (paused || live.period === 'full') return;
    const ms = SPEEDS.find((s) => s.id === speed)?.ms ?? 350;
    timer.current = setInterval(() => {
      const events = stepLive();
      const current = getLiveMatch();
      if (!current || current.period === 'full' || current.period === 'half') setPaused(true);
      if (events.some((e) => (e.kind === 'injury' || e.kind === 'red') && e.side === mySide)) setPaused(true);
    }, ms);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, speed, live.period, mySide]);

  const finishedNow = live.period === 'full';
  // One central button that always does the obvious next thing.
  const mainLabel = finishedNow
    ? 'Continue'
    : !paused
      ? 'Pause'
      : live.period === 'half'
        ? 'Start second half'
        : live.period === 'pre'
          ? 'Kick off'
          : 'Resume';
  const mainAction = () => {
    if (live.period === 'full') {
      const newsId = finishLive();
      navigate(newsId ? { screen: 'inbox', newsId } : { screen: 'inbox' });
      return;
    }
    setPaused((p) => !p);
  };
  const mainActionRef = useRef(mainAction);
  mainActionRef.current = mainAction;

  // Space presses the main button while watching a match.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        mainActionRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const changeSpeed = (next: Speed) => {
    setSpeed(next);
    try {
      localStorage.setItem('moc-match-speed', next);
    } catch {
      // Not remembered; fine.
    }
  };

  const home = game.world.clubs[live.home.clubId];
  const away = game.world.clubs[live.away.clubId];
  const keyOnly = speed === 'keyEvents';
  const feed = [...live.events].reverse().filter((e) => !keyOnly || e.key);
  // Outcomes ("…saved!") read best with the build-up line they follow.
  const last = live.events[live.events.length - 1];
  const before = live.events[live.events.length - 2];
  const latest = last && before && last.text.startsWith('…') ? { ...last, text: `${before.text} ${last.text}` } : last;
  const possession = livePossession(live);
  const finished = live.period === 'full';

  // Other matches today, revealed as the clock reaches their goals.
  const minuteNow = live.period === 'pre' ? 0 : live.period === 'half' ? 45 : live.period === 'full' ? 200 : live.minute;
  const others = (game.fixturesByDate[game.date] ?? [])
    .map((id) => game.fixtures[id])
    .filter((f) => f && f.id !== live.fixtureId && f.result && game.world.competitions[f.competitionId]?.mode === 'playable');

  const benchPlayers = me.bench.map((id) => game.world.players[id]).filter((p) => p !== undefined);
  const subsLeft = MAX_SUBSTITUTIONS - me.subsMade;

  return (
    <div className="screen match">
      <div className="scoreboard" aria-live="polite">
        <div className="sb-team">{home && <ClubName club={home} short />}</div>
        <div className="sb-score">
          {live.score[0]} – {live.score[1]}
        </div>
        <div className="sb-team away">{away && <ClubName club={away} short />}</div>
        <div className="sb-clock">{finished ? 'FT' : displayMinute(live)}</div>
      </div>
      <p className={`latest ${latest?.key ? 'is-key' : ''}`}>{latest?.text ?? 'The teams are out.'}</p>

      <div className="match-controls" role="group" aria-label="Match controls">
        <label className="field inline control-side">
          <span>Speed</span>
          <select id="match-speed" value={speed} onChange={(e) => changeSpeed(e.target.value as Speed)}>
            {SPEEDS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button className={`btn primary main-action ${!paused && !finished ? 'is-running' : ''}`} onClick={mainAction} title="Space">
          {mainLabel}
        </button>
        <div className="control-side right">
          {!finished && (
            <button
              className="btn"
              onClick={() => {
                playLiveToEnd();
                setPaused(true);
              }}
            >
              Instant result
            </button>
          )}
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'commentary', label: 'Commentary' },
          { id: 'stats', label: 'Stats' },
          { id: 'teams', label: `Your team (${subsLeft} subs left)` },
          { id: 'scores', label: 'Other scores' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'commentary' && (
        <ol className="feed">
          {feed.map((e, i) => (
            <li key={feed.length - i} className={`feed-item ${e.key ? 'is-key' : ''} kind-${e.kind} ${e.side === mySide ? 'is-ours' : ''}`}>
              <span className="feed-minute">{e.minute}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      )}

      {tab === 'stats' && <StatsTable home={live.home.stats} away={live.away.stats} possession={possession} />}

      {tab === 'teams' && (
        <div className="teams-tab">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Player</th>
                  <th className="right">Energy</th>
                  <th className="right">Rating</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {me.onPitch.map(({ id, position }) => {
                  const p = game.world.players[id];
                  const lp = live.players[id];
                  if (!p || !lp) return null;
                  return (
                    <tr key={id} className={subOut === id ? 'is-mine' : ''}>
                      <td className="strong">{position}</td>
                      <td>
                        {shortName(p)}
                        {lp.yellow > 0 && <span className="card yellow" title="Booked" />}
                        {lp.injured && <span className="tag danger">Injured</span>}
                        {lp.goals > 0 && <span className="muted"> ⚽×{lp.goals}</span>}
                      </td>
                      <td className="right">
                        <Condition value={Math.round(lp.energy * 100)} />
                      </td>
                      <td className="right">{lp.rating.toFixed(1)}</td>
                      <td className="right">
                        {!finished && subsLeft > 0 && (
                          <button className="btn small" onClick={() => setSubOut(id)}>
                            Take off
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!finished && subsLeft > 0 && (
            <div className="sub-panel">
              <label className="field inline">
                <span>Off</span>
                <select id="sub-out" value={subOut} onChange={(e) => setSubOut(e.target.value)}>
                  <option value="">Choose a player</option>
                  {me.onPitch.map(({ id, position }) => (
                    <option key={id} value={id}>
                      {position} {shortName(game.world.players[id]!)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field inline">
                <span>On</span>
                <select id="sub-in" value={subIn} onChange={(e) => setSubIn(e.target.value)}>
                  <option value="">Choose a substitute</option>
                  {benchPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {shortName(p)} ({Object.entries(p.positions).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0]})
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn primary"
                disabled={!subOut || !subIn}
                onClick={() => {
                  if (substituteLive(subOut, subIn)) {
                    setSubOut('');
                    setSubIn('');
                  }
                }}
              >
                Make substitution
              </button>
            </div>
          )}
          {!finished && (
            <>
              <h3>Team instructions</h3>
              <InstructionsForm value={me.tactics.instructions} onChange={(ins) => instructLive(ins)} idPrefix="live" />
            </>
          )}
          <h3>{game.world.clubs[live[theirSide].clubId]?.shortName} ({live[theirSide].tactics.formation})</h3>
          <PitchBoard
            formation={live[theirSide].tactics.formation}
            lineup={FORMATIONS[live[theirSide].tactics.formation].map((slot, i) => {
              const original = live[theirSide].tactics.lineup[i] ?? null;
              const still = live[theirSide].onPitch.find((x) => x.id === original);
              if (still) return still.id;
              return live[theirSide].onPitch.find((x) => x.position === slot.position && !live[theirSide].tactics.lineup.includes(x.id))?.id ?? null;
            })}
            players={game.world.players}
            date={game.date}
          />
        </div>
      )}

      {tab === 'scores' && (
        <div className="table-wrap">
          <table className="data fixtures">
            <tbody>
              {others.map((f) => {
                if (!f?.result) return null;
                const h = f.result.goals.filter((g) => g.clubId === f.homeId && g.minute <= minuteNow).length;
                const a = f.result.goals.filter((g) => g.clubId === f.awayId && g.minute <= minuteNow).length;
                const hc = game.world.clubs[f.homeId];
                const ac = game.world.clubs[f.awayId];
                return (
                  <tr key={f.id}>
                    <td className="right">{hc && <ClubName club={hc} short />}</td>
                    <td className="center score">
                      {h} - {a}
                    </td>
                    <td>{ac && <ClubName club={ac} short />}</td>
                  </tr>
                );
              })}
              {others.length === 0 && (
                <tr>
                  <td className="muted">No other matches today.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
