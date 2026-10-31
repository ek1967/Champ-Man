import {
  activeBidFor, ageOn, answerIncomingBid, askingPrice, type Bid, type ContractOffer, formatLong, formatMoney, formatShort,
  type GameState, makeBid, nextWindowOpens, offerContract, openWindow, type Player, renewContract, setTransferListed,
  wageDemand, willingToJoin,
} from '@moc/engine';
import { type ReactNode, useState } from 'react';
import { act } from '../state/store.ts';
import { RouteLink } from './EntityLink.tsx';
import { BidForm, ContractForm } from './MoneyInputs.tsx';

type Feedback = { ok: boolean; message: string } | null;

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return <p className={`feedback ${feedback.ok ? 'ok' : 'bad'}`} role="status">{feedback.message}</p>;
}

export const BID_STATUS_LABEL: Record<Bid['status'], string> = {
  pending: 'Waiting for an answer',
  countered: 'They want more',
  rejected: 'Rejected',
  accepted: 'Fee agreed: agree terms',
  completed: 'Completed',
  collapsed: 'Fell through',
  withdrawn: 'Withdrawn',
};

/** Window status in one line, e.g. "Window open until 1 Sep" or "Window opens 1 Jan". */
export function windowLine(date: string): string {
  const w = openWindow(date);
  return w ? `The ${w.name} window is open until ${formatShort(w.closes)}.` : `The transfer window is closed. It opens on ${formatShort(nextWindowOpens(date))}.`;
}

/** Everything the manager can do about a player's future: sign, bid, renew, list. */
export function TransferPanel({ game, player }: { game: GameState; player: Player }) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const clubId = game.manager.clubId;
  if (!clubId) return null;
  const mine = player.clubId === clubId;
  const free = player.clubId === null;
  const age = ageOn(player.dateOfBirth, game.date);

  if (mine) {
    const incoming = game.transfers.bids.filter((b) => b.playerId === player.id && b.sellerId === clubId && b.status === 'pending');
    return (
      <section className="transfer-panel">
        <h2>Contract and transfers</h2>
        <p>
          Contract until {player.contract ? formatLong(player.contract.expires).slice(4) : '—'} on{' '}
          {player.contract ? formatMoney(player.contract.wage) : '—'} a week · Value {formatMoney(player.value)} · Your board would want about{' '}
          {formatMoney(askingPrice(game, player))}
        </p>
        <label className="check-line" htmlFor="listed">
          <input
            id="listed"
            type="checkbox"
            checked={player.transferListed}
            onChange={(e) => act((g) => setTransferListed(g, player.id, e.target.checked))}
          />
          Transfer-listed (other clubs are more likely to bid, and for less)
        </label>
        {incoming.map((bid) => (
          <IncomingBid key={bid.id} game={game} bid={bid} onDone={setFeedback} />
        ))}
        <h3>Offer a new contract</h3>
        <ContractForm
          idPrefix="renew"
          demand={wageDemand(game, player, clubId)}
          maxYears={age >= 32 ? 2 : 5}
          submitLabel="Offer new contract"
          onSubmit={(offer) => setFeedback(act((g) => renewContract(g, player.id, offer)))}
        />
        <FeedbackLine feedback={feedback} />
      </section>
    );
  }

  const willing = willingToJoin(game, player, clubId);
  const signFree = (offer: ContractOffer) => setFeedback(act((g) => offerContract(g, player.id, offer)));

  if (free) {
    return (
      <section className="transfer-panel">
        <h2>Free agent</h2>
        <p>Available without a fee. {willing.ok ? '' : `${player.knownAs ?? player.lastName} ${willing.reason}.`}</p>
        <ContractForm idPrefix="free" demand={wageDemand(game, player, clubId)} maxYears={age >= 32 ? 2 : 5} onSubmit={signFree} />
        <FeedbackLine feedback={feedback} />
      </section>
    );
  }

  const bid = activeBidFor(game, player.id, clubId);
  const windowOpen = openWindow(game.date) !== null;
  return (
    <section className="transfer-panel">
      <h2>Transfer</h2>
      <p className="muted">{windowLine(game.date)}</p>
      <p>
        Value {formatMoney(player.value)} · Contract until {player.contract ? formatLong(player.contract.expires).slice(4) : '—'}
        {player.transferListed && <span className="tag listed">Transfer-listed</span>}
      </p>
      {!willing.ok && <p className="warning small">{player.knownAs ?? player.lastName} {willing.reason}, so personal terms will be difficult.</p>}
      {bid && (
        <div className="bid-status">
          <p>
            <strong>Your offer: {formatMoney(bid.fee)}</strong> · {BID_STATUS_LABEL[bid.status]}
            {bid.note && <span className="muted"> · {bid.note}</span>}
          </p>
          {bid.status === 'accepted' && (
            <>
              <h3>Personal terms</h3>
              <ContractForm idPrefix="terms" demand={wageDemand(game, player, clubId)} maxYears={age >= 32 ? 2 : 5} onSubmit={signFree} submitLabel="Offer contract" />
            </>
          )}
        </div>
      )}
      {windowOpen && (!bid || bid.status === 'countered') && (
        <BidForm
          idPrefix="bid"
          suggested={bid?.asking ?? player.value}
          quick={[
            { label: 'Value', amount: player.value },
            ...(bid?.asking ? [{ label: 'Their price', amount: bid.asking }] : []),
          ]}
          submitLabel={bid ? 'Improve offer' : 'Make offer'}
          onSubmit={(fee) => setFeedback(act((g) => makeBid(g, player.id, fee)))}
        />
      )}
      <FeedbackLine feedback={feedback} />
    </section>
  );
}

function IncomingBid({ game, bid, onDone }: { game: GameState; bid: Bid; onDone: (f: Feedback) => void }) {
  const buyer = game.world.clubs[bid.buyerId];
  return (
    <div className="bid-status">
      <p>
        <strong>
          {buyer?.shortName} offer {formatMoney(bid.fee)}
        </strong>{' '}
        <span className="muted">(answer by {formatShort(bid.respondOn)})</span>
      </p>
      <div className="button-row">
        <button className="btn primary" onClick={() => onDone(act((g) => answerIncomingBid(g, bid.id, true)))}>
          Accept
        </button>
        <button className="btn" onClick={() => onDone(act((g) => answerIncomingBid(g, bid.id, false)))}>
          Reject
        </button>
      </div>
    </div>
  );
}

/** Actions under a transfer news item in the inbox. */
export function BidActions({ game, bidId }: { game: GameState; bidId: string }) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const bid = game.transfers.bids.find((b) => b.id === bidId);
  const clubId = game.manager.clubId;
  if (!bid || !clubId) return null;
  const player = game.world.players[bid.playerId];
  if (!player) return null;

  let body: ReactNode = <p className="muted">Status: {BID_STATUS_LABEL[bid.status]}{bid.note ? ` · ${bid.note}` : ''}</p>;
  if (bid.sellerId === clubId && bid.status === 'pending') {
    body = <IncomingBid game={game} bid={bid} onDone={setFeedback} />;
  } else if (bid.buyerId === clubId && bid.status === 'accepted') {
    body = (
      <>
        <h3>Personal terms</h3>
        <ContractForm
          idPrefix={`terms-${bid.id}`}
          demand={wageDemand(game, player, clubId)}
          maxYears={ageOn(player.dateOfBirth, game.date) >= 32 ? 2 : 5}
          onSubmit={(offer) => setFeedback(act((g) => offerContract(g, player.id, offer)))}
        />
      </>
    );
  } else if (bid.buyerId === clubId && bid.status === 'countered' && bid.asking) {
    const asking = bid.asking;
    body = (
      <div className="button-row">
        <button className="btn primary" onClick={() => setFeedback(act((g) => makeBid(g, player.id, asking)))}>
          Offer {formatMoney(asking)}
        </button>
      </div>
    );
  }
  return (
    <div className="bid-actions">
      {body}
      <FeedbackLine feedback={feedback} />
      <p>
        <RouteLink to={{ screen: 'player', id: player.id }}>Go to {player.knownAs ?? player.lastName}'s page →</RouteLink>
      </p>
    </div>
  );
}
