import { useState } from "react";
import type { ClassAllocation } from "../api/client";
import { RETURN_ASSUMPTIONS } from "../utils/assetClass";
import { fmtPct } from "../utils/money";

interface Props {
  blended: ClassAllocation[];
}

/** Expandable panel showing the return/volatility assumptions used in the projection,
 *  weighted by the portfolio's current allocation. */
export default function ReturnAssumptions({ blended }: Props) {
  const [open, setOpen] = useState(false);

  // Only show classes that are actually held.
  const held = blended.filter((b) => b.value > 0 && RETURN_ASSUMPTIONS[b.asset_class]);
  const totalPct = held.reduce((s, b) => s + b.pct, 0);

  // Blended expected return (value-weighted).
  const blendedReturn =
    totalPct > 0
      ? held.reduce((s, b) => {
          const a = RETURN_ASSUMPTIONS[b.asset_class];
          return s + (b.pct / totalPct) * a.mean;
        }, 0)
      : 0;

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-muted hover:text-fg flex items-center gap-1"
      >
        <span>{open ? "▾" : "▸"}</span>
        {open ? "Hide" : "Show"} return assumptions
      </button>

      {open && (
        <div className="mt-2 rounded border border-border bg-surface/50 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted border-b border-border">
                <th className="px-3 py-1.5">Asset class</th>
                <th className="px-3 py-1.5 text-right">Weight</th>
                <th className="px-3 py-1.5 text-right">Exp. return / yr</th>
                <th className="px-3 py-1.5 text-right">Volatility (σ)</th>
              </tr>
            </thead>
            <tbody>
              {held.map((b) => {
                const a = RETURN_ASSUMPTIONS[b.asset_class];
                return (
                  <tr key={b.asset_class} className="border-t border-border/40">
                    <td className="px-3 py-1">{b.asset_class}</td>
                    <td className="px-3 py-1 text-right text-muted">{fmtPct(b.pct)}</td>
                    <td className="px-3 py-1 text-right text-good">{fmtPct(a.mean * 100)}</td>
                    <td className="px-3 py-1 text-right text-muted">{fmtPct(a.stdev * 100)}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-border font-medium bg-surface/80">
                <td className="px-3 py-1.5">Blended (weighted avg)</td>
                <td className="px-3 py-1.5 text-right text-muted">{fmtPct(totalPct)}</td>
                <td className="px-3 py-1.5 text-right text-good">{fmtPct(blendedReturn * 100)}</td>
                <td className="px-3 py-1.5 text-right text-muted">—</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-muted px-3 py-2 border-t border-border/40">
            These are long-run historical estimates used for illustrative projections only —
            not predictions. Actual returns will differ.
          </p>
        </div>
      )}
    </div>
  );
}
