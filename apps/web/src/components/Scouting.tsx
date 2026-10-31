import {
  activeAssignments, ageOn, askingPrice, cancelAssignment, estimatedAbility, estimatedPotential, formatMoney, formatShort, type GameState,
  knowledgeOf, mainPosition, type Player, playersAbroad, scoutClub, scoutCountry, scoutingCountries, scoutingStaff, scoutPlayer, shortName,
  toggleShortlist,
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
                : a.kind === 'country'
                  ? `Looking for players in ${game.world.nations[a.targetId]?.name ?? '?'}`
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
      <ScoutAbroad game={game} />
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

/** Send a scout to another country, and the players found there. */
function ScoutAbroad({ game }: { game: GameState }) {
  const countries = scoutingCountries(game);
  const [nationId, setNationId] = useState(countries[0]?.id ?? '');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const found = playersAbroad(game);
  if (countries.length === 0) return null;
  return (
    <>
      <h2>Scout abroad</h2>
      <p className="small">
        Leagues outside the game can't be searched, but a scout can spend two weeks in a country and come back with four or five players who
        would suit you. You can bid for them for about four months.
      </p>
      <form
        className="money-form"
        onSubmit={(e) => {
          e.preventDefault();
          setFeedback(act((g) => scoutCountry(g, nationId)));
        }}
      >
        <label className="money-field" htmlFor="scout-country">
          <span>Country</span>
          <select id="scout-country" value={nationId} onChange={(e) => setNationId(e.target.value)}>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">Send a scout</button>
      </form>
      {feedback && <p className={`feedback ${feedback.ok ? 'ok' : 'bad'}`}>{feedback.message}</p>}
      {found.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Player</th><th>Country</th><th>Pos</th><th className="right">Age</th><th>Ability</th><th>Potential</th><th className="right">Price</th><th>Until</th></tr>
            </thead>
            <tbody>
              {found.map((p) => (
                <tr key={p.id}>
                  <td><EntityLink type="player" id={p.id}>{shortName(p)}</EntityLink></td>
                  <td>{game.world.nations[p.abroad!.nationId]?.name}</td>
                  <td>{mainPosition(p)}</td>
                  <td className="right">{ageOn(p.dateOfBirth, game.date)}</td>
                  <td><AbilityEstimate game={game} player={p} /></td>
                  <td><PotentialEstimate game={game} player={p} /></td>
                  <td className="right">{formatMoney(askingPrice(game, p))}</td>
                  <td>{formatShort(p.abroad!.until)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
