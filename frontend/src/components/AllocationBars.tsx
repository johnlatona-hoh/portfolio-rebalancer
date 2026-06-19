import type { ClassAllocation } from "../api/client";
import { CLASS_COLORS } from "../utils/assetClass";
import { fmtMoney, fmtPct } from "../utils/money";

interface Props {
  blended: ClassAllocation[];
  title?: string;
  onSelectClass?: (cls: string) => void; // optional click to drill-down
}

/** Current-vs-target allocation bars, one row per asset class. Optionally clickable. */
export default function AllocationBars({ blended, title, onSelectClass }: Props) {
  const max = Math.max(1, ...blended.map((b) => Math.max(b.pct, b.target_pct)));

  return (
    <div>
      {title && <div className="text-xs uppercase tracking-wide text-muted mb-2">{title}</div>}
      <div className="space-y-3">
        {blended.map((b) => {
          const clickable = !!onSelectClass;
          return (
            <div
              key={b.asset_class}
              onClick={() => onSelectClass?.(b.asset_class)}
              className={clickable ? "cursor-pointer hover:opacity-80 rounded" : ""}
              title={clickable ? `Click to view ${b.asset_class} holdings` : undefined}
            >
              <div className="flex justify-between text-sm mb-1">
                <span>
                  {b.group && b.group !== b.asset_class && (
                    <span className="text-muted">{b.group} · </span>
                  )}
                  {b.asset_class}
                  {clickable && <span className="text-muted text-xs ml-1 opacity-60">↗</span>}
                </span>
                <span className="text-muted">
                  {fmtPct(b.pct)}{" "}
                  <span className="opacity-60">/ tgt {fmtPct(b.target_pct)}</span>
                </span>
              </div>
              <div className="relative h-3 bg-surface rounded">
                {/* current */}
                <div
                  className="absolute top-0 left-0 h-3 rounded"
                  style={{
                    width: `${(b.pct / max) * 100}%`,
                    background: CLASS_COLORS[b.asset_class] ?? "#6b8cba",
                  }}
                />
                {/* target marker */}
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
                  {/* show post-plan drift if the slider is active (drift_pct != 0) */}
                  {Math.abs(b.drift_pct) > 0.05 && (
                    <span className="text-muted opacity-70">
                      residual drift: {b.drift_pct > 0 ? "+" : ""}
                      {fmtPct(b.drift_pct)}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
