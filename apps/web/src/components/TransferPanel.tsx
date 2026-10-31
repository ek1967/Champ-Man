import {
  activeBidFor, ageOn, agreedMoveFor, answerIncomingBid, askingPrice, type Bid, type ContractOffer, formatLong, formatMoney,
  formatShort, type GameState, type LoanLength, makeBid, nextWindowOpens, offerContract, offerLoanOut, openWindow, type Player,
  preContractAllowed, releaseByManager, releaseCost, renewContract, requestLoan, setTransferListed, wageDemand, willingToJoin,
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
  agreed: 'Agreed: moves when the window opens',
  completed: 'Completed',
  collapsed: 'Fell through',
  withdrawn: 'Withdrawn',
};

/** Window status in one line, e.g. "Window open until 1 Sep" or "Window opens 1 Jan". */
export function windowLine(date: string): string {
  const w = openWindow(date);
  return w
    ? `The ${w.name} window is open until ${formatShort(w.closes)}.`
    : `The window opens on ${formatShort(nextWindowOpens(date))}. You can agree deals now; players move when it opens.`;
}

function clubName(game: GameState, id: string | undefined | null): string {
  return (id && game.world.clubs[id]?.shortName) || '?';
}

/** "Agreed to join Arsenal on 1 Jul", "On loan from Chelsea until 30 Jun", or nothing. */
export function movementNote(game: GameState, player: Player): string | null {
  if (player.loan) return `On loan from ${clubName(game, player.loan.fromId)} until ${formatShort(player.loan.until)} ${player.loan.until.slice(0, 4)}`;
  const agreed = agreedMoveFor(game, player.id);
  if (agreed?.moveOn) {
    return `${agreed.kind === 'loan' ? 'Agreed a loan to' : 'Agreed to join'} ${clubName(game, agreed.buyerId)} on ${formatShort(agreed.moveOn)}`;
  }
  return null;
}

function LoanLengthPicker(props: { id: string; value: LoanLength; onChange: (v: LoanLength) => void }) {
  return (
    <label className="money-field" htmlFor={props.id}>
      <span>Loan until</span>
      <select id={props.id} value={props.value} onChange={(e) => props.onChange(e.target.value as LoanLength)}>
        <option value="january">31 December</option>
        <option value="season">End of the season</option>
      </select>
    </label>
  );
}

/** Everything the manager can do about a player's future: sign, bid, renew, list. */
export function TransferPanel({ game, player }: { game: GameState; player: Player }) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const clubId = game.manager.clubId;
  if (!clubId) return null;
  const mine = player.clubId === clubId;
  const free = player.clubId === null;
  const age = ageOn(player.dateOfBirth, game.date);

  const note = movementNote(game, player);

  if (mine && player.loan) {
    return (
      <section className="transfer-panel">
        <h2>On loan</h2>
        <p>{note}. You pay their wages of {formatMoney(player.contract?.wage ?? 0)} a week.</p>
      </section>
    );
  }

  if (mine) {
    const incoming = game.transfers.bids.filter((b) => b.playerId === player.id && b.sellerId === clubId && b.status === 'pending' && b.kind !== 'loan');
    return (
      <section className="transfer-panel">
        <h2>Contract and transfers</h2>
        {note && <p className="tag-line"><span className="tag listed">{note}</span></p>}
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
        <LoanOutControl player={player} onDone={setFeedback} />
        <ReleaseControl game={game} player={player} onDone={setFeedback} />
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
  const agreedHere = game.transfers.bids.find((b) => b.playerId === player.id && b.buyerId === clubId && b.status === 'agreed');
  const preContract = !bid && !agreedHere && preContractAllowed(game, player);
  if (player.loan || (note && !agreedHere)) {
    return (
      <section className="transfer-panel">
        <h2>Transfer</h2>
        <p>{note}. Not available for now.</p>
      </section>
    );
  }
  return (
    <section className="transfer-panel">
      <h2>Transfer</h2>
      <p className="muted">{windowLine(game.date)}</p>
      {agreedHere && <p className="feedback ok">{agreedHere.kind === 'loan' ? 'Loan agreed' : 'Deal agreed'}: joins you on {formatShort(agreedHere.moveOn ?? game.date)}.</p>}
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
      {preContract && (
        <>
          <h3>Pre-contract</h3>
          <p className="small">
            {player.knownAs ?? player.lastName}'s contract ends in June, so you can agree a free transfer now. The move happens on 1 July.
          </p>
          <ContractForm idPrefix="pre" demand={wageDemand(game, player, clubId)} maxYears={age >= 32 ? 2 : 5} onSubmit={signFree} submitLabel="Offer pre-contract" />
        </>
      )}
      {!agreedHere && (!bid || bid.status === 'countered') && (
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
      {!agreedHere && !bid && <LoanRequestControl player={player} onDone={setFeedback} />}
      <FeedbackLine feedback={feedback} />
    </section>
  );
}

function LoanRequestControl({ player, onDone }: { player: Player; onDone: (f: Feedback) => void }) {
  const [length, setLength] = useState<LoanLength>('season');
  return (
    <form
      className="money-form"
      onSubmit={(e) => {
        e.preventDefault();
        onDone(act((g) => requestLoan(g, player.id, length)));
      }}
    >
      <LoanLengthPicker id="loan-in-length" value={length} onChange={setLength} />
      <span className="muted small">You pay the player's wages.</span>
      <button className="btn" type="submit">Ask to borrow</button>
    </form>
  );
}

function LoanOutControl({ player, onDone }: { player: Player; onDone: (f: Feedback) => void }) {
  const [length, setLength] = useState<LoanLength>('season');
  return (
    <form
      className="money-form"
      onSubmit={(e) => {
        e.preventDefault();
        onDone(act((g) => offerLoanOut(g, player.id, length)));
      }}
    >
      <LoanLengthPicker id="loan-out-length" value={length} onChange={setLength} />
      <span className="muted small">Regular games help young players develop.</span>
      <button className="btn" type="submit">Offer out on loan</button>
    </form>
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

/** Releasing needs a second click, with the cost shown, since it can't be undone. */
function ReleaseControl({ game, player, onDone }: { game: GameState; player: Player; onDone: (f: Feedback) => void }) {
  const [confirming, setConfirming] = useState(false);
  const cost = releaseCost(game, player);
  if (!confirming) {
    return (
      <p>
        <button className="btn small ghost" onClick={() => setConfirming(true)}>
          Release player…
        </button>
      </p>
    );
  }
  return (
    <div className="warning release-confirm">
      <p>
        Release {player.knownAs ?? player.lastName}? Paying up the contract costs {cost > 0 ? formatMoney(cost) : 'nothing'}, taken from your
        transfer budget. This can't be undone.
      </p>
      <div className="button-row">
        <button className="btn primary" onClick={() => onDone(act((g) => releaseByManager(g, player.id)))}>
          Release
        </button>
        <button className="btn" onClick={() => setConfirming(false)}>
          Keep
        </button>
      </div>
    </div>
  );
}
