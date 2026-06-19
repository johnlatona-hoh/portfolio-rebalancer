import type { Holding, TickerTag } from "../api/client";
import { ACCOUNT_TYPE_LABELS } from "../utils/assetClass";
import { fmtMoney, fmtPct } from "../utils/money";

interface Props {
  assetClass: string;
  holdings: Holding[];
  tags: Record<string, TickerTag>;
  totalPortfolioValue: number;
}

/** Inline (accordion-style) holdings breakdown for one asset class.
 *  Rendered directly beneath the allocation bar row — no modal overlay. */
export default function HoldingsDetail({ assetClass, holdings, tags, totalPortfolioValue }: Props) {
  const matching = holdings.filter((h) => tags[h.ticker]?.asset_class === assetClass);

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

  if (matching.length === 0) {
    return (
      <div className="mt-2 ml-4 text-xs text-muted italic">
        No tagged holdings in this class.
      </div>
    );
  }

  return (
    <div className="mt-2 ml-2 rounded border border-border bg-surface/30 overflow-auto">
      <div className="px-3 py-1.5 text-xs text-muted border-b border-border/50 flex justify-between">
        <span>{matching.length} holding{matching.length !== 1 ? "s" : ""}</span>
        <span className="font-medium text-fg">{fmtMoney(subTotal)}</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted border-b border-border/50">
            <th className="px-3 py-1">Account</th>
            <th className="px-2 py-1">Ticker</th>
            <th className="px-2 py-1 text-right">Shares</th>
            <th className="px-2 py-1 text-right">Price</th>
            <th className="px-2 py-1 text-right">Value</th>
            <th className="px-2 py-1 text-right">% Acct</th>
            <th className="px-2 py-1 text-right">% Total</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(byAccount).map(([acctName, rows]) => {
            const acctTotal = accountTotals[acctName] ?? 0;
            const acctType = rows[0].account_type;
            return (
              <>
                <tr key={`hdr-${acctName}`} className="bg-surface/60">
                  <td colSpan={7} className="px-3 py-1 font-medium text-muted">
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
                      <td className="py-1 px-3 text-muted">—</td>
                      <td className="py-1 px-2 font-mono">{h.ticker}</td>
                      <td className="py-1 px-2 text-right">{h.quantity.toLocaleString()}</td>
                      <td className="py-1 px-2 text-right">{p != null ? fmtMoney(p) : "—"}</td>
                      <td className="py-1 px-2 text-right">{fmtMoney(h.current_value)}</td>
                      <td className="py-1 px-2 text-right text-muted">{fmtPct(acctPct)}</td>
                      <td className="py-1 px-2 text-right text-muted">{fmtPct(totPct)}</td>
                    </tr>
                  );
                })}
                <tr key={`sub-${acctName}`} className="border-t border-border/60 bg-surface/50 font-medium">
                  <td colSpan={4} className="px-3 py-1 text-muted text-right text-xs">Subtotal</td>
                  <td className="px-2 py-1 text-right">{fmtMoney(acctTotal)}</td>
                  <td colSpan={2} />
                </tr>
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
