import type { EntityType } from '@moc/engine';
import type { ReactNode } from 'react';
import { navigate, type Route } from '../state/nav.ts';

function routeFor(type: EntityType, id: string): Route {
  switch (type) {
    case 'club': return { screen: 'club', id };
    case 'player': return { screen: 'player', id };
    case 'competition': return { screen: 'competition', id };
    case 'nation': return { screen: 'nation', id };
  }
}

/** Every name in the game is a link (PLAN §2, pillar 2). */
export function EntityLink(props: { type: EntityType; id: string; children: ReactNode; className?: string }) {
  return (
    <a
      href="#"
      className={`entity ${props.className ?? ''}`}
      onClick={(e) => {
        e.preventDefault();
        navigate(routeFor(props.type, props.id));
      }}
    >
      {props.children}
    </a>
  );
}

export function RouteLink(props: { to: Route; children: ReactNode; className?: string }) {
  return (
    <a
      href="#"
      className={props.className}
      onClick={(e) => {
        e.preventDefault();
        navigate(props.to);
      }}
    >
      {props.children}
    </a>
  );
}
