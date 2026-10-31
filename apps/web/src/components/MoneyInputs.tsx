import { type ContractOffer, formatMoney } from '@moc/engine';
import { useState } from 'react';

/** Fee in millions of euros, with quick picks. */
export function BidForm(props: { idPrefix: string; suggested: number; quick?: Array<{ label: string; amount: number }>; onSubmit: (fee: number) => void; submitLabel?: string }) {
  const [millions, setMillions] = useState((props.suggested / 1_000_000).toFixed(1));
  const fee = Math.round(Number(millions) * 1_000_000);
  return (
    <form
      className="money-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (fee > 0) props.onSubmit(fee);
      }}
    >
      <label className="money-field" htmlFor={`${props.idPrefix}-fee`}>
        <span>Fee</span>
        <span className="money-input">
          €<input id={`${props.idPrefix}-fee`} type="number" min="0.1" step="0.1" inputMode="decimal" value={millions} onChange={(e) => setMillions(e.target.value)} />M
        </span>
      </label>
      {props.quick && (
        <span className="quick-picks">
          {props.quick.map((q) => (
            <button key={q.label} type="button" className="btn small ghost" onClick={() => setMillions((q.amount / 1_000_000).toFixed(1))}>
              {q.label} ({formatMoney(q.amount)})
            </button>
          ))}
        </span>
      )}
      <button className="btn primary" type="submit" disabled={!(fee > 0)}>
        {props.submitLabel ?? 'Make offer'}
      </button>
    </form>
  );
}

/** Weekly wage in thousands of euros and contract length. */
export function ContractForm(props: { idPrefix: string; demand: number; maxYears?: number; onSubmit: (offer: ContractOffer) => void; submitLabel?: string }) {
  const [thousands, setThousands] = useState(String(Math.round(props.demand / 1000)));
  const [years, setYears] = useState(3);
  const wage = Math.round(Number(thousands) * 1000);
  return (
    <form
      className="money-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (wage > 0) props.onSubmit({ wage, years });
      }}
    >
      <label className="money-field" htmlFor={`${props.idPrefix}-wage`}>
        <span>Wage</span>
        <span className="money-input">
          €<input id={`${props.idPrefix}-wage`} type="number" min="1" step="1" inputMode="numeric" value={thousands} onChange={(e) => setThousands(e.target.value)} />K a week
        </span>
      </label>
      <label className="money-field" htmlFor={`${props.idPrefix}-years`}>
        <span>Length</span>
        <select id={`${props.idPrefix}-years`} value={years} onChange={(e) => setYears(Number(e.target.value))}>
          {Array.from({ length: props.maxYears ?? 5 }, (_, i) => i + 1).map((y) => (
            <option key={y} value={y}>
              {y} year{y > 1 ? 's' : ''}
            </option>
          ))}
        </select>
      </label>
      <span className="muted small">Asking for about {formatMoney(props.demand)} a week</span>
      <button className="btn primary" type="submit" disabled={!(wage > 0)}>
        {props.submitLabel ?? 'Offer contract'}
      </button>
    </form>
  );
}
