import {
  abilityStars, ageOn, answerIncomingBid, type Bid, financesOf, formatMoney, formatShort, type GameState,
  mainPosition, type Player, POSITION_GROUP, recentTransfers, shortName, wageBill,
} from '@moc/engine';
import { useMemo, useState } from 'react';
import { ClubName } from '../components/ClubName.tsx';
import { EntityLink } from '../components/EntityLink.tsx';
import { Stars } from '../components/Ratings.tsx';
import { type Column, SortableTable } from '../components/SortableTable.tsx';
import { Tabs } from '../components/Tabs.tsx';
import { BID_STATUS_LABEL, windowLine } from '../components/TransferPanel.tsx';
import { act } from '../state/store.ts';

type Tab = 'search' | 'bids' | 'deals';

interface Filters {
  text: string;
  group: 'any' | 'GK' | 'DEF' | 'MID' | 'ATT';
  minAge: number;
  maxAge: number;
  maxValue: number;
  minStars: number;
  where: 'all' | 'eng-1' | 'eng-2' | 'free';
  listedOnly: boolean;
  expiringOnly: boolean;
}

const DEFAULT_FILTERS: Filters = {
  text: '', group: 'any', minAge: 15, maxAge: 40, maxValue: 0, minStars: 0, where: 'all', listedOnly: false, expiringOnly: false,
};

const VALUE_OPTIONS = [0, 2_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000];

export function TransfersScreen({ game }: { game: GameState }) {
  const [tab, setTab] = useState<Tab>('search');
  const clubId = game.manager.clubId;
  if (!clubId) return <p>You need a club to buy and sell players.</p>;
  const finances = financesOf(game, clubId);
  const bill = wageBill(game, clubId);
  const pendingIncoming = game.transfers.bids.filter((b) => b.sellerId === clubId && b.status === 'pending').length;

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Transfers</h1>
        <p className="muted">{windowLine(game.date)}</p>
      </header>
      <div className="facts">
        <div><span>Transfer budget</span>{formatMoney(finances.transferBudget)}</div>
        <div><span>Wage bill</span>{formatMoney(bill)} a week</div>
        <div><span>Wage budget</span>{formatMoney(finances.wageBudget)} a week</div>
        <div><span>Room for wages</span>{formatMoney(Math.max(0, finances.wageBudget - bill))} a week</div>
      </div>
      <Tabs
        tabs={[
          { id: 'search', label: 'Find players' },
          { id: 'bids', label: `Offers${pendingIncoming ? ` (${pendingIncoming} to answer)` : ''}` },
          { id: 'deals', label: 'Latest deals' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'search' && <Search game={game} />}
      {tab === 'bids' && <Bids game={game} />}
      {tab === 'deals' && <Deals game={game} />}
    </div>
  );
}

function Search({ game }: { game: GameState }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const clubId = game.manager.clubId;
  const seasonEnd = `${Number(game.date.slice(0, 4)) + (game.date.slice(5) >= '07-01' ? 1 : 0)}-06-30`;

  const results = useMemo(() => {
    const text = filters.text.trim().toLowerCase();
    return Object.values(game.world.players)
      .filter((p) => {
        if (p.clubId === clubId) return false;
        const club = p.clubId ? game.world.clubs[p.clubId] : undefined;
        if (filters.where === 'free' && p.clubId) return false;
        if ((filters.where === 'eng-1' || filters.where === 'eng-2') && club?.leagueId !== filters.where) return false;
        if (filters.group !== 'any' && POSITION_GROUP[mainPosition(p)] !== filters.group) return false;
        const age = ageOn(p.dateOfBirth, game.date);
        if (age < filters.minAge || age > filters.maxAge) return false;
        if (filters.maxValue && p.value > filters.maxValue) return false;
        if (filters.minStars && abilityStars(p.ca) < filters.minStars) return false;
        if (filters.listedOnly && !p.transferListed) return false;
        if (filters.expiringOnly && !(p.contract && p.contract.expires <= seasonEnd)) return false;
        if (text && !`${p.firstName} ${p.lastName} ${p.knownAs ?? ''}`.toLowerCase().includes(text)) return false;
        return true;
      })
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 150);
  }, [game, filters, clubId, seasonEnd]);

  const columns: Column<Player>[] = [
    { id: 'name', label: 'Name', render: (p) => <EntityLink type="player" id={p.id}>{shortName(p)}</EntityLink>, sortValue: (p) => p.knownAs ?? p.lastName },
    {
      id: 'club',
      label: 'Club',
      render: (p) => {
        const club = p.clubId ? game.world.clubs[p.clubId] : undefined;
        return club ? <ClubName club={club} short /> : <span className="tag free">Free agent</span>;
      },
      sortValue: (p) => (p.clubId ? game.world.clubs[p.clubId]?.shortName ?? '' : ''),
    },
    { id: 'pos', label: 'Pos', render: (p) => mainPosition(p), sortValue: (p) => mainPosition(p) },
    { id: 'age', label: 'Age', render: (p) => ageOn(p.dateOfBirth, game.date), sortValue: (p) => ageOn(p.dateOfBirth, game.date), align: 'right' },
    { id: 'ability', label: 'Ability', render: (p) => <Stars value={abilityStars(p.ca)} />, sortValue: (p) => p.ca },
    { id: 'potential', label: 'Potential', render: (p) => <Stars value={abilityStars(p.pa)} label="Potential" />, sortValue: (p) => p.pa },
    { id: 'value', label: 'Value', render: (p) => formatMoney(p.value), sortValue: (p) => p.value, align: 'right' },
    { id: 'contract', label: 'Contract', render: (p) => (p.contract ? p.contract.expires.slice(0, 4) : '—'), sortValue: (p) => p.contract?.expires ?? '', align: 'right' },
    {
      id: 'status',
      label: '',
      render: (p) => (
        <>
          {p.transferListed && <span className="tag listed">Listed</span>}
          {p.contract && p.contract.expires <= seasonEnd && <span className="tag">Expiring</span>}
        </>
      ),
    },
  ];

  return (
    <>
      <form className="filters" onSubmit={(e) => e.preventDefault()}>
        <label className="field">
          <span>Name</span>
          <input id="f-text" value={filters.text} onChange={(e) => set('text', e.target.value)} placeholder="Any" />
        </label>
        <label className="field">
          <span>Position</span>
          <select id="f-group" value={filters.group} onChange={(e) => set('group', e.target.value as Filters['group'])}>
            <option value="any">Any</option>
            <option value="GK">Goalkeepers</option>
            <option value="DEF">Defenders</option>
            <option value="MID">Midfielders</option>
            <option value="ATT">Attackers</option>
          </select>
        </label>
        <label className="field">
          <span>Age</span>
          <span className="range">
            <input id="f-min-age" type="number" min={15} max={45} value={filters.minAge} onChange={(e) => set('minAge', Number(e.target.value))} />
            –
            <input id="f-max-age" type="number" min={15} max={45} value={filters.maxAge} onChange={(e) => set('maxAge', Number(e.target.value))} />
          </span>
        </label>
        <label className="field">
          <span>Value up to</span>
          <select id="f-value" value={filters.maxValue} onChange={(e) => set('maxValue', Number(e.target.value))}>
            {VALUE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v === 0 ? 'Any' : formatMoney(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Ability at least</span>
          <select id="f-stars" value={filters.minStars} onChange={(e) => set('minStars', Number(e.target.value))}>
            {[0, 2, 2.5, 3, 3.5, 4, 4.5].map((s) => (
              <option key={s} value={s}>
                {s === 0 ? 'Any' : `${s} stars`}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Where</span>
          <select id="f-where" value={filters.where} onChange={(e) => set('where', e.target.value as Filters['where'])}>
            <option value="all">Everywhere</option>
            <option value="eng-1">Premier League</option>
            <option value="eng-2">Championship</option>
            <option value="free">Free agents</option>
          </select>
        </label>
        <label className="check-line" htmlFor="f-listed">
          <input id="f-listed" type="checkbox" checked={filters.listedOnly} onChange={(e) => set('listedOnly', e.target.checked)} />
          Transfer-listed
        </label>
        <label className="check-line" htmlFor="f-expiring">
          <input id="f-expiring" type="checkbox" checked={filters.expiringOnly} onChange={(e) => set('expiringOnly', e.target.checked)} />
          Contract ending this season
        </label>
        <button type="button" className="btn small ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>
          Clear
        </button>
      </form>
      <p className="muted small">
        {results.length === 150 ? 'Showing the best 150 matches.' : `${results.length} players.`} Click a name to make an offer.
      </p>
      <SortableTable rows={results} columns={columns} rowKey={(p) => p.id} />
    </>
  );
}

function Bids({ game }: { game: GameState }) {
  const clubId = game.manager.clubId!;
  const outgoing = game.transfers.bids.filter((b) => b.buyerId === clubId).reverse();
  const incoming = game.transfers.bids.filter((b) => b.sellerId === clubId).reverse();
  const playerCell = (b: Bid) => {
    const p = game.world.players[b.playerId];
    return p ? <EntityLink type="player" id={p.id}>{shortName(p)}</EntityLink> : '';
  };
  const clubCell = (id: string) => {
    const club = game.world.clubs[id];
    return club ? <ClubName club={club} short /> : '';
  };
  return (
    <>
      <h2>Offers for your players</h2>
      {incoming.length === 0 ? (
        <p className="muted">No offers yet. Transfer-listing a player makes offers more likely.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Date</th><th>Player</th><th>From</th><th className="right">Fee</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {incoming.map((b) => (
                <tr key={b.id}>
                  <td>{formatShort(b.created)}</td>
                  <td>{playerCell(b)}</td>
                  <td>{clubCell(b.buyerId)}</td>
                  <td className="right">{formatMoney(b.fee)}</td>
                  <td>{b.status === 'pending' ? `Answer by ${formatShort(b.respondOn)}` : BID_STATUS_LABEL[b.status]}</td>
                  <td className="right">
                    {b.status === 'pending' && (
                      <span className="button-row">
                        <button className="btn small primary" onClick={() => act((g) => answerIncomingBid(g, b.id, true))}>Accept</button>
                        <button className="btn small" onClick={() => act((g) => answerIncomingBid(g, b.id, false))}>Reject</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2>Your offers</h2>
      {outgoing.length === 0 ? (
        <p className="muted">You haven't made any offers. Find a player and make one from their page.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Date</th><th>Player</th><th>Club</th><th className="right">Fee</th><th>Status</th></tr>
            </thead>
            <tbody>
              {outgoing.map((b) => (
                <tr key={b.id}>
                  <td>{formatShort(b.created)}</td>
                  <td>{playerCell(b)}</td>
                  <td>{clubCell(b.sellerId)}</td>
                  <td className="right">{formatMoney(b.fee)}</td>
                  <td>
                    <span className={`bid-pill ${b.status}`}>{BID_STATUS_LABEL[b.status]}</span>
                    {b.note && <span className="muted small"> {b.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Deals({ game }: { game: GameState }) {
  const [leagueOnly, setLeagueOnly] = useState(true);
  const leagueId = game.world.clubs[game.manager.clubId ?? '']?.leagueId;
  const deals = recentTransfers(game, 300).filter((r) => {
    if (r.kind === 'released') return false;
    if (!leagueOnly) return true;
    return (r.toId && game.world.clubs[r.toId]?.leagueId === leagueId) || (r.fromId && game.world.clubs[r.fromId]?.leagueId === leagueId);
  });
  return (
    <>
      <label className="check-line" htmlFor="deals-league">
        <input id="deals-league" type="checkbox" checked={leagueOnly} onChange={(e) => setLeagueOnly(e.target.checked)} />
        Only deals involving your league
      </label>
      {deals.length === 0 ? (
        <p className="muted">No deals yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Date</th><th>Player</th><th>From</th><th>To</th><th className="right">Fee</th></tr>
            </thead>
            <tbody>
              {deals.map((r, i) => {
                const p = game.world.players[r.playerId];
                const from = r.fromId ? game.world.clubs[r.fromId] : undefined;
                const to = r.toId ? game.world.clubs[r.toId] : undefined;
                return (
                  <tr key={i}>
                    <td>{formatShort(r.date)}</td>
                    <td>{p && <EntityLink type="player" id={p.id}>{shortName(p)}</EntityLink>}</td>
                    <td>{from ? <ClubName club={from} short /> : <span className="muted">Free agent</span>}</td>
                    <td>{to && <ClubName club={to} short />}</td>
                    <td className="right">{r.fee > 0 ? formatMoney(r.fee) : 'Free'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
