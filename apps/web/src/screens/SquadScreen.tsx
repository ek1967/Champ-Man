import {
  abilityStars, ageOn, attributeBand, type GameState, mainPosition, type Player, type Position, POSITIONS, squadOf,
} from '@moc/engine';
import { FormChips, Stars } from '../components/Ratings.tsx';
import { useState } from 'react';
import { ClubName } from '../components/ClubName.tsx';
import { EntityLink } from '../components/EntityLink.tsx';
import { money, wage } from '../components/format.ts';
import { type Column, SortableTable } from '../components/SortableTable.tsx';
import { Condition, statusOf } from './TacticsScreen.tsx';
import { Tabs } from '../components/Tabs.tsx';

type View = 'general' | 'attributes' | 'contracts';

const POSITION_INDEX = new Map<Position, number>(POSITIONS.map((p, i) => [p, i]));

/** 'DC, DM': positions the player is comfortable in (familiarity 15+), main one first. */
export function positionsLabel(player: Player): string {
  const main = mainPosition(player);
  const others = POSITIONS.filter((p) => p !== main && (player.positions[p] ?? 0) >= 15);
  return [main, ...others].join(', ');
}

function seasonStats(game: GameState, player: Player) {
  const club = player.clubId ? game.world.clubs[player.clubId] : undefined;
  const seasonId = club ? game.currentSeason[club.leagueId] : undefined;
  const label = seasonId ? game.seasons[seasonId]?.label : undefined;
  const entry = player.stats.find((s) => s.season === label && s.competitionId === club?.leagueId);
  return entry ?? { apps: 0, goals: 0, assists: 0, ratingTotal: 0 };
}

function averageRating(game: GameState, player: Player): number {
  const s = seasonStats(game, player);
  return s.apps > 0 ? s.ratingTotal / s.apps : 0;
}

export function SquadScreen({ game, clubId }: { game: GameState; clubId: string }) {
  const [view, setView] = useState<View>('general');
  const club = game.world.clubs[clubId];
  if (!club) return <p>Unknown club.</p>;
  const squad = squadOf(game, clubId);
  const mine = clubId === game.manager.clubId;

  const base: Column<Player>[] = [
    { id: 'no', label: 'No.', render: (p) => p.squadNumber ?? '', sortValue: (p) => p.squadNumber ?? 99, align: 'right' },
    {
      id: 'name',
      label: 'Name',
      render: (p) => (
        <EntityLink type="player" id={p.id}>
          {p.knownAs ?? `${p.firstName} ${p.lastName}`}
        </EntityLink>
      ),
      sortValue: (p) => p.knownAs ?? p.lastName,
    },
    {
      id: 'pos',
      label: 'Position',
      render: positionsLabel,
      sortValue: (p) => POSITION_INDEX.get(mainPosition(p)) ?? 0,
    },
    { id: 'ability', label: 'Ability', render: (p) => <Stars value={abilityStars(p.ca)} />, sortValue: (p) => p.ca },
  ];

  const views: Record<View, Column<Player>[]> = {
    general: [
      ...base,
      { id: 'potential', label: 'Potential', render: (p) => <Stars value={abilityStars(p.pa)} label="Potential" />, sortValue: (p) => p.pa },
      { id: 'form', label: 'Form', render: (p) => <FormChips form={p.form} />, sortValue: (p) => (p.form.length ? p.form.reduce((a, b) => a + b, 0) / p.form.length : 0) },
      { id: 'age', label: 'Age', render: (p) => ageOn(p.dateOfBirth, game.date), sortValue: (p) => ageOn(p.dateOfBirth, game.date), align: 'right' },
      {
        id: 'nat',
        label: 'Nat',
        render: (p) => (
          <EntityLink type="nation" id={p.nationId}>
            {game.world.nations[p.nationId]?.code}
          </EntityLink>
        ),
        sortValue: (p) => game.world.nations[p.nationId]?.code ?? '',
      },
      { id: 'cond', label: 'Cond', title: 'Match fitness', render: (p) => <Condition value={p.condition} />, sortValue: (p) => p.condition, align: 'right' },
      {
        id: 'status',
        label: 'Status',
        render: (p) => {
          const status = statusOf(p, game.date);
          return (
            <>
              {status && <span className="tag danger" title={status}>{status.startsWith('Injured') ? 'Inj' : 'Sus'}</span>}
              {p.transferListed && <span className="tag listed">Listed</span>}
            </>
          );
        },
        sortValue: (p) => (statusOf(p, game.date) ? 1 : 0),
      },
      { id: 'apps', label: 'Apps', render: (p) => seasonStats(game, p).apps, sortValue: (p) => seasonStats(game, p).apps, align: 'right' },
      { id: 'gls', label: 'Gls', render: (p) => seasonStats(game, p).goals, sortValue: (p) => seasonStats(game, p).goals, align: 'right' },
      { id: 'ast', label: 'Ast', render: (p) => seasonStats(game, p).assists, sortValue: (p) => seasonStats(game, p).assists, align: 'right' },
      {
        id: 'rating',
        label: 'Av Rat',
        title: 'Average match rating this season',
        render: (p) => (averageRating(game, p) > 0 ? averageRating(game, p).toFixed(2) : '–'),
        sortValue: (p) => averageRating(game, p),
        align: 'right',
      },
      { id: 'value', label: 'Value', render: (p) => money(p.value), sortValue: (p) => p.value, align: 'right' },
    ],
    attributes: [
      ...base,
      ...(['pace', 'stamina', 'strength', 'passing', 'tackling', 'finishing', 'decisions', 'workRate'] as const).map(
        (key): Column<Player> => ({
          id: key,
          label: key === 'workRate' ? 'Wrk' : key.slice(0, 3).replace(/^./, (c) => c.toUpperCase()),
          title: key,
          render: (p) => <span className={`attr ${attributeBand(p.attributes[key])}`}>{p.attributes[key]}</span>,
          sortValue: (p) => p.attributes[key],
          align: 'center',
        }),
      ),
    ],
    contracts: [
      ...base,
      { id: 'wage', label: 'Wage', render: (p) => (p.contract ? wage(p.contract.wage) : '—'), sortValue: (p) => p.contract?.wage ?? 0, align: 'right' },
      { id: 'expires', label: 'Expires', render: (p) => p.contract?.expires ?? '—', sortValue: (p) => p.contract?.expires ?? '', align: 'right' },
      { id: 'value', label: 'Value', render: (p) => money(p.value), sortValue: (p) => p.value, align: 'right' },
    ],
  };

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>
          <ClubName club={club} /> squad
        </h1>
        <p className="muted">
          {squad.length} players{mine ? '' : ' · scouting view'}
        </p>
      </header>
      <Tabs
        tabs={[
          { id: 'general', label: 'General' },
          { id: 'attributes', label: 'Key attributes' },
          { id: 'contracts', label: 'Contracts' },
        ]}
        active={view}
        onChange={setView}
      />
      <SortableTable rows={squad} columns={views[view]} rowKey={(p) => p.id} />
    </div>
  );
}
