import NumberField from "./NumberField";

interface Props {
  realDollars: boolean;
  onToggle: (real: boolean) => void;
  inflationPct: number;
  onInflationChange: (pct: number) => void;
}

/** Toggle between today's dollars (real) and future dollars (nominal), with an editable
 *  inflation rate. Both settings apply to the projection chart instantly client-side. */
export default function InflationControls({
  realDollars,
  onToggle,
  inflationPct,
  onInflationChange,
}: Props) {
  return (
    <div className="flex items-center gap-3 text-sm flex-wrap">
      {/* segmented toggle */}
      <div className="flex rounded border border-border overflow-hidden text-xs">
        <button
          onClick={() => onToggle(true)}
          className={`px-3 py-1 ${realDollars ? "bg-accent text-fg" : "text-muted hover:bg-card"}`}
        >
          Today's $
        </button>
        <button
          onClick={() => onToggle(false)}
          className={`px-3 py-1 ${!realDollars ? "bg-accent text-fg" : "text-muted hover:bg-card"}`}
        >
          Future $
        </button>
      </div>

      {/* inflation rate — only meaningful when real view is active */}
      {realDollars && (
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Inflation
          <NumberField
            min={0}
            max={20}
            step={0.1}
            value={inflationPct}
            onChange={onInflationChange}
            className="w-14 bg-surface border border-border rounded px-1.5 py-0.5 text-right text-fg"
          />
          %/yr
        </label>
      )}
    </div>
  );
}
