import {
  ageOn, ATTRIBUTE_LABELS, type AttributeKey, attributeBand, formatLong, type GameState, GOALKEEPING,
  mainPosition, MENTAL, PHYSICAL, TECHNICAL,
} from '@moc/engine';
import { ClubName } from '../components/ClubName.tsx';
import { EntityLink } from '../components/EntityLink.tsx';
import { money, wage } from '../components/format.ts';
import { positionsLabel } from './SquadScreen.tsx';

function AttributeBlock({ title, keys, values }: { title: string; keys: readonly AttributeKey[]; values: Record<AttributeKey, number> }) {
  return (
    <section className="attr-block">
      <h3>{title}</h3>
      <dl>
        {keys.map((key) => (
          <div key={key} className="attr-row">
            <dt>{ATTRIBUTE_LABELS[key]}</dt>
            <dd className={`attr ${attributeBand(values[key])}`}>{values[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const FOOT_LABEL = { L: 'Left', R: 'Right', B: 'Either' } as const;

export function PlayerScreen({ game, id }: { game: GameState; id: string }) {
  const player = game.world.players[id];
  if (!player) return <p>Unknown player.</p>;
  const club = player.clubId ? game.world.clubs[player.clubId] : undefined;
  const nation = game.world.nations[player.nationId];
  const isKeeper = mainPosition(player) === 'GK';
  const name = player.knownAs ?? `${player.firstName} ${player.lastName}`;

  return (
    <div className="screen">
      <header className="screen-head player-head">
        <div className="shirt" aria-hidden="true">
          {player.squadNumber ?? '–'}
        </div>
        <div>
          <h1>{name}</h1>
          {player.knownAs && <p className="muted small">{player.firstName} {player.lastName}</p>}
          <p>
            {positionsLabel(player)} · {club ? <ClubName club={club} /> : 'Free agent'} ·{' '}
            {nation && (
              <EntityLink type="nation" id={nation.id}>
                {nation.name}
              </EntityLink>
            )}
          </p>
        </div>
      </header>

      <div className="facts">
        <div><span>Age</span>{ageOn(player.dateOfBirth, game.date)} ({formatLong(player.dateOfBirth).slice(4)})</div>
        <div><span>Preferred foot</span>{FOOT_LABEL[player.foot]}</div>
        <div><span>Value</span>{money(player.value)}</div>
        <div><span>Wage</span>{player.contract ? wage(player.contract.wage) : '—'}</div>
        <div><span>Contract ends</span>{player.contract ? formatLong(player.contract.expires).slice(4) : '—'}</div>
      </div>

      <div className="attributes">
        {isKeeper ? (
          <AttributeBlock title="Goalkeeping" keys={GOALKEEPING} values={player.attributes} />
        ) : (
          <AttributeBlock title="Technical" keys={TECHNICAL} values={player.attributes} />
        )}
        <AttributeBlock title="Mental" keys={MENTAL} values={player.attributes} />
        <AttributeBlock title="Physical" keys={PHYSICAL} values={player.attributes} />
      </div>

      <section>
        <h2>Career</h2>
        {player.stats.length === 0 ? (
          <p className="muted">No competitive appearances yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Club</th>
                  <th>Competition</th>
                  <th className="right">Apps</th>
                  <th className="right">Gls</th>
                  <th className="right">Ast</th>
                </tr>
              </thead>
              <tbody>
                {[...player.stats].reverse().map((s) => {
                  const statClub = game.world.clubs[s.clubId];
                  const competition = game.world.competitions[s.competitionId];
                  return (
                    <tr key={`${s.season}-${s.competitionId}-${s.clubId}`}>
                      <td>{s.season}</td>
                      <td>{statClub && <ClubName club={statClub} />}</td>
                      <td>
                        {competition && (
                          <EntityLink type="competition" id={competition.id}>
                            {competition.shortName}
                          </EntityLink>
                        )}
                      </td>
                      <td className="right">{s.apps}</td>
                      <td className="right">{s.goals}</td>
                      <td className="right">{s.assists}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
