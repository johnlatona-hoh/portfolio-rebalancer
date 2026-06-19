import type { Trade } from "../api/client";
import { ACCOUNT_TYPE_LABELS } from "../utils/assetClass";
import { fmtMoney } from "../utils/money";

const ACTION_COLOR: Record<string, string> = {
  BUY: "text-good",
  SELL: "text-bad",
  HOLD: "text-muted",
};

/** Group trades by account, returning ordered account names. */
function groupByAccount(trades: Trade[]): { acct: string; acctType: string; rows: Trade[] }[] {
  const map = new Map<string, { acctType: string; rows: Trade[] }>();
  for (const t of trades) {
    if (!map.has(t.account_name)) {
      map.set(t.account_name, { acctType: t.account_type, rows: [] });
    }
    map.get(t.account_name)!.rows.push(t);
  }
  return Array.from(map.entries()).map(([acct, v]) => ({ acct, ...v }));
}

export default function TradeTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <p className="text-sm text-muted">
        No trades needed — your blended allocation already matches your targets.
      </p>
    );
  }

  const groups = groupByAccount(trades);

  return (
    <div className="space-y-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted border-b border-border">
            <th className="py-2 pr-3">Account</th>
            <th className="py-2 pr-3">Action</th>
            <th className="py-2 pr-3">Asset Class</th>
            <th className="py-2 pr-3">Ticker</th>
            <th className="py-2 pr-3 text-right">Amount</th>
            <th className="py-2 pr-3 text-right">Est. Gain</th>
            <th className="py-2">Tax note</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ acct, acctType, rows }) => (
            <>
              {/* account spacer */}
              <tr key={`hdr-${acct}`} className="bg-surface/50">
                <td colSpan={7} className="px-1 py-1.5 text-xs font-medium text-muted">
                  {acct}{" "}
                  <span className="font-normal opacity-60">
                    ({ACCOUNT_TYPE_LABELS[acctType as keyof typeof ACCOUNT_TYPE_LABELS]})
                  </span>
                </td>
              </tr>

              {rows.map((t, i) => (
                <tr key={`${acct}-${i}`} className="border-b border-border/30">
                  <td className="py-1.5 pr-3 text-muted text-xs">—</td>
                  <td className={`py-1.5 pr-3 font-medium ${ACTION_COLOR[t.action]}`}>{t.action}</td>
                  <td className="py-1.5 pr-3 text-sm">{t.asset_class}</td>
                  <td className="py-1.5 pr-3 font-mono text-sm">{t.ticker ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-right">{fmtMoney(t.amount)}</td>
                  <td className="py-1.5 pr-3 text-right text-xs">
                    {t.est_gain > 0 ? (
                      <span className="text-warn">+{fmtMoney(t.est_gain)}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="py-1.5 text-muted text-xs">{t.tax_note}</td>
                </tr>
              ))}

              {/* account subtotal */}
              <tr key={`sub-${acct}`} className="border-b border-border bg-surface/30">
                <td colSpan={4} className="py-1 pr-3 text-xs text-muted text-right">
                  Subtotal sells / buys
                </td>
                <td className="py-1 pr-3 text-right text-xs">
                  {fmtMoney(rows.filter((t) => t.action === "SELL").reduce((s, t) => s + t.amount, 0))}{" "}
                  /{" "}
                  {fmtMoney(rows.filter((t) => t.action === "BUY").reduce((s, t) => s + t.amount, 0))}
                </td>
                <td className="py-1 pr-3 text-right text-xs text-warn">
                  {rows.reduce((s, t) => s + t.est_gain, 0) > 0
                    ? "+" + fmtMoney(rows.reduce((s, t) => s + t.est_gain, 0))
                    : "—"}
                </td>
                <td />
              </tr>
            </>
          ))}
        </tbody>
      </table>

      <p className="text-xs text-muted mt-3 leading-relaxed">
        Trades are chosen to rebalance each account using its own proceeds (cash-neutral per
        account). Tax-inefficient assets are preferentially placed in tax-advantaged accounts.
        Use the Strategy slider above to limit realized gains.
      </p>
    </div>
  );
}
