import type { ClassAllocation } from "../api/client";
import { CLASS_COLORS } from "../utils/assetClass";
import { fmtMoney, fmtPct } from "../utils/money";

interface Props {
  blended: ClassAllocation[];
  title?: string;
}

/** Current-vs-target allocation bars, one row per asset class. */
export default function AllocationBars({ blended, title }: Props) {
  const max = Math.max(1, ...blended.map((b) => Math.max(b.pct, b.target_pct)));

  return (
    <div>
      {title && <div className="text-xs uppercase tracking-wide text-muted mb-2">{title}</div>}
      <div className="space-y-3">
        {blended.map((b) => (
          <div key={b.asset_class}>
            <div className="flex justify-between text-sm mb-1">
              <span>
                {b.group && b.group !== b.asset_class && (
                  <span className="text-muted">{b.group} · </span>
                )}
                {b.asset_class}
              </span>
              <span className="text-muted">
                {fmtPct(b.pct)} <span className="opacity-60">/ tgt {fmtPct(b.target_pct)}</span>
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
              <div
                className={`text-xs mt-0.5 ${b.delta_value > 0 ? "text-good" : "text-bad"}`}
              >
                {b.delta_value > 0 ? "Buy " : "Sell "}
                {fmtMoney(Math.abs(b.delta_value))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
