import type { Trade } from "../api/client";
import { ACCOUNT_TYPE_LABELS } from "../utils/assetClass";
import { fmtMoney } from "../utils/money";

const ACTION_COLOR: Record<string, string> = {
  BUY: "text-good",
  SELL: "text-bad",
  HOLD: "text-muted",
};

export default function TradeTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <p className="text-sm text-muted">
        No trades needed — your blended allocation already matches your targets.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted border-b border-border">
          <th className="py-2 pr-3">Account</th>
          <th className="py-2 pr-3">Action</th>
          <th className="py-2 pr-3">Asset Class</th>
          <th className="py-2 pr-3">Ticker</th>
          <th className="py-2 pr-3 text-right">Amount</th>
          <th className="py-2">Tax note</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t, i) => (
          <tr key={i} className="border-b border-border/50">
            <td className="py-2 pr-3">
              {t.account_name}
              <span className="text-muted text-xs ml-1">
                ({ACCOUNT_TYPE_LABELS[t.account_type]})
              </span>
            </td>
            <td className={`py-2 pr-3 font-medium ${ACTION_COLOR[t.action]}`}>{t.action}</td>
            <td className="py-2 pr-3">{t.asset_class}</td>
            <td className="py-2 pr-3">{t.ticker ?? "—"}</td>
            <td className="py-2 pr-3 text-right">{fmtMoney(t.amount)}</td>
            <td className="py-2 text-muted text-xs">{t.tax_note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
