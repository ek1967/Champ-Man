import {
  currentSeasonOf, formatLong, formatShort, type GameState, humanFixtureOn, leaguePosition, nextFixture,
  unreadNewsCount,
} from '@moc/engine';
import { type ReactNode, useEffect, useState } from 'react';
import { ClubSwatch } from './components/ClubName.tsx';
import { EntityLink } from './components/EntityLink.tsx';
import { ordinal } from './components/format.ts';
import { back, forward, navigate, type Route, useRoute } from './state/nav.ts';
import { exportCareer, saveCareer } from './state/persistence.ts';
import { continueOnce, getLiveMatch, setGame, useGame } from './state/store.ts';
import { ClubScreen, FixturesScreen, NationScreen } from './screens/ClubScreen.tsx';
import { CompetitionScreen } from './screens/CompetitionScreen.tsx';
import { InboxScreen } from './screens/InboxScreen.tsx';
import { PlayerScreen } from './screens/PlayerScreen.tsx';
import { MatchScreen } from './screens/MatchScreen.tsx';
import { SquadScreen } from './screens/SquadScreen.tsx';
import { TacticsScreen } from './screens/TacticsScreen.tsx';
import { StartScreen } from './screens/StartScreen.tsx';

export function App() {
  const game = useGame();
  return game ? <Career game={game} /> : <StartScreen />;
}

function handleContinue(game: GameState): void {
  // On match day (or mid-match) Continue goes to the match instead of moving time on.
  if (getLiveMatch() || humanFixtureOn(game, game.date)) {
    navigate({ screen: 'match' });
    return;
  }
  const reason = continueOnce();
  if ((reason === 'matchPlayed' || reason === 'news') && game.news[0]) {
    navigate({ screen: 'inbox', newsId: game.news[0].id });
  }
}

function Career({ game }: { game: GameState }) {
  const { route } = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.code === 'Space' && !e.altKey && !e.ctrlKey && !e.metaKey && route.screen !== 'match') {
        e.preventDefault();
        handleContinue(game);
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        forward();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, route.screen]);

  // Close the mobile menu whenever the screen changes.
  useEffect(() => setMenuOpen(false), [route]);

  return (
    <div className={`app ${menuOpen ? 'menu-open' : ''}`}>
      <TopBar game={game} onMenu={() => setMenuOpen((o) => !o)} />
      <SideNav game={game} route={route} />
      <main className="main" id="main">
        <Screen game={game} route={route} />
      </main>
    </div>
  );
}

function TopBar({ game, onMenu }: { game: GameState; onMenu: () => void }) {
  const { canBack, canForward } = useRoute();
  const clubId = game.manager.clubId;
  const club = clubId ? game.world.clubs[clubId] : undefined;
  const season = club ? currentSeasonOf(game, club.leagueId) : null;
  // A table position means nothing until a ball has been kicked.
  const position = clubId && season?.status !== 'scheduled' ? leaguePosition(game, clubId) : null;
  const today = clubId ? humanFixtureOn(game, game.date) : null;
  const next = clubId ? nextFixture(game, clubId) : null;
  const opponentOf = (f: NonNullable<typeof next>) => {
    const home = f.homeId === clubId;
    const opponent = game.world.clubs[home ? f.awayId : f.homeId];
    return `${opponent?.shortName ?? '?'} (${home ? 'H' : 'A'})`;
  };

  return (
    <header className="topbar">
      <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Menu">
        ☰
      </button>
      <div className="history-btns">
        <button className="icon-btn" onClick={back} disabled={!canBack} aria-label="Back" title="Back (Alt+←)">
          ‹
        </button>
        <button className="icon-btn" onClick={forward} disabled={!canForward} aria-label="Forward" title="Forward (Alt+→)">
          ›
        </button>
      </div>
      <div className="status">
        {club && (
          <span className="status-club">
            <ClubSwatch club={club} />
            <EntityLink type="club" id={club.id}>
              {club.shortName}
            </EntityLink>
          </span>
        )}
        <span className="status-date">{formatLong(game.date)}</span>
        {position !== null && <span className="status-extra">{ordinal(position)}</span>}
        {today ? (
          <span className="status-extra matchday">Match day: v {opponentOf(today)}</span>
        ) : (
          next && (
            <span className="status-extra">
              Next: {opponentOf(next)} · {formatShort(next.date)}
            </span>
          )
        )}
      </div>
      <button className="continue" onClick={() => handleContinue(game)} title="Continue (Space)">
        {getLiveMatch() ? 'Back to match' : today ? 'Match day' : 'Continue'} <span aria-hidden="true">▶</span>
      </button>
    </header>
  );
}

function NavItem({ to, active, children }: { to: Route; active: boolean; children: ReactNode }) {
  return (
    <li>
      <a
        href="#"
        className={active ? 'nav-item is-active' : 'nav-item'}
        onClick={(e) => {
          e.preventDefault();
          navigate(to);
        }}
      >
        {children}
      </a>
    </li>
  );
}

function SideNav({ game, route }: { game: GameState; route: Route }) {
  const clubId = game.manager.clubId;
  const club = clubId ? game.world.clubs[clubId] : undefined;
  const unread = unreadNewsCount(game);
  const competitions = Object.values(game.world.competitions).sort((a, b) => a.tier - b.tier);

  return (
    <nav className="sidenav" aria-label="Main">
      <ul>
        <NavItem to={{ screen: 'inbox' }} active={route.screen === 'inbox'}>
          Inbox {unread > 0 && <span className="badge">{unread}</span>}
        </NavItem>
        {club && (
          <>
            <NavItem to={{ screen: 'squad', clubId: club.id }} active={route.screen === 'squad' && route.clubId === club.id}>
              Squad
            </NavItem>
            <NavItem to={{ screen: 'tactics' }} active={route.screen === 'tactics'}>
              Tactics
            </NavItem>
            <NavItem to={{ screen: 'fixtures', clubId: club.id }} active={route.screen === 'fixtures' && route.clubId === club.id}>
              Fixtures
            </NavItem>
            <NavItem to={{ screen: 'competition', id: club.leagueId }} active={route.screen === 'competition' && route.id === club.leagueId}>
              League table
            </NavItem>
            <NavItem to={{ screen: 'club', id: club.id }} active={route.screen === 'club' && route.id === club.id}>
              Club
            </NavItem>
          </>
        )}
      </ul>
      <h2 className="nav-heading">Competitions</h2>
      <ul>
        {competitions.map((c) => (
          <NavItem key={c.id} to={{ screen: 'competition', id: c.id }} active={route.screen === 'competition' && route.id === c.id}>
            {c.shortName}
            {currentSeasonOf(game, c.id)?.status === 'finished' && <span className="muted small"> (ended)</span>}
          </NavItem>
        ))}
      </ul>
      <h2 className="nav-heading">Game</h2>
      <ul>
        <li>
          <button className="nav-item" onClick={() => exportCareer(game)}>
            Download save
          </button>
        </li>
        <li>
          <button
            className="nav-item"
            onClick={() => {
              void saveCareer(game).then(() => setGame(null));
            }}
          >
            Save & main menu
          </button>
        </li>
      </ul>
      <p className="nav-hint">Space = Continue · Alt+← / Alt+→ = Back / Forward</p>
    </nav>
  );
}

function Screen({ game, route }: { game: GameState; route: Route }) {
  switch (route.screen) {
    case 'inbox':
      return <InboxScreen game={game} newsId={route.newsId} />;
    case 'squad':
      return <SquadScreen key={route.clubId} game={game} clubId={route.clubId} />;
    case 'player':
      return <PlayerScreen game={game} id={route.id} />;
    case 'club':
      return <ClubScreen game={game} id={route.id} />;
    case 'competition':
      return <CompetitionScreen game={game} id={route.id} tab={route.tab} seasonId={route.seasonId} />;
    case 'fixtures':
      return <FixturesScreen game={game} clubId={route.clubId} />;
    case 'nation':
      return <NationScreen game={game} id={route.id} />;
    case 'tactics':
      return <TacticsScreen game={game} />;
    case 'match':
      return <MatchScreen game={game} />;
  }
}
