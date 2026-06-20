import { useState } from "react";

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
 * custom stock/bond split (stock is split 60/40 US/International; bond -> Taxable Bond). */
export default function BenchmarkControl({ value, onChange }: Props) {
  const [mode, setMode] = useState<string>("None");
  const [stock, setStock] = useState(70);
  const [bond, setBond] = useState(30);

  function applyCustom(s: number, b: number) {
    const total = s + b || 1;
    const sn = (s / total) * 100;
    const bn = (b / total) * 100;
    onChange({
      "US Stock": sn * 0.6,
      International: sn * 0.4,
      "Taxable Bond": bn,
    });
  }

  function handleMode(m: string) {
    setMode(m);
    if (m === "None") onChange(null);
    else if (m === "Custom") applyCustom(stock, bond);
    else onChange(BENCHMARK_PRESETS[m]);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>Benchmark</span>
      <select
        value={mode}
        onChange={(e) => handleMode(e.target.value)}
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
        <span className="flex items-center gap-1" title="Stock is split 60/40 US/International; bond maps to Taxable Bond.">
          <input
            type="number"
            min={0}
            value={stock}
            onChange={(e) => {
              const s = Number(e.target.value) || 0;
              setStock(s);
              applyCustom(s, bond);
            }}
            className="w-14 bg-surface border border-border rounded px-2 py-1 text-fg"
          />
          <span>% stock /</span>
          <input
            type="number"
            min={0}
            value={bond}
            onChange={(e) => {
              const b = Number(e.target.value) || 0;
              setBond(b);
              applyCustom(stock, b);
            }}
            className="w-14 bg-surface border border-border rounded px-2 py-1 text-fg"
          />
          <span>% bond</span>
        </span>
      )}
    </div>
  );
}
