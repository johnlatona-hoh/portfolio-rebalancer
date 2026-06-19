import type { Holding, TickerTag } from "../api/client";
import { ACCOUNT_TYPE_LABELS } from "../utils/assetClass";
import { fmtMoney, fmtPct } from "../utils/money";

interface Props {
  assetClass: string;
  holdings: Holding[];
  tags: Record<string, TickerTag>;
  totalPortfolioValue: number;
  onClose: () => void;
}

/** Drill-down panel showing all holdings for a selected asset class. */
export default function HoldingsDetail({ assetClass, holdings, tags, totalPortfolioValue, onClose }: Props) {
  // Filter to holdings in this class
  const matching = holdings.filter((h) => tags[h.ticker]?.asset_class === assetClass);

  // Group by account
  const byAccount: Record<string, Holding[]> = {};
  for (const h of matching) {
    (byAccount[h.account_name] = byAccount[h.account_name] ?? []).push(h);
  }

  const accountTotals = Object.fromEntries(
    matching
      .reduce((acc, h) => {
        acc.set(h.account_name, (acc.get(h.account_name) ?? 0) + h.current_value);
        return acc;
      }, new Map<string, number>())
      .entries()
  );

  const subTotal = matching.reduce((s, h) => s + h.current_value, 0);

  function price(h: Holding) {
    return h.quantity > 0 ? h.current_value / h.quantity : null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <div className="font-semibold">{assetClass}</div>
            <div className="text-xs text-muted">
              {fmtMoney(subTotal)} · {fmtPct((subTotal / totalPortfolioValue) * 100)} of portfolio
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-fg text-xl leading-none px-1">
            ✕
          </button>
        </div>

        {/* table */}
        <div className="overflow-auto flex-1 px-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-muted border-b border-border">
                <th className="py-2 px-3">Account</th>
                <th className="py-2 px-2">Ticker</th>
                <th className="py-2 px-2 text-right">Shares</th>
                <th className="py-2 px-2 text-right">Price</th>
                <th className="py-2 px-2 text-right">Value</th>
                <th className="py-2 px-2 text-right">% Acct</th>
                <th className="py-2 px-2 text-right">% Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byAccount).map(([acctName, rows]) => {
                const acctTotal = accountTotals[acctName] ?? 0;
                const acctType = rows[0].account_type;
                return (
                  <>
                    {/* account spacer row */}
                    <tr key={`hdr-${acctName}`} className="bg-surface/50">
                      <td colSpan={7} className="px-3 py-1 text-muted font-medium">
                        {acctName}{" "}
                        <span className="font-normal opacity-60">
                          ({ACCOUNT_TYPE_LABELS[acctType]})
                        </span>
                      </td>
                    </tr>
                    {rows.map((h, i) => {
                      const p = price(h);
                      const acctPct = acctTotal > 0 ? (h.current_value / acctTotal) * 100 : 0;
                      const totPct = totalPortfolioValue > 0 ? (h.current_value / totalPortfolioValue) * 100 : 0;
                      return (
                        <tr key={`${acctName}-${i}`} className="border-t border-border/30">
                          <td className="py-1.5 px-3 text-muted">—</td>
                          <td className="py-1.5 px-2 font-mono">{h.ticker}</td>
                          <td className="py-1.5 px-2 text-right">{h.quantity.toLocaleString()}</td>
                          <td className="py-1.5 px-2 text-right">
                            {p != null ? fmtMoney(p) : "—"}
                          </td>
                          <td className="py-1.5 px-2 text-right">{fmtMoney(h.current_value)}</td>
                          <td className="py-1.5 px-2 text-right text-muted">{fmtPct(acctPct)}</td>
                          <td className="py-1.5 px-2 text-right text-muted">{fmtPct(totPct)}</td>
                        </tr>
                      );
                    })}
                    {/* account subtotal */}
                    <tr key={`sub-${acctName}`} className="border-t border-border/60 bg-surface/30 font-medium">
                      <td colSpan={4} className="px-3 py-1 text-muted text-right">Subtotal</td>
                      <td className="px-2 py-1 text-right">{fmtMoney(acctTotal)}</td>
                      <td colSpan={2} />
                    </tr>
                  </>
                );
              })}
            </tbody>
          </table>
          {matching.length === 0 && (
            <p className="text-muted text-sm p-4 text-center">No holdings in this class.</p>
          )}
        </div>
      </div>
    </div>
  );
}
