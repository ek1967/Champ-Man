export function money(amount: number): string {
  if (amount >= 1_000_000) return `€${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}M`;
  if (amount >= 1_000) return `€${Math.round(amount / 1_000)}K`;
  return `€${amount}`;
}

export function wage(amount: number): string {
  return `${money(amount)}/wk`;
}

export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Club reputation as a plain-language size. */
export function reputationLabel(reputation: number): string {
  if (reputation >= 85) return 'Giant';
  if (reputation >= 70) return 'Big club';
  if (reputation >= 55) return 'Established';
  if (reputation >= 40) return 'Modest';
  return 'Small club';
}
