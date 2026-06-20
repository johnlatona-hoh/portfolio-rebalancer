import { useState } from "react";
import type { ClassAllocation, Holding, TickerTag } from "../api/client";
import { CLASS_COLORS } from "../utils/assetClass";
import { fmtMoney, fmtPct } from "../utils/money";
import HoldingsDetail from "./HoldingsDetail";

interface Props {
  blended: ClassAllocation[];
  title?: string;
  // Optional: when provided, rows are clickable and expand to show holdings inline.
  holdings?: Holding[];
  tags?: Record<string, TickerTag>;
  totalPortfolioValue?: number;
}

/** Current-vs-target allocation bars. When holdings + tags are provided each row is
 *  clickable and unfolds an inline breakdown of the holdings in that class. */
export default function AllocationBars({ blended, title, holdings, tags, totalPortfolioValue }: Props) {
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const clickable = !!(holdings && tags && totalPortfolioValue);
  const max = Math.max(1, ...blended.map((b) => Math.max(b.pct, b.target_pct)));

  function toggle(cls: string) {
    setExpandedClass((prev) => (prev === cls ? null : cls));
  }

  return (
    <div>
      {title && <div className="text-xs uppercase tracking-wide text-muted mb-2">{title}</div>}
      <div className="space-y-3">
        {blended.map((b) => {
          const isExpanded = expandedClass === b.asset_class;
          return (
            <div key={b.asset_class}>
              {/* bar row */}
              <div
                onClick={() => clickable && toggle(b.asset_class)}
                className={clickable ? "cursor-pointer hover:opacity-80 rounded" : ""}
              >
                <div className="flex justify-between text-sm mb-1">
                  <span className="flex items-center gap-1">
                    {b.group && b.group !== b.asset_class && (
                      <span className="text-muted">{b.group} · </span>
                    )}
                    {b.asset_class}
                    {clickable && (
                      <span className="text-muted text-xs opacity-60 ml-0.5">
                        {isExpanded ? "▾" : "▸"}
                      </span>
                    )}
                  </span>
                  <span className="text-muted">
                    {fmtPct(b.pct)}{" "}
                    <span className="opacity-60">/ tgt {fmtPct(b.target_pct)}</span>
                  </span>
                </div>
                <div className="relative h-3 bg-surface rounded">
                  <div
                    className="absolute top-0 left-0 h-3 rounded"
                    style={{
                      width: `${(b.pct / max) * 100}%`,
                      background: CLASS_COLORS[b.asset_class] ?? "#6b8cba",
                    }}
                  />
                  <div
                    className="absolute top-[-2px] h-[18px] w-0.5 bg-gray-100"
                    style={{ left: `${(b.target_pct / max) * 100}%` }}
                    title={`Target ${fmtPct(b.target_pct)}`}
                  />
                </div>
                {Math.abs(b.delta_value) >= 1 && (
                  <div className="flex items-center gap-3 text-xs mt-0.5">
                    <span className={b.delta_value > 0 ? "text-good" : "text-bad"}>
                      {b.delta_value > 0 ? "Buy " : "Sell "}
                      {fmtMoney(Math.abs(b.delta_value))}
                    </span>
                    {Math.abs(b.drift_pct) > 0.05 && (
                      <span className="text-muted opacity-70">
                        residual drift: {b.drift_pct > 0 ? "+" : ""}
                        {fmtPct(b.drift_pct)}
                      </span>
                    )}
                  </div>
                )}
                {b.within_band && (
                  <div className="text-xs mt-0.5 text-good opacity-80">
                    on target (within band)
                  </div>
                )}
              </div>

              {/* inline holdings accordion */}
              {isExpanded && holdings && tags && totalPortfolioValue && (
                <HoldingsDetail
                  assetClass={b.asset_class}
                  holdings={holdings}
                  tags={tags}
                  totalPortfolioValue={totalPortfolioValue}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
