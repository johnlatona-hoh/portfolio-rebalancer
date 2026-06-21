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

/** Manual what-if: edit holdings, compare resulting allocation + projection. */
export default function ScenarioPanel({ baseHoldings, targets, horizonMonths, current }: Props) {
  const [holdings, setHoldings] = useState<Holding[]>(() =>
    baseHoldings.map((h) => ({ ...h }))
  );
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [projection, setProjection] = useState<ProjectResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const editField = (i: number, patch: Partial<Holding>) =>
    setHoldings((hs) => hs.map((h, j) => (j === i ? { ...h, ...patch } : h)));

  // When shares change, auto-derive value from shares × (price = value/quantity before edit)
  const editShares = (i: number, qty: number) => {
    const q = Number.isFinite(qty) ? qty : 0;
    setHoldings((hs) =>
      hs.map((h, j) => {
        if (j !== i) return h;
        const price = h.quantity > 0 ? h.current_value / h.quantity : 0;
        const value = price > 0 ? q * price : h.current_value;
        return { ...h, quantity: q, current_value: value };
      })
    );
  };

  const addRow = () => setHoldings((hs) => [...hs, { ...BLANK }]);
  const removeRow = (i: number) => setHoldings((hs) => hs.filter((_, j) => j !== i));

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      // Only send rows with a ticker and a finite, positive value (guards NaN/blank edits).
      const clean = holdings.filter(
        (h) => h.ticker.trim() && Number.isFinite(h.current_value) && h.current_value > 0
      );
      if (clean.length === 0) {
        setErr("Add at least one holding with a ticker and a positive value.");
        return;
      }
      const res = await analyzePortfolio(clean, targets);
      setResult(res);
      const valueByClass = Object.fromEntries(
        res.blended
          .filter((b) => Number.isFinite(b.value) && b.value > 0)
          .map((b) => [b.asset_class, b.value])
      );
      if (Object.keys(valueByClass).length === 0) {
        setErr("None of these holdings map to a known asset class — check the tickers.");
        return;
      }
      setProjection(await projectPortfolio(valueByClass, horizonMonths));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setErr(err?.response?.data?.detail ?? "Scenario analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  // Group holdings by account for spacer rows
  const accountOrder: string[] = [];
  const byAccount: Record<string, number[]> = {};
  holdings.forEach((h, i) => {
    if (!byAccount[h.account_name]) {
      byAccount[h.account_name] = [];
      accountOrder.push(h.account_name);
    }
    byAccount[h.account_name].push(i);
  });
  const totalValue = holdings.reduce((s, h) => s + h.current_value, 0);

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

      {/* editable holdings — tall scroll area */}
      <div className="max-h-[32rem] overflow-auto rounded border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="text-left text-muted border-b border-border">
              <th className="p-2">Account</th>
              <th className="p-2 w-28">Type</th>
              <th className="p-2 w-20">Ticker</th>
              <th className="p-2 text-right w-24">Shares</th>
              <th className="p-2 text-right w-24">Price</th>
              <th className="p-2 text-right w-28">Value</th>
              <th className="p-2 text-right w-20">% Acct</th>
              <th className="p-2 text-right w-20">% Total</th>
              <th className="p-2 w-6" />
            </tr>
          </thead>
          <tbody>
            {accountOrder.map((acctName) => {
              const indices = byAccount[acctName] ?? [];
              const acctTotal = indices.reduce((s, i) => s + holdings[i].current_value, 0);
              return (
                <>
                  {/* account spacer */}
                  <tr key={`hdr-${acctName}`} className="bg-surface/60">
                    <td colSpan={9} className="px-3 py-1 font-medium text-muted">
                      {acctName || "(unnamed)"}
                    </td>
                  </tr>

                  {indices.map((i) => {
                    const h = holdings[i];
                    const p = h.quantity > 0 ? h.current_value / h.quantity : null;
                    const acctPct = acctTotal > 0 ? (h.current_value / acctTotal) * 100 : 0;
                    const totPct = totalValue > 0 ? (h.current_value / totalValue) * 100 : 0;
                    return (
                      <tr key={i} className="border-t border-border/40">
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
                            onChange={(e) =>
                              editField(i, { account_type: e.target.value as AccountType })
                            }
                            className="bg-surface border border-border rounded px-1 py-0.5 text-xs w-full"
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
                            onChange={(e) =>
                              editField(i, { ticker: e.target.value.toUpperCase() })
                            }
                            className="w-16 bg-surface border border-border rounded px-1 py-0.5 font-mono"
                          />
                        </td>
                        <td className="p-1 text-right">
                          <input
                            type="number"
                            min={0}
                            value={h.quantity || ""}
                            onChange={(e) => editShares(i, Number(e.target.value))}
                            className="w-20 bg-surface border border-border rounded px-1 py-0.5 text-right"
                          />
                        </td>
                        <td className="p-1 text-right text-muted">
                          {p != null ? `$${p.toFixed(2)}` : "—"}
                        </td>
                        <td className="p-1 text-right">
                          <span className="inline-flex items-center gap-0.5">
                            <span className="text-muted text-xs">$</span>
                            <input
                              type="number"
                              min={0}
                              value={h.current_value ? Math.round(h.current_value) : ""}
                              onChange={(e) => editField(i, { current_value: Math.round(Number(e.target.value) || 0) })}
                              className="w-20 bg-surface border border-border rounded px-1 py-0.5 text-right"
                            />
                          </span>
                        </td>
                        <td className="p-1 text-right text-muted">{acctPct.toFixed(1)}%</td>
                        <td className="p-1 text-right text-muted">{totPct.toFixed(1)}%</td>
                        <td className="p-1">
                          <button onClick={() => removeRow(i)} className="text-bad px-1">
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {/* account subtotal */}
                  <tr key={`sub-${acctName}`} className="border-t border-border/60 bg-surface/30">
                    <td colSpan={5} className="p-1 text-right text-muted pr-2">Subtotal</td>
                    <td className="p-1 text-right font-medium">{fmtMoney(acctTotal)}</td>
                    <td colSpan={3} />
                  </tr>
                </>
              );
            })}
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
