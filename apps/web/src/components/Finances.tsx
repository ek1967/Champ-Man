import { facilityLevel, financesOf, formatMoney, type GameState, OWNER_POLICY, ownerOf, seasonIncome } from '@moc/engine';

/** Owner, cash in the bank, expected income and last year's accounts. */
export function ClubFinancesPanel({ game, clubId }: { game: GameState; clubId: string }) {
  const club = game.world.clubs[clubId];
  if (!club) return null;
  const f = financesOf(game, clubId);
  const policy = OWNER_POLICY[ownerOf(club)];
  const income = game.economy ? seasonIncome(game, clubId, facilityLevel(game, clubId, 'stadium')) : null;
  const a = f.accounts;
  return (
    <section className="finances">
      <h2>Finances</h2>
      <div className="facts">
        <div><span>Ownership</span>{policy.label}</div>
        <div><span>Cash in the bank</span>{formatMoney(f.cash ?? 0)}</div>
        {income && <div><span>Expected income this season</span>{formatMoney(income.total)}</div>}
        {income && <div><span>From TV and prize money</span>{formatMoney(income.tv + income.parachute)}{income.parachute > 0 ? ' (incl. parachute)' : ''}</div>}
      </div>
      <p className="small muted">{policy.description}</p>
      {a && (
        <div className="table-wrap">
          <table className="data accounts">
            <caption className="muted small">Accounts to June {a.year}</caption>
            <tbody>
              <tr><td>Income</td><td className="right">{formatMoney(a.income)}</td></tr>
              <tr><td>Wages</td><td className="right">{formatMoney(-a.wages)}</td></tr>
              <tr><td>Running costs</td><td className="right">{formatMoney(-a.costs)}</td></tr>
              {a.funding !== 0 && <tr><td>{a.funding > 0 ? 'Owner investment' : 'Debt repayments'}</td><td className="right">{formatMoney(a.funding)}</td></tr>}
              <tr><td>Transfer fees paid</td><td className="right">{formatMoney(-a.transfersSpent)}</td></tr>
              <tr><td>Transfer fees received</td><td className="right">{formatMoney(a.transfersReceived)}</td></tr>
              <tr className="strong"><td>Cash at the end of June</td><td className="right">{formatMoney(a.cash)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
