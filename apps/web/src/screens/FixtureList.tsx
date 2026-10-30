import { type Fixture, formatShort, type GameState } from '@moc/engine';
import { ClubName } from '../components/ClubName.tsx';

/** A club's fixtures and results, from its point of view. */
export function ClubFixtureList({ game, clubId, fixtures }: { game: GameState; clubId: string; fixtures: readonly Fixture[] }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Date</th>
            <th>Opponent</th>
            <th className="center">Venue</th>
            <th className="center">Result</th>
          </tr>
        </thead>
        <tbody>
          {fixtures.map((f) => {
            const home = f.homeId === clubId;
            const opponent = game.world.clubs[home ? f.awayId : f.homeId];
            const r = f.result;
            const ours = r ? (home ? r.homeGoals : r.awayGoals) : 0;
            const theirs = r ? (home ? r.awayGoals : r.homeGoals) : 0;
            const outcome = !r ? '' : ours > theirs ? 'W' : ours === theirs ? 'D' : 'L';
            return (
              <tr key={f.id} className={f.date === game.date && !r ? 'is-today' : ''}>
                <td>{formatShort(f.date)}</td>
                <td>{opponent && <ClubName club={opponent} />}</td>
                <td className="center">{home ? 'H' : 'A'}</td>
                <td className="center">
                  {r ? (
                    <span className={`result ${outcome}`}>
                      {outcome} {ours}-{theirs}
                    </span>
                  ) : (
                    <span className="muted">–</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
