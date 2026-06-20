import type { HarvestLot } from "../api/client";
import { fmtMoney } from "../utils/money";

/**
 * Lists taxable holdings sitting at an unrealized loss - candidates for tax-loss
 * harvesting. Renders nothing when there are no candidates. Informational only:
 * selling to harvest a loss has wash-sale rules the user must respect.
 */
export default function TaxLossPanel({ lots }: { lots: HarvestLot[] }) {
  if (!lots || lots.length === 0) return null;

  const totalLoss = lots.reduce((s, l) => s + l.unrealized_loss, 0);

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-semibold">Tax-Loss Harvesting Opportunities</h3>
        <span className="text-sm" style={{ color: "#e06c75" }}>
          {fmtMoney(totalLoss)} total unrealized loss
        </span>
      </div>
      <p className="text-xs text-muted mb-3">
        Taxable holdings currently below their cost basis. Selling can realize a loss to offset
        gains or income. Watch the <strong>wash-sale rule</strong>: avoid rebuying the same or a
        substantially identical fund within 30 days before or after the sale.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted border-b border-border">
              <th className="py-1.5 px-2">Ticker</th>
              <th className="py-1.5 px-2">Account</th>
              <th className="py-1.5 px-2">Class</th>
              <th className="py-1.5 px-2 text-right">Value</th>
              <th className="py-1.5 px-2 text-right">Cost Basis</th>
              <th className="py-1.5 px-2 text-right">Unrealized Loss</th>
              <th className="py-1.5 px-2 text-right">Loss %</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l, i) => (
              <tr key={`${l.account_name}-${l.ticker}-${i}`} className="border-b border-border/40">
                <td className="py-1.5 px-2 font-mono">{l.ticker}</td>
                <td className="py-1.5 px-2">{l.account_name}</td>
                <td className="py-1.5 px-2 text-muted">{l.asset_class ?? "-"}</td>
                <td className="py-1.5 px-2 text-right">{fmtMoney(l.current_value)}</td>
                <td className="py-1.5 px-2 text-right">{fmtMoney(l.cost_basis)}</td>
                <td className="py-1.5 px-2 text-right" style={{ color: "#e06c75" }}>
                  {fmtMoney(l.unrealized_loss)}
                </td>
                <td className="py-1.5 px-2 text-right" style={{ color: "#e06c75" }}>
                  {l.loss_pct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
