import { useEffect, useRef, useState } from "react";
import NumberField from "./NumberField";

export type Benchmark = Record<string, number> | null;

/** Preset benchmark allocations as class-weight percentages. */
export const BENCHMARK_PRESETS: Record<string, Record<string, number>> = {
  "60/40": { "US Stock": 36, International: 24, "Taxable Bond": 40 },
  "100% Global Equity": { "US Stock": 60, International: 40 },
  "100% US (S&P-like)": { "US Stock": 100 },
};

interface Props {
  value: Benchmark;
  onChange: (b: Benchmark) => void;
}

/** Lets the user pick a benchmark to overlay on the projection: a preset, none, or a
 * custom stock/bond split (stock is split 60/40 US/International; bond -> Taxable Bond).
 * Custom edits are debounced so each keystroke doesn't fire a backend projection. */
export default function BenchmarkControl({ onChange }: Props) {
  const [mode, setMode] = useState<string>("None");
  const [stock, setStock] = useState(70);
  const [bond, setBond] = useState(30);

  // Keep the latest onChange without making it a dependency of the debounce effect.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (mode === "None") {
      onChangeRef.current(null);
      return;
    }
    if (mode !== "Custom") {
      onChangeRef.current(BENCHMARK_PRESETS[mode]);
      return;
    }
    // Custom: debounce, and treat an empty/zero split as "no benchmark".
    const id = setTimeout(() => {
      const total = stock + bond;
      if (total <= 0) {
        onChangeRef.current(null);
        return;
      }
      const sn = (stock / total) * 100;
      const bn = (bond / total) * 100;
      onChangeRef.current({
        "US Stock": sn * 0.6,
        International: sn * 0.4,
        "Taxable Bond": bn,
      });
    }, 500);
    return () => clearTimeout(id);
  }, [mode, stock, bond]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>Benchmark</span>
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        className="bg-surface border border-border rounded px-2 py-1 text-fg"
      >
        <option value="None">None</option>
        {Object.keys(BENCHMARK_PRESETS).map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
        <option value="Custom">Custom</option>
      </select>
      {mode === "Custom" && (
        <span
          className="flex items-center gap-1"
          title="Stock is split 60/40 US/International; bond maps to Taxable Bond."
        >
          <NumberField
            min={0}
            step={1}
            value={stock}
            onChange={setStock}
            className="w-14 bg-surface border border-border rounded px-2 py-1 text-fg"
          />
          <span>% stock /</span>
          <NumberField
            min={0}
            step={1}
            value={bond}
            onChange={setBond}
            className="w-14 bg-surface border border-border rounded px-2 py-1 text-fg"
          />
          <span>% bond</span>
        </span>
      )}
    </div>
  );
}
