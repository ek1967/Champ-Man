import { ageOn, developmentTrend, type GameState, knowledgeOf, type Player } from '@moc/engine';
import { AbilityEstimate, PotentialEstimate } from './Scouting.tsx';

/** Trend over the last six months as an arrow, a number and a word, so it never relies on colour. */
export function Trend({ player, months = 6 }: { player: Player; months?: number }) {
  const change = developmentTrend(player, months);
  if (player.abilityHistory.length < 2 || change === 0) return <span className="trend flat" title="No change">–</span>;
  return (
    <span className={`trend ${change > 0 ? 'up' : 'down'}`} title={`${change > 0 ? '+' : ''}${change} ability in ${months} months`}>
      {change > 0 ? '▲' : '▼'} {Math.abs(change)}
    </span>
  );
}

/** What the coaches say about a player's progress, in words. */
export function DevelopmentSummary({ game, player }: { game: GameState; player: Player }) {
  const age = ageOn(player.dateOfBirth, game.date);
  const change = developmentTrend(player, 6);
  const room = player.pa - player.ca;
  const outlook =
    age >= 30
      ? change < -3 ? 'Past their peak and declining.' : 'Experienced; holding their level for now.'
      : room <= 3
        ? 'At or near their ceiling.'
        : change >= 6
          ? 'Improving quickly.'
          : change > 0
            ? 'Developing steadily.'
            : age <= 21
              ? 'Needs games to develop.'
              : 'Not progressing at the moment.';
  const own = player.clubId === game.manager.clubId;
  const known = own || knowledgeOf(game, player) >= 60;
  return (
    <dl className="dev-facts">
      <div><dt>Last 6 months</dt><dd><Trend player={player} /></dd></div>
      <div><dt>Now</dt><dd><AbilityEstimate game={game} player={player} /></dd></div>
      <div><dt>Potential</dt><dd><PotentialEstimate game={game} player={player} /></dd></div>
      <div>
        <dt>{own ? "Coaches' view" : "Scouts' view"}</dt>
        <dd>{known ? outlook : <span className="muted">Scout the player to find out.</span>}</dd>
      </div>
    </dl>
  );
}
