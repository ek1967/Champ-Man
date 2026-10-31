import type { Club, GameState, Player } from '@moc/engine';
import { EntityLink } from './EntityLink.tsx';

export function ClubSwatch({ club }: { club: Club }) {
  return (
    <span
      className="swatch"
      aria-hidden="true"
      style={{ background: `linear-gradient(135deg, ${club.colours.primary} 50%, ${club.colours.secondary} 50%)` }}
    />
  );
}

/** A player's club, or where they are if they have none in the game. */
export function PlayerClub({ game, player, short = false }: { game: GameState; player: Player; short?: boolean }) {
  const club = player.clubId ? game.world.clubs[player.clubId] : undefined;
  if (club) return <ClubName club={club} short={short} />;
  if (player.abroad) {
    const nation = game.world.nations[player.abroad.nationId];
    return <span className="tag abroad">Abroad{nation ? ` (${short ? nation.code : nation.name})` : ''}</span>;
  }
  return <span className="tag free">Free agent</span>;
}

export function ClubName({ club, short = false, highlight = false }: { club: Club; short?: boolean; highlight?: boolean }) {
  return (
    <span className={`club-name ${highlight ? 'is-mine' : ''}`}>
      <ClubSwatch club={club} />
      <EntityLink type="club" id={club.id}>
        {short ? club.shortName : club.name}
      </EntityLink>
    </span>
  );
}
