import type { Club } from '@moc/engine';
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
