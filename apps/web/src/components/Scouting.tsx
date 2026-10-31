import {
  activeAssignments, ageOn, askingPrice, cancelAssignment, estimatedAbility, estimatedPotential, formatMoney, formatShort, type GameState,
  describeSearch, findPlayers, knowledgeOf, mainPosition, nationsInGame, type Player, playersAbroad, scoutClub, type ScoutCriteria, scoutingCountries,
  scoutingStaff, type ScoutNeed, scoutPlayer, shortName, toggleShortlist,
} from '@moc/engine';
import { useState } from 'react';
import { act } from '../state/store.ts';
import { ClubName, PlayerClub } from './ClubName.tsx';
import { EntityLink } from './EntityLink.tsx';
import { Stars } from './Ratings.tsx';

/** Ability as the manager sees it: exact for known players, an estimate (marked ≈) otherwise. */
export function AbilityEstimate({ game, player }: { game: GameState; player: Player }) {
  const est = estimatedAbility(game, player);
  return (
    <span className="estimate" title={est.exact ? undefined : 'Estimate: scout the player to be sure'}>
      {!est.exact && <span className="approx" aria-label="about">≈</span>}
      <Stars value={est.stars} label={est.exact ? 'Ability' : 'Estimated ability'} />
    </span>
  );
}

/** Potential as one value when well known, or a range ("3–4.5★") when not. */
export function PotentialEstimate({ game, player }: { game: GameState; player: Player }) {
  const { min, max } = estimatedPotential(game, player);
  if (min === max) return <Stars value={min} label="Potential" />;
  return (
    <span className="estimate-range" title="Range: scout the player to narrow it down">
      {min}–{max}★
    </span>
  );
}

export function sortableAbility(game: GameState, player: Player): number {
  return estimatedAbility(game, player).stars;
}

export function sortablePotential(game: GameState, player: Player): number {
  const p = estimatedPotential(game, player);
  return (p.min + p.max) / 2;
}

type Feedback = { ok: boolean; message: string } | null;

/** Scout and shortlist buttons, the latest report, and how well the player is known. */
export function ScoutPanel({ game, player }: { game: GameState; player: Player }) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  if (!game.manager.clubId || player.clubId === game.manager.clubId || player.retired) return null;
  const k = knowledgeOf(game, player);
  const assignment = activeAssignments(game).find((a) => a.targetId === player.id || a.targetId === player.clubId);
  const report = game.scouting?.reports[player.id];
  const shortlisted = game.scouting?.shortlist.includes(player.id) ?? false;
  return (
    <section className="scout-panel">
      <div className="scout-head">
        <h2>Scouting</h2>
        <span className="knowledge" title="How well your staff know this player">
          <span className="knowledge-track" aria-hidden="true">
            <span style={{ width: `${k}%` }} />
          </span>
          {k >= 100 ? 'Fully scouted' : `${k}% known`}
        </span>
      </div>
      {report && (
        <p className={`report grade-${report.grade}`}>
          <strong>Grade {report.grade}</strong> · {report.verdict} <span className="muted small">(report {formatShort(report.date)})</span>
        </p>
      )}
      <div className="button-row">
        {assignment ? (
          <span className="muted">Being scouted: report due {formatShort(assignment.due)}.</span>
        ) : (
          <button className="btn" onClick={() => setFeedback(act((g) => scoutPlayer(g, player.id)))}>
            {report ? 'Scout again' : 'Scout this player'}
          </button>
        )}
        <button className="btn ghost" onClick={() => act((g) => toggleShortlist(g, player.id))}>
          {shortlisted ? '★ On your shortlist' : '☆ Add to shortlist'}
        </button>
      </div>
      {feedback && <p className={`feedback ${feedback.ok ? 'ok' : 'bad'}`}>{feedback.message}</p>}
    </section>
  );
}

export function ScoutClubButton({ game, clubId }: { game: GameState; clubId: string }) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  if (!game.manager.clubId || clubId === game.manager.clubId) return null;
  const busy = activeAssignments(game).find((a) => a.targetId === clubId);
  return (
    <span className="scout-club">
      {busy ? (
        <span className="muted small">Being scouted: report due {formatShort(busy.due)}.</span>
      ) : (
        <button className="btn small" onClick={() => setFeedback(act((g) => scoutClub(g, clubId)))}>
          Scout this squad
        </button>
      )}
      {feedback && <span className={`feedback inline ${feedback.ok ? 'ok' : 'bad'}`}>{feedback.message}</span>}
    </span>
  );
}

/** The Scouting tab: staff, current trips, shortlist and reports. */
export function ScoutingTab({ game }: { game: GameState }) {
  const staff = scoutingStaff(game);
  const assignments = activeAssignments(game);
  const shortlist = (game.scouting?.shortlist ?? []).map((id) => game.world.players[id]).filter((p): p is Player => !!p && !p.retired);
  const reports = Object.entries(game.scouting?.reports ?? {})
    .sort((a, b) => (a[1].date < b[1].date ? 1 : -1))
    .slice(0, 25);
  return (
    <>
      <p>
        You have <strong>{staff.scouts} scout{staff.scouts > 1 ? 's' : ''}</strong> (judgement {staff.judgement}/20). Players in your
        league are partly known from watching them each week; scouts give the full picture.
      </p>
      <h2>On assignment</h2>
      {assignments.length === 0 ? (
        <p className="muted">All scouts are free. Send one from a player or club page.</p>
      ) : (
        <ul className="plain-list">
          {assignments.map((a) => {
            const label =
              a.kind === 'player'
                ? (() => {
                    const p = game.world.players[a.targetId];
                    return p ? <EntityLink type="player" id={p.id}>{shortName(p)}</EntityLink> : '?';
                  })()
                : a.kind === 'country' || a.kind === 'search'
                  ? `Looking for ${a.criteria ? describeSearch(game, a.criteria) : `players in ${game.world.nations[a.targetId]?.name ?? '?'}`}`
                  : (() => {
                      const c = game.world.clubs[a.targetId];
                      return c ? <ClubName club={c} short /> : '?';
                    })();
            return (
              <li key={a.id}>
                {label} <span className="muted">· report due {formatShort(a.due)}</span>{' '}
                <button className="btn small ghost" onClick={() => act((g) => cancelAssignment(g, a.id))}>
                  Call back
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <FindPlayers game={game} />
      <h2>Shortlist</h2>
      {shortlist.length === 0 ? (
        <p className="muted">Add players from their pages to keep an eye on them.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Player</th><th>Club</th><th>Pos</th><th className="right">Age</th><th>Ability</th><th>Potential</th><th className="right">Value</th><th>Grade</th></tr>
            </thead>
            <tbody>
              {shortlist.map((p) => {
                const report = game.scouting?.reports[p.id];
                return (
                  <tr key={p.id}>
                    <td><EntityLink type="player" id={p.id}>{shortName(p)}</EntityLink></td>
                    <td><PlayerClub game={game} player={p} short /></td>
                    <td>{mainPosition(p)}</td>
                    <td className="right">{ageOn(p.dateOfBirth, game.date)}</td>
                    <td><AbilityEstimate game={game} player={p} /></td>
                    <td><PotentialEstimate game={game} player={p} /></td>
                    <td className="right">{formatMoney(p.value)}</td>
                    <td>{report ? <span className={`grade grade-${report.grade}`}>{report.grade}</span> : <span className="muted">–</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <h2>Reports</h2>
      {reports.length === 0 ? (
        <p className="muted">No reports yet.</p>
      ) : (
        <ul className="plain-list">
          {reports.map(([id, r]) => {
            const p = game.world.players[id];
            if (!p) return null;
            return (
              <li key={id}>
                <span className={`grade grade-${r.grade}`}>{r.grade}</span> <EntityLink type="player" id={p.id}>{shortName(p)}</EntityLink>{' '}
                <span className="muted small">{r.verdict} ({formatShort(r.date)})</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

const POSITION_CHOICES: Array<[ScoutCriteria['position'], string]> = [
  ['any', 'Any (your weakest positions)'], ['GK', 'Goalkeeper'], ['DC', 'Centre-back'], ['DL', 'Left-back'], ['DR', 'Right-back'],
  ['DM', 'Defensive midfielder'], ['MC', 'Central midfielder'], ['AMC', 'Attacking midfielder'], ['AML', 'Left winger'],
  ['AMR', 'Right winger'], ['ST', 'Striker'],
];

/** Brief a scout: position, kind of player and where to look; then the players they found. */
function FindPlayers({ game }: { game: GameState }) {
  const abroad = scoutingCountries(game);
  const inGame = nationsInGame(game);
  const [position, setPosition] = useState<ScoutCriteria['position']>('any');
  const [need, setNeed] = useState<ScoutNeed>('first');
  const [where, setWhere] = useState('all');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const searches = game.scouting?.searches ?? [];
  const found = playersAbroad(game);
  return (
    <>
      <h2>Find players</h2>
      <p className="small">
        Tell a scout what you need. Searching the leagues in the game takes about a week; a trip abroad takes two weeks and finds players
        at clubs outside the game, who you can bid for over the next four months.
      </p>
      <form
        className="money-form"
        onSubmit={(e) => {
          e.preventDefault();
          setFeedback(act((g) => findPlayers(g, { position, need, where })));
        }}
      >
        <label className="money-field" htmlFor="scout-position">
          <span>Position</span>
          <select id="scout-position" value={position} onChange={(e) => setPosition(e.target.value as ScoutCriteria['position'])}>
            {POSITION_CHOICES.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
        <label className="money-field" htmlFor="scout-need">
          <span>Looking for</span>
          <select id="scout-need" value={need} onChange={(e) => setNeed(e.target.value as ScoutNeed)}>
            <option value="first">First-team ready</option>
            <option value="backup">Squad backup</option>
            <option value="future">One for the future (21 or under)</option>
          </select>
        </label>
        <label className="money-field" htmlFor="scout-where">
          <span>Where</span>
          <select id="scout-where" value={where} onChange={(e) => setWhere(e.target.value)}>
            <option value="league">Your league</option>
            <option value="all">Every league in the game</option>
            {inGame.length > 1 && inGame.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            <optgroup label="Abroad (two-week trip)">
              {abroad.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <button className="btn" type="submit">Send a scout</button>
      </form>
      {feedback && <p className={`feedback ${feedback.ok ? 'ok' : 'bad'}`}>{feedback.message}</p>}
      {searches.slice(0, 3).map((search) => (
        <div key={`${search.date}-${search.label}`}>
          <h3>
            {search.label.charAt(0).toUpperCase() + search.label.slice(1)} <span className="muted small">({formatShort(search.date)})</span>
          </h3>
          {search.playerIds.length === 0 ? (
            <p className="muted">Nobody suitable found.</p>
          ) : (
            <PlayerTable game={game} players={search.playerIds.map((id) => game.world.players[id]).filter((p): p is Player => !!p && !p.retired)} />
          )}
        </div>
      ))}
      {found.length > 0 && (
        <>
          <h3>Found abroad</h3>
          <PlayerTable game={game} players={found} abroad />
        </>
      )}
    </>
  );
}

function PlayerTable({ game, players, abroad = false }: { game: GameState; players: Player[]; abroad?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Player</th><th>{abroad ? 'Country' : 'Club'}</th><th>Pos</th><th className="right">Age</th><th>Ability</th><th>Potential</th>
            <th className="right">Price</th><th>{abroad ? 'Until' : 'Grade'}</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const report = game.scouting?.reports[p.id];
            return (
              <tr key={p.id}>
                <td><EntityLink type="player" id={p.id}>{shortName(p)}</EntityLink></td>
                <td>{abroad ? game.world.nations[p.abroad!.nationId]?.name : <PlayerClub game={game} player={p} short />}</td>
                <td>{mainPosition(p)}</td>
                <td className="right">{ageOn(p.dateOfBirth, game.date)}</td>
                <td><AbilityEstimate game={game} player={p} /></td>
                <td><PotentialEstimate game={game} player={p} /></td>
                <td className="right">{formatMoney(askingPrice(game, p))}</td>
                <td>{abroad ? formatShort(p.abroad!.until) : report ? <span className={`grade grade-${report.grade}`}>{report.grade}</span> : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
