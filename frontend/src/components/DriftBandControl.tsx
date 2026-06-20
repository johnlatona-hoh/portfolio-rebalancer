interface Props {
  value: number;                 // current band % (0 = always rebalance)
  onChange: (pct: number) => void;
}

/** Rebalance band: classes within +/- this many percentage points of their target are
 * left alone (no trade). 0 = always rebalance to exact targets. */
export default function DriftBandControl({ value, onChange }: Props) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm">Rebalance band (drift tolerance)</label>
        <span className="text-sm font-medium">{value === 0 ? "Off" : `+/- ${value}%`}</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <p className="text-xs text-muted mt-1">
        Leave a class alone while it's within this many percentage points of its target -
        fewer, larger trades and less tax friction. Set to 0 to rebalance to exact targets.
      </p>
    </div>
  );
}
