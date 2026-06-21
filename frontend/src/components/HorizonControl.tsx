import NumberField from "./NumberField";

interface Props {
  months: number;
  onChange: (months: number) => void;
}

/** Adjustable projection horizon. Drives the projection chart live. */
export default function HorizonControl({ months, onChange }: Props) {
  const years = Math.floor(months / 12);
  const rem = months % 12;

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted">Horizon</span>
      <input
        type="range"
        min={12}
        max={480}
        step={12}
        value={months}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-40 accent-accent"
      />
      <div className="flex items-center gap-1">
        <NumberField
          min={0}
          max={40}
          step={1}
          value={years}
          onChange={(y) => onChange(Math.max(1, y * 12 + rem))}
          className="w-14 bg-surface border border-border rounded px-2 py-1"
        />
        <span className="text-muted">yr</span>
        <NumberField
          min={0}
          max={11}
          step={1}
          value={rem}
          onChange={(m) => onChange(Math.max(1, years * 12 + m))}
          className="w-14 bg-surface border border-border rounded px-2 py-1"
        />
        <span className="text-muted">mo</span>
      </div>
    </div>
  );
}
