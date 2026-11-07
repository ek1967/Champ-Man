import {
  abilityStars, attributeView, type Player, ageOn, ATTRIBUTE_LABELS, type AttributeKey, attributeBand, formatLong, type GameState, GOALKEEPING,
  knowledgeOf, mainPosition, MENTAL, PHYSICAL, TECHNICAL,
} from '@moc/engine';
import { ConditionBar, FormChips, Stars } from '../components/Ratings.tsx';
import { statusOf } from './TacticsScreen.tsx';
import { TransferPanel } from '../components/TransferPanel.tsx';
import { AbilityEstimate, PotentialEstimate, ScoutPanel } from '../components/Scouting.tsx';
import { AbilityChart } from '../components/AbilityChart.tsx';
import { DevelopmentSummary } from '../components/Development.tsx';
import { ClubName, PlayerClub } from '../components/ClubName.tsx';
import { EntityLink } from '../components/EntityLink.tsx';
import { money, wage } from '../components/format.ts';
import { PositionPitch, PositionTags } from '../components/Positions.tsx';

/** Attributes as the manager knows them: exact for scouted players, a range otherwise. */
function AttributeBlock({ title, keys, game, player }: { title: string; keys: readonly AttributeKey[]; game: GameState; player: Player }) {
  return (
    <section className="attr-block">
      <h3>{title}</h3>
      <dl>
        {keys.map((key) => {
          const { low, high } = attributeView(game, player, key);
          return (
            <div key={key} className="attr-row">
              <dt>{ATTRIBUTE_LABELS[key]}</dt>
              <dd className={`attr ${attributeBand(Math.round((low + high) / 2))} ${low === high ? '' : 'is-range'}`}>
                {low === high ? low : `${low}–${high}`}
              </dd>
            </div>
          );
        })}
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
            <PositionTags player={player} /> · <PlayerClub game={game} player={player} /> ·{' '}
            {nation && (
              <EntityLink type="nation" id={nation.id}>
                {nation.name}
              </EntityLink>
            )}
          </p>
        </div>
        <PositionPitch player={player} />
      </header>

      <div className="facts">
        <div><span>Ability</span><AbilityEstimate game={game} player={player} /></div>
        <div><span>Potential</span><PotentialEstimate game={game} player={player} /></div>
        <div><span>Fitness</span><ConditionBar value={player.condition} /></div>
        <div><span>Form (last 5)</span><FormChips form={player.form} /></div>
        <div><span>Status</span>{statusOf(player, game.date) ?? 'Available'}</div>
      </div>

      <div className="facts">
        <div><span>Age</span>{ageOn(player.dateOfBirth, game.date)} ({formatLong(player.dateOfBirth).slice(4)})</div>
        <div><span>Preferred foot</span>{FOOT_LABEL[player.foot]}</div>
        <div><span>Value</span>{money(player.value)}</div>
        <div><span>Wage</span>{player.contract ? wage(player.contract.wage) : '—'}</div>
        <div><span>Contract ends</span>{player.contract ? formatLong(player.contract.expires).slice(4) : '—'}</div>
      </div>

      {player.retired ? <p className="warning">Retired.</p> : <TransferPanel game={game} player={player} />}

      <ScoutPanel game={game} player={player} />

      <section className="development">
        <h2>Development</h2>
        <div className="development-grid">
          {(player.clubId === game.manager.clubId || knowledgeOf(game, player) >= 60) && <AbilityChart player={player} />}
          <DevelopmentSummary game={game} player={player} />
        </div>
      </section>

      <div className="attributes">
        {isKeeper ? (
          <AttributeBlock title="Goalkeeping" keys={GOALKEEPING} game={game} player={player} />
        ) : (
          <AttributeBlock title="Technical" keys={TECHNICAL} game={game} player={player} />
        )}
        <AttributeBlock title="Mental" keys={MENTAL} game={game} player={player} />
        <AttributeBlock title="Physical" keys={PHYSICAL} game={game} player={player} />
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
