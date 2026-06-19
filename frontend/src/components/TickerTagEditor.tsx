import { useState } from "react";
import { upsertTag, suggestTag, type TaxEfficiency } from "../api/client";
import { ASSET_CLASSES } from "../utils/assetClass";

const TAX_EFFS: TaxEfficiency[] = ["efficient", "inefficient", "neutral"];

interface Props {
  tickers: string[];
  onAllResolved: () => void;
}

/** Lets the user classify unknown tickers (asset class + tax efficiency) so the engine
 * can treat them. Persists each via POST /tags. Offers a Gemini "Suggest" shortcut. */
export default function TickerTagEditor({ tickers, onAllResolved }: Props) {
  const [drafts, setDrafts] = useState<
    Record<string, { asset_class: string; tax_efficiency: TaxEfficiency; name: string; expense_ratio: string }>
  >(() =>
    Object.fromEntries(
      tickers.map((t) => [t, { asset_class: "US Stock", tax_efficiency: "efficient", name: "", expense_ratio: "" }])
    )
  );
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const update = (ticker: string, patch: Partial<(typeof drafts)[string]>) =>
    setDrafts((d) => ({ ...d, [ticker]: { ...d[ticker], ...patch } }));

  async function suggest(ticker: string) {
    setBusy(ticker);
    try {
      const { suggestion } = await suggestTag(ticker);
      if (suggestion) {
        update(ticker, {
          asset_class: suggestion.asset_class,
          tax_efficiency: suggestion.tax_efficiency,
          name: suggestion.name ?? "",
          ...(suggestion.expense_ratio != null
            ? { expense_ratio: (suggestion.expense_ratio * 100).toString() }
            : {}),
        });
      } else {
        alert(`No suggestion available for ${ticker} (AI off or ticker not recognized).`);
      }
    } finally {
      setBusy(null);
    }
  }

  async function save(ticker: string) {
    setBusy(ticker);
    try {
      const d = drafts[ticker];
      // Fee field is entered as a percent (e.g. "0.03" = 0.03%); store as a decimal.
      const feeStr = d.expense_ratio.trim();
      const expense_ratio = feeStr === "" ? null : parseFloat(feeStr) / 100;
      await upsertTag({
        ticker,
        asset_class: d.asset_class,
        tax_efficiency: d.tax_efficiency,
        name: d.name,
        expense_ratio: Number.isNaN(expense_ratio as number) ? null : expense_ratio,
      });
      const next = new Set(resolved).add(ticker);
      setResolved(next);
      if (next.size === tickers.length) onAllResolved();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        These tickers aren't classified yet. Set each one's asset class and tax profile so the
        rebalancer knows how to treat it.
      </p>
      {tickers.map((t) => {
        const d = drafts[t];
        const done = resolved.has(t);
        return (
          <div
            key={t}
            className={`flex flex-wrap items-center gap-2 p-2 rounded border border-border ${
              done ? "opacity-50" : ""
            }`}
          >
            <span className="font-mono font-medium w-16">{t}</span>
            <select
              value={d.asset_class}
              disabled={done}
              onChange={(e) => update(t, { asset_class: e.target.value })}
              className="bg-surface border border-border rounded px-2 py-1 text-sm"
            >
              {ASSET_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={d.tax_efficiency}
              disabled={done}
              onChange={(e) => update(t, { tax_efficiency: e.target.value as TaxEfficiency })}
              className="bg-surface border border-border rounded px-2 py-1 text-sm"
            >
              {TAX_EFFS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <span className="flex items-center gap-1">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="fee"
                value={d.expense_ratio}
                disabled={done}
                onChange={(e) => update(t, { expense_ratio: e.target.value })}
                className="w-16 bg-surface border border-border rounded px-2 py-1 text-sm"
                title="Annual expense ratio as a percent, e.g. 0.03 for 0.03%. Leave blank to use a class default. Set 0 for individual stocks."
              />
              <span className="text-muted text-xs">% fee</span>
            </span>
            <button
              disabled={done || busy === t}
              onClick={() => suggest(t)}
              className="text-xs px-2 py-1 rounded border border-border hover:bg-card disabled:opacity-50"
            >
              Suggest (AI)
            </button>
            <button
              disabled={done || busy === t}
              onClick={() => save(t)}
              className="text-xs px-2 py-1 rounded bg-accent hover:bg-accent-hover disabled:opacity-50"
            >
              {done ? "Saved" : "Save"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
