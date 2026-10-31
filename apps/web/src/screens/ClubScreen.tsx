import { academyRating, clubFixtures, currentSeasonOf, financesOf, type GameState, leaguePosition, squadOf, wageBill } from '@moc/engine';
import { ClubFinancesPanel } from '../components/Finances.tsx';
import { ClubSwatch } from '../components/ClubName.tsx';
import { EntityLink, RouteLink } from '../components/EntityLink.tsx';
import { money, ordinal, reputationLabel } from '../components/format.ts';
import { ClubFixtureList } from './FixtureList.tsx';
import { ScoutClubButton } from '../components/Scouting.tsx';

export function ClubScreen({ game, id }: { game: GameState; id: string }) {
  const club = game.world.clubs[id];
  if (!club) return <p>Unknown club.</p>;
  const competition = game.world.competitions[club.leagueId];
  // No position before a ball has been kicked.
  const started = game.world.clubs[id] ? currentSeasonOf(game, game.world.clubs[id]!.leagueId)?.status !== 'scheduled' : false;
  const position = started ? leaguePosition(game, id) : null;
  const squad = squadOf(game, id);
  const squadValue = squad.reduce((sum, p) => sum + p.value, 0);
  const fixtures = clubFixtures(game, id);
  const recent = fixtures.filter((f) => f.result).slice(-5);
  const upcoming = fixtures.filter((f) => !f.result).slice(0, 5);

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>
          <ClubSwatch club={club} /> {club.name}
          {club.id === game.manager.clubId && <span className="tag">Your club</span>}
        </h1>
        <ScoutClubButton game={game} clubId={club.id} />
        <p className="muted">
          {competition && (
            <EntityLink type="competition" id={competition.id}>
              {competition.name}
            </EntityLink>
          )}
          {position !== null && ` · ${ordinal(position)}`}
        </p>
      </header>

      <div className="facts">
        <div><span>Size</span>{reputationLabel(club.reputation)}</div>
        <div><span>Stadium</span>{club.stadium}</div>
        <div><span>Founded</span>{club.founded}</div>
        <div><span>Youth academy</span>{academyRating(club, game)}/20</div>
        <div><span>Squad</span><RouteLink to={{ screen: 'squad', clubId: club.id }}>{squad.length} players</RouteLink></div>
        <div><span>Squad value</span>{money(squadValue)}</div>
        <div><span>Transfer budget</span>{money(financesOf(game, club.id).transferBudget)}</div>
        <div><span>Wages</span>{money(wageBill(game, club.id))} of {money(financesOf(game, club.id).wageBudget)} a week</div>
      </div>
      <ClubFinancesPanel game={game} clubId={club.id} />

      <div className="two-col">
        <section>
          <h2>Recent results</h2>
          {recent.length > 0 ? <ClubFixtureList game={game} clubId={id} fixtures={recent} /> : <p className="muted">None yet.</p>}
        </section>
        <section>
          <h2>Next matches</h2>
          {upcoming.length > 0 ? (
            <ClubFixtureList game={game} clubId={id} fixtures={upcoming} />
          ) : (
            <p className="muted">No fixtures scheduled.</p>
          )}
          <p>
            <RouteLink to={{ screen: 'fixtures', clubId: id }}>All fixtures →</RouteLink>
          </p>
        </section>
      </div>
    </div>
  );
}

export function FixturesScreen({ game, clubId }: { game: GameState; clubId: string }) {
  const club = game.world.clubs[clubId];
  if (!club) return <p>Unknown club.</p>;
  const competition = game.world.competitions[club.leagueId];
  const seasonId = game.currentSeason[club.leagueId];
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>
          <ClubSwatch club={club} /> {club.shortName} fixtures
        </h1>
        <p className="muted">
          {competition?.name} {seasonId ? game.seasons[seasonId]?.label : ''}
        </p>
      </header>
      <ClubFixtureList game={game} clubId={clubId} fixtures={clubFixtures(game, clubId)} />
    </div>
  );
}

export function NationScreen({ game, id }: { game: GameState; id: string }) {
  const nation = game.world.nations[id];
  if (!nation) return <p>Unknown nation.</p>;
  const players = Object.values(game.world.players)
    .filter((p) => p.nationId === id)
    .sort((a, b) => b.value - a.value)
    .slice(0, 30);
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>{nation.name}</h1>
        <p className="muted">Most valuable players from {nation.name} in this world</p>
      </header>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Player</th>
              <th>Club</th>
              <th className="right">Value</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const club = p.clubId ? game.world.clubs[p.clubId] : undefined;
              return (
                <tr key={p.id}>
                  <td>
                    <EntityLink type="player" id={p.id}>
                      {p.knownAs ?? `${p.firstName} ${p.lastName}`}
                    </EntityLink>
                  </td>
                  <td>
                    {club && (
                      <EntityLink type="club" id={club.id}>
                        {club.name}
                      </EntityLink>
                    )}
                  </td>
                  <td className="right">{money(p.value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
