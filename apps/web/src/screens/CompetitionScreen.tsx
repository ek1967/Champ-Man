import {
  formatShort, type GameState, seasonFixtures, seasonsOf, seasonTable, shortName, topScorers, type ZoneKind,
} from '@moc/engine';
import { ClubName } from '../components/ClubName.tsx';
import { EntityLink } from '../components/EntityLink.tsx';
import { Tabs } from '../components/Tabs.tsx';
import { type CompetitionTab, replaceRoute } from '../state/nav.ts';

export function CompetitionScreen(props: { game: GameState; id: string; tab?: CompetitionTab; seasonId?: string }) {
  const { game, id } = props;
  const competition = game.world.competitions[id];
  if (!competition) return <p>Unknown competition.</p>;
  const seasons = seasonsOf(game, id);
  const season = seasons.find((s) => s.id === props.seasonId) ?? seasons[0];
  const tab = props.tab ?? 'table';
  if (!season) return <p>No seasons yet.</p>;

  const go = (next: { tab?: CompetitionTab; seasonId?: string }) =>
    replaceRoute({ screen: 'competition', id, tab: next.tab ?? tab, seasonId: next.seasonId ?? season.id });

  return (
    <div className="screen">
      <header className="screen-head with-controls">
        <div>
          <h1>{competition.name}</h1>
          <p className="muted">
            Tier {competition.tier}
            {competition.mode === 'shadow' && ' · background league (results only)'}
          </p>
        </div>
        <label className="field inline">
          <span>Season</span>
          <select value={season.id} onChange={(e) => go({ seasonId: e.target.value })}>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <Tabs
        tabs={[
          { id: 'table', label: 'Table' },
          { id: 'fixtures', label: 'Fixtures' },
          ...(competition.mode === 'playable' ? [{ id: 'scorers' as const, label: 'Top scorers' }] : []),
          { id: 'history', label: 'History' },
        ]}
        active={tab}
        onChange={(t) => go({ tab: t })}
      />
      {tab === 'table' && <LeagueTable game={game} seasonId={season.id} />}
      {tab === 'fixtures' && <RoundList game={game} seasonId={season.id} />}
      {tab === 'scorers' && <Scorers game={game} seasonId={season.id} />}
      {tab === 'history' && <History game={game} competitionId={id} />}
    </div>
  );
}

function zoneFor(position: number, zones: ReadonlyArray<{ from: number; to: number; kind: ZoneKind }>): ZoneKind | '' {
  return zones.find((z) => position >= z.from && position <= z.to)?.kind ?? '';
}

export function LeagueTable({ game, seasonId, compact = false }: { game: GameState; seasonId: string; compact?: boolean }) {
  const season = game.seasons[seasonId];
  const competition = season ? game.world.competitions[season.competitionId] : undefined;
  if (!season || !competition) return null;
  const rows = seasonTable(game, season);
  const zones = competition.rules.zones;
  return (
    <>
      <div className="table-wrap">
        <table className="data league">
          <thead>
            <tr>
              <th className="right">Pos</th>
              <th>Club</th>
              <th className="right">P</th>
              {!compact && (
                <>
                  <th className="right">W</th>
                  <th className="right">D</th>
                  <th className="right">L</th>
                  <th className="right">F</th>
                  <th className="right">A</th>
                </>
              )}
              <th className="right">GD</th>
              <th className="right">Pts</th>
              {!compact && <th>Form</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const club = game.world.clubs[row.clubId];
              const mine = row.clubId === game.manager.clubId;
              return (
                <tr key={row.clubId} className={`zone-${zoneFor(i + 1, zones)} ${mine ? 'is-mine' : ''}`}>
                  <td className="right pos">{i + 1}</td>
                  <td>{club && <ClubName club={club} short={compact} />}</td>
                  <td className="right">{row.played}</td>
                  {!compact && (
                    <>
                      <td className="right">{row.won}</td>
                      <td className="right">{row.drawn}</td>
                      <td className="right">{row.lost}</td>
                      <td className="right">{row.goalsFor}</td>
                      <td className="right">{row.goalsAgainst}</td>
                    </>
                  )}
                  <td className="right">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                  <td className="right strong">{row.points}</td>
                  {!compact && (
                    <td className="form">
                      {row.form.map((f, j) => (
                        <span key={j} className={`result ${f}`}>
                          {f}
                        </span>
                      ))}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!compact && zones.length > 0 && (
        <ul className="legend">
          {zones.map((z) => (
            <li key={z.label} className={`zone-${z.kind}`}>
              {z.label}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RoundList({ game, seasonId }: { game: GameState; seasonId: string }) {
  const season = game.seasons[seasonId];
  if (!season) return null;
  const byRound = new Map<number, ReturnType<typeof seasonFixtures>>();
  for (const f of seasonFixtures(game, season)) {
    const list = byRound.get(f.round) ?? [];
    list.push(f);
    byRound.set(f.round, list);
  }
  return (
    <div className="rounds">
      {[...byRound.entries()].map(([round, fixtures]) => (
        <section key={round} className="round">
          <h3>
            Round {round} <span className="muted">· {formatShort(fixtures[0]?.date ?? '')}</span>
          </h3>
          <table className="data fixtures">
            <tbody>
              {fixtures.map((f) => {
                const home = game.world.clubs[f.homeId];
                const away = game.world.clubs[f.awayId];
                const mine = f.homeId === game.manager.clubId || f.awayId === game.manager.clubId;
                return (
                  <tr key={f.id} className={mine ? 'is-mine' : ''}>
                    <td className="right">{home && <ClubName club={home} short />}</td>
                    <td className="center score">{f.result ? `${f.result.homeGoals} - ${f.result.awayGoals}` : 'v'}</td>
                    <td>{away && <ClubName club={away} short />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function Scorers({ game, seasonId }: { game: GameState; seasonId: string }) {
  const season = game.seasons[seasonId];
  if (!season) return null;
  const rows = topScorers(game, season, 25);
  if (rows.length === 0) return <p className="muted">No goals yet this season.</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th className="right">#</th>
            <th>Player</th>
            <th>Club</th>
            <th className="right">Gls</th>
            <th className="right">Ast</th>
            <th className="right">Apps</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const player = game.world.players[r.playerId];
            const club = game.world.clubs[r.clubId];
            return (
              <tr key={r.playerId}>
                <td className="right">{i + 1}</td>
                <td>{player && <EntityLink type="player" id={player.id}>{shortName(player)}</EntityLink>}</td>
                <td>{club && <ClubName club={club} short />}</td>
                <td className="right strong">{r.goals}</td>
                <td className="right">{r.assists}</td>
                <td className="right">{r.apps}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function History({ game, competitionId }: { game: GameState; competitionId: string }) {
  const finished = seasonsOf(game, competitionId).filter((s) => s.final);
  if (finished.length === 0) return <p className="muted">No completed seasons yet.</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Season</th>
            <th>Champions</th>
            <th>Runners-up</th>
          </tr>
        </thead>
        <tbody>
          {finished.map((s) => {
            const champion = game.world.clubs[s.final!.order[0] ?? ''];
            const second = game.world.clubs[s.final!.order[1] ?? ''];
            return (
              <tr key={s.id}>
                <td>{s.label}</td>
                <td>{champion && <ClubName club={champion} />}</td>
                <td>{second && <ClubName club={second} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
