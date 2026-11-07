import {
  displayMinute, FORMATION_IDS, type FormationId, type GameState, humanFixtureOn, type LiveMatch, liveLineup, livePossession,
  matchTactics, MAX_SUBSTITUTIONS, readyTactics, shortName, type Side, squadOf, type TeamMatchStats,
} from '@moc/engine';
import { useEffect, useRef, useState } from 'react';
import { ClubName } from '../components/ClubName.tsx';
import { FitChip, PositionTags } from '../components/Positions.tsx';
import { Tabs } from '../components/Tabs.tsx';
import { RouteLink } from '../components/EntityLink.tsx';
import { navigate } from '../state/nav.ts';
import {
  ensureTactics, finishLive, formationLive, getLiveMatch, instructLive, kickOffLive, playLiveToEnd, stepLive, substituteLive, swapLive,
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
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
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
  const myLineup = liveLineup(live, mySide);
  const onPitch = (id: string) => me.onPitch.some((x) => x.id === id);
  const energy = Object.fromEntries(Object.values(live.players).map((lp) => [lp.id, Math.round(lp.energy * 100)]));
  const nameOf = (id: string) => {
    const p = game.world.players[id];
    return p ? shortName(p) : '';
  };

  // Tap one player, then another: two on the pitch swap positions; a player and a substitute is a change.
  const pick = (id: string | null) => {
    if (!id || finished) return;
    setNote(null);
    if (!picked || picked === id) {
      setPicked(picked === id ? null : id);
      // The clock stops while you make changes.
      if (!picked) setPaused(true);
      return;
    }
    const first = picked;
    if (onPitch(first) && onPitch(id)) {
      swapLive(first, id);
      setNote(`${nameOf(first)} and ${nameOf(id)} have swapped positions.`);
    } else if (onPitch(first) !== onPitch(id)) {
      const [out, sub] = onPitch(first) ? [first, id] : [id, first];
      if (subsLeft <= 0) setNote('You have used all your substitutions.');
      else if (substituteLive(out, sub)) setNote(`${nameOf(sub)} comes on for ${nameOf(out)}.`);
    } else {
      setPicked(id);
      return;
    }
    setPicked(null);
  };

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
                setPaused(true);
                setTab('teams');
              }}
            >
              Make changes
            </button>
          )}
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
          <div className="live-team">
            <section className="live-team-pitch">
              <label className="field inline">
                <span>Formation</span>
                <select
                  id="live-formation"
                  value={me.tactics.formation}
                  disabled={finished}
                  onChange={(e) => {
                    setPaused(true);
                    formationLive(e.target.value as FormationId);
                    setNote(`Switched to ${e.target.value}: players moved to the positions they know best.`);
                  }}
                >
                  {FORMATION_IDS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <PitchBoard
                formation={me.tactics.formation}
                lineup={myLineup}
                players={game.world.players}
                date={game.date}
                energy={energy}
                selected={picked ? myLineup.indexOf(picked) : null}
                onSelect={(i) => pick(myLineup[i] ?? null)}
                emptyLabel="Nobody here (sent off)"
              />
            </section>
            <section className="live-team-lists">
              {!finished && (
                <p className="change-hint" aria-live="polite">
                  {picked
                    ? `${nameOf(picked)} selected: tap ${onPitch(picked) ? `a team-mate to swap positions${subsLeft > 0 ? ' or a substitute to bring on' : ''}` : 'the player to take off'}.`
                    : note ?? 'Tap a player, then a team-mate to swap positions, or a substitute to bring on.'}
                  {picked && (
                    <button className="btn small" onClick={() => setPicked(null)}>
                      Cancel
                    </button>
                  )}
                </p>
              )}
              <div className="table-wrap">
                <table className="data live-players">
                  <thead>
                    <tr>
                      <th>Pos</th>
                      <th>Player</th>
                      <th className="right">Energy</th>
                      <th className="right">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {me.onPitch.map(({ id, position }) => {
                      const p = game.world.players[id];
                      const lp = live.players[id];
                      if (!p || !lp) return null;
                      return (
                        <tr key={id} className={`pickable ${picked === id ? 'is-picked' : ''}`} onClick={() => pick(id)}>
                          <td><FitChip player={p} position={position} /></td>
                          <td>
                            <button type="button" className="link-button" onClick={(e) => { e.stopPropagation(); pick(id); }}>
                              {shortName(p)}
                            </button>
                            {lp.yellow > 0 && <span className="card yellow" title="Booked" />}
                            {lp.injured && <span className="tag danger">Injured</span>}
                            {lp.goals > 0 && <span className="muted"> ⚽×{lp.goals}</span>}
                          </td>
                          <td className="right">
                            <Condition value={Math.round(lp.energy * 100)} />
                          </td>
                          <td className="right">{lp.rating.toFixed(1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <h3>
                Substitutes <span className="muted small">({subsLeft} of {MAX_SUBSTITUTIONS} changes left)</span>
              </h3>
              {benchPlayers.length === 0 ? (
                <p className="muted small">Nobody left on the bench.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data live-players">
                    <tbody>
                      {benchPlayers.map((p) => (
                        <tr key={p.id} className={`pickable ${picked === p.id ? 'is-picked' : ''}`} onClick={() => pick(p.id)}>
                          <td><PositionTags player={p} limit={2} /></td>
                          <td>
                            <button type="button" className="link-button" onClick={(e) => { e.stopPropagation(); pick(p.id); }}>
                              {shortName(p)}
                            </button>
                          </td>
                          <td className="right">
                            <Condition value={p.condition} />
                          </td>
                          <td className="right">
                            {picked && onPitch(picked) && (
                              <FitChip player={p} position={me.onPitch.find((x) => x.id === picked)!.position} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
          {!finished && (
            <>
              <h3>Team instructions</h3>
              <InstructionsForm value={me.tactics.instructions} onChange={(ins) => instructLive(ins)} idPrefix="live" />
            </>
          )}
          <h3>{game.world.clubs[live[theirSide].clubId]?.shortName} ({live[theirSide].tactics.formation})</h3>
          <PitchBoard
            formation={live[theirSide].tactics.formation}
            lineup={liveLineup(live, theirSide)}
            energy={energy}
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
