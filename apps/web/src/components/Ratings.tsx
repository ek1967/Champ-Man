/** Five-star scale with half stars; the filled layer is clipped to the value. */
export function Stars({ value, label = 'Ability', small = false }: { value: number; label?: string; small?: boolean }) {
  return (
    <span className={`stars ${small ? 'small' : ''}`} role="img" aria-label={`${label}: ${value} out of 5 stars`} title={`${label}: ${value} / 5`}>
      <span className="stars-base" aria-hidden="true">★★★★★</span>
      <span className="stars-fill" aria-hidden="true" style={{ width: `${(value / 5) * 100}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

export function conditionTone(value: number): 'good' | 'ok' | 'poor' {
  return value >= 90 ? 'good' : value >= 75 ? 'ok' : 'poor';
}

/** Match fitness as a bar with the percentage beside it. */
export function ConditionBar({ value, compact = false }: { value: number; compact?: boolean }) {
  const tone = conditionTone(value);
  return (
    <span className={`cond-bar ${tone} ${compact ? 'compact' : ''}`} title={`Fitness ${value}%`}>
      <span className="cond-track" aria-hidden="true">
        <span className="cond-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
      {!compact && <span className="cond-value">{value}%</span>}
    </span>
  );
}

export function ratingTone(rating: number): 'good' | 'ok' | 'poor' {
  return rating >= 7.3 ? 'good' : rating >= 6.4 ? 'ok' : 'poor';
}

/** Last five match ratings, oldest first, as small coloured chips. */
export function FormChips({ form }: { form: readonly number[] }) {
  if (form.length === 0) return <span className="muted">–</span>;
  return (
    <span className="form-chips" title={`Last ${form.length}: ${form.map((r) => r.toFixed(1)).join(', ')}`}>
      {form.map((r, i) => (
        <span key={i} className={`form-chip ${ratingTone(r)}`}>
          {r.toFixed(1)}
        </span>
      ))}
    </span>
  );
}
