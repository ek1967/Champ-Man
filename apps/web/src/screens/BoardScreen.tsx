import {
  availableBudget, boardTarget, committed, currentSeasonOf, confidenceLabel, type FacilityKind, financesOf, formatMoney, formatShort,
  type GameState, leaguePosition, MAX_FACILITY_LEVEL, requestFromBoard, requestOptions, shiftBudget, wageBill, WEEKS_PER_SEASON,
} from '@moc/engine';
import { useState } from 'react';
import { ClubFinancesPanel } from '../components/Finances.tsx';
import { ordinal } from '../components/format.ts';
import { act } from '../state/store.ts';

type Feedback = { ok: boolean; message: string } | null;

const FACILITY_LABEL: Record<FacilityKind, string> = { stadium: 'Stadium', training: 'Training facilities', youth: 'Youth academy' };

/** The board: their confidence, your contract, the budgets, and what you can ask them for. */
export function BoardScreen({ game }: { game: GameState }) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const clubId = game.manager.clubId;
  if (!clubId) return <p>You need a club first.</p>;
  // The board's state is created when you take the job (older saves: on the next day).
  const b = game.board;
  if (!b) return <p>The board will meet you tomorrow. Press Continue.</p>;
  const target = boardTarget(game, clubId);
  const league = game.world.clubs[clubId]!.leagueId;
  const started = currentSeasonOf(game, league)?.status === 'inProgress';
  const position = started ? leaguePosition(game, clubId) : null;
  const options = requestOptions(game);
  const history = [...b.requests].reverse().slice(0, 8);
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Board</h1>
        <p className="muted">
          The board expect you to <strong>{target.text}</strong>
          {position ? `; you're ${ordinal(position)} at the moment.` : '.'}
        </p>
      </header>

      <div className="facts">
        <div>
          <span>Board confidence</span>
          <span className="knowledge" title={`${Math.round(b.confidence)} out of 100`}>
            <span className="knowledge-track" aria-hidden="true"><span style={{ width: `${b.confidence}%` }} /></span>
            {confidenceLabel(b.confidence)}
          </span>
        </div>
        <div><span>Your contract</span>Until {formatShort(b.contract.expires)} {b.contract.expires.slice(0, 4)}</div>
        <div><span>Your wage</span>{formatMoney(b.contract.wage)} a week</div>
      </div>
      <p className="small muted">
        Confidence rises with wins and with league positions at or above what the board expect, and is judged at the end of each season.
        It decides how much money you get each summer and how the board answer your requests.
      </p>

      <Budgets game={game} clubId={clubId} onDone={setFeedback} />
      <ClubFinancesPanel game={game} clubId={clubId} />

      <h2>Requests</h2>
      <div className="request-list">
        {options.map((o) => (
          <div key={o.kind} className="request">
            <div>
              <strong>{o.label}</strong>
              <p className="small muted">{o.blocked ?? o.description}</p>
            </div>
            <button className="btn" disabled={!!o.blocked} onClick={() => setFeedback(act((g) => requestFromBoard(g, o.kind)))}>
              Ask the board
            </button>
          </div>
        ))}
      </div>
      {feedback && <p className={`feedback ${feedback.ok ? 'ok' : 'bad'}`} role="status">{feedback.message}</p>}

      <h2>Facilities</h2>
      <div className="facts">
        {(Object.keys(FACILITY_LABEL) as FacilityKind[]).map((kind) => {
          const project = b.projects.find((p) => p.kind === kind);
          return (
            <div key={kind}>
              <span>{FACILITY_LABEL[kind]}</span>
              {b.facilities[kind] === 0 ? 'As it was' : `Improved ${b.facilities[kind]} of ${MAX_FACILITY_LEVEL} times`}
              {project && <small className="muted"> · work finishes {formatShort(project.due)} {project.due.slice(0, 4)}</small>}
            </div>
          );
        })}
      </div>

      {history.length > 0 && (
        <>
          <h2>Recent requests</h2>
          <ul className="plain-list">
            {history.map((r, i) => (
              <li key={`${r.date}-${i}`}>
                <span className={`tag ${r.granted ? 'ok' : 'danger'}`}>{r.granted ? 'Agreed' : 'Refused'}</span>{' '}
                <span className="muted small">{formatShort(r.date)}</span> {r.note}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Budgets({ game, clubId, onDone }: { game: GameState; clubId: string; onDone: (f: Feedback) => void }) {
  const [direction, setDirection] = useState<'toWages' | 'toTransfer'>('toWages');
  const [thousands, setThousands] = useState('10');
  const f = financesOf(game, clubId);
  const bill = wageBill(game, clubId);
  const promised = committed(game, clubId);
  const perWeek = Math.round(Number(thousands) * 1000);
  const lump = perWeek * WEEKS_PER_SEASON;
  return (
    <>
      <h2>Budgets</h2>
      <div className="facts">
        <div><span>Transfer budget</span>{formatMoney(f.transferBudget)}</div>
        <div><span>Free to spend</span>{formatMoney(Math.max(0, availableBudget(game, clubId)))}</div>
        <div><span>Wage budget</span>{formatMoney(f.wageBudget)} a week</div>
        <div><span>Wage bill</span>{formatMoney(bill + promised.wages)} a week</div>
        <div><span>Room for wages</span>{formatMoney(Math.max(0, f.wageBudget - bill - promised.wages))} a week</div>
      </div>
      <form
        className="money-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (perWeek > 0) onDone(act((g) => shiftBudget(g, direction === 'toWages' ? perWeek : -perWeek)));
        }}
      >
        <label className="money-field" htmlFor="shift-direction">
          <span>Move money</span>
          <select id="shift-direction" value={direction} onChange={(e) => setDirection(e.target.value as 'toWages' | 'toTransfer')}>
            <option value="toWages">From transfers to wages</option>
            <option value="toTransfer">From wages to transfers</option>
          </select>
        </label>
        <label className="money-field" htmlFor="shift-amount">
          <span>Wages</span>
          <span className="money-input">
            €<input id="shift-amount" type="number" min="1" step="1" inputMode="numeric" value={thousands} onChange={(e) => setThousands(e.target.value)} />K a week
          </span>
        </label>
        <span className="muted small">= {formatMoney(lump)} of transfer budget (a year's wages)</span>
        <button className="btn" type="submit" disabled={!(perWeek > 0)}>Move</button>
      </form>
    </>
  );
}
