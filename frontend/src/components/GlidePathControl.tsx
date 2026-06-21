import type { GlidePathParams } from "../api/client";
import NumberField from "./NumberField";

interface Props {
  value: GlidePathParams;
  onChange: (p: GlidePathParams) => void;
}

const DEFAULT: GlidePathParams = {
  enabled: false,
  currentAge: 40,
  retirementAge: 65,
  equityPctNow: 80,
  equityPctRetirement: 40,
};

export { DEFAULT as GLIDE_PATH_DEFAULT };

function NumInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <NumberField
        value={value}
        min={min}
        max={max}
        step={1}
        onChange={onChange}
        className="w-20 px-2 py-1 rounded border border-border bg-background text-sm text-foreground"
      />
    </label>
  );
}

export default function GlidePathControl({ value, onChange }: Props) {
  function update(patch: Partial<GlidePathParams>) {
    onChange({ ...value, ...patch });
  }

  const yearsToRetirement = Math.max(0, value.retirementAge - value.currentAge);
  const computedEquity = value.equityPctNow;

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          className="rounded"
        />
        <span className="text-sm font-medium">Glide-path mode</span>
      </label>

      {value.enabled && (
        <div className="pl-2 border-l-2 border-border space-y-3">
          <div className="flex flex-wrap gap-4">
            <NumInput
              label="Current age"
              value={value.currentAge}
              min={18}
              max={100}
              onChange={(v) => update({ currentAge: v })}
            />
            <NumInput
              label="Retire at age"
              value={value.retirementAge}
              min={value.currentAge + 1}
              max={100}
              onChange={(v) => update({ retirementAge: v })}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <NumInput
              label="Equity % today"
              value={value.equityPctNow}
              min={0}
              max={100}
              onChange={(v) => update({ equityPctNow: v })}
            />
            <NumInput
              label="Equity % at retirement"
              value={value.equityPctRetirement}
              min={0}
              max={100}
              onChange={(v) => update({ equityPctRetirement: v })}
            />
          </div>
          <p className="text-xs text-muted">
            Current target:{" "}
            <span className="font-semibold text-foreground">{computedEquity}% equity</span>{" "}
            ({yearsToRetirement} yr{yearsToRetirement !== 1 ? "s" : ""} to retirement)
            {" — "}US Stock &amp; International scaled proportionally.
          </p>
        </div>
      )}
    </div>
  );
}
