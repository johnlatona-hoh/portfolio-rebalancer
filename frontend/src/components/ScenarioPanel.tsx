import { useState } from "react";
import {
  analyzePortfolio,
  projectPortfolio,
  type AnalyzeResponse,
  type Holding,
  type ProjectResponse,
  type AccountType,
} from "../api/client";
import AllocationBars from "./AllocationBars";
import ProjectionChart from "./ProjectionChart";
import { ACCOUNT_TYPE_LABELS } from "../utils/assetClass";
import { fmtMoney } from "../utils/money";

interface Props {
  baseHoldings: Holding[];
  targets: Record<string, number>;
  horizonMonths: number;
  current: AnalyzeResponse;
}

const BLANK: Holding = {
  account_name: "",
  account_type: "taxable",
  ticker: "",
  quantity: 0,
  cost_basis: 0,
  current_value: 0,
};

/**
 * Manual what-if: edit a copy of the holdings (change values, add hypotheticals) and
 * compare the resulting allocation + projection against the current portfolio.
 */
export default function ScenarioPanel({ baseHoldings, targets, horizonMonths, current }: Props) {
  const [holdings, setHoldings] = useState<Holding[]>(() =>
    baseHoldings.map((h) => ({ ...h }))
  );
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [projection, setProjection] = useState<ProjectResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const editValue = (i: number, value: number) =>
    setHoldings((hs) => hs.map((h, j) => (j === i ? { ...h, current_value: value } : h)));

  const editField = (i: number, patch: Partial<Holding>) =>
    setHoldings((hs) => hs.map((h, j) => (j === i ? { ...h, ...patch } : h)));

  const addRow = () => setHoldings((hs) => [...hs, { ...BLANK }]);
  const removeRow = (i: number) => setHoldings((hs) => hs.filter((_, j) => j !== i));

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const clean = holdings.filter((h) => h.ticker.trim() && h.current_value > 0);
      const res = await analyzePortfolio(clean, targets);
      setResult(res);
      const valueByClass = Object.fromEntries(res.blended.map((b) => [b.asset_class, b.value]));
      setProjection(await projectPortfolio(valueByClass, horizonMonths));
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Scenario analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">What-if Scenario</h3>
        <div className="flex gap-2">
          <button
            onClick={addRow}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-card"
          >
            + Add holding
          </button>
          <button
            onClick={run}
            disabled={busy}
            className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Running…" : "Run scenario"}
          </button>
        </div>
      </div>

      {/* editable holdings */}
      <div className="max-h-56 overflow-auto rounded border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="text-left text-muted">
              <th className="p-2">Account</th>
              <th className="p-2">Type</th>
              <th className="p-2">Ticker</th>
              <th className="p-2 text-right">Value</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h, i) => (
              <tr key={i} className="border-t border-border/50">
                <td className="p-1">
                  <input
                    value={h.account_name}
                    onChange={(e) => editField(i, { account_name: e.target.value })}
                    className="w-28 bg-surface border border-border rounded px-1 py-0.5"
                  />
                </td>
                <td className="p-1">
                  <select
                    value={h.account_type}
                    onChange={(e) => editField(i, { account_type: e.target.value as AccountType })}
                    className="bg-surface border border-border rounded px-1 py-0.5"
                  >
                    {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-1">
                  <input
                    value={h.ticker}
                    onChange={(e) => editField(i, { ticker: e.target.value.toUpperCase() })}
                    className="w-20 bg-surface border border-border rounded px-1 py-0.5 font-mono"
                  />
                </td>
                <td className="p-1 text-right">
                  <input
                    type="number"
                    value={h.current_value}
                    onChange={(e) => editValue(i, Number(e.target.value))}
                    className="w-24 bg-surface border border-border rounded px-1 py-0.5 text-right"
                  />
                </td>
                <td className="p-1">
                  <button onClick={() => removeRow(i)} className="text-bad px-1">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {err && <p className="text-sm text-bad">{err}</p>}

      {/* side-by-side comparison */}
      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-sm mb-2">
              Current — <span className="text-muted">{fmtMoney(current.total_value)}</span>
            </div>
            <AllocationBars blended={current.blended} />
          </div>
          <div>
            <div className="text-sm mb-2">
              Scenario — <span className="text-muted">{fmtMoney(result.total_value)}</span>
            </div>
            <AllocationBars blended={result.blended} />
            {projection && (
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wide text-muted mb-1">
                  Scenario projection
                </div>
                <ProjectionChart points={projection.points} height={160} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
