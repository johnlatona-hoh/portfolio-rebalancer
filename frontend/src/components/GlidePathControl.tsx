import type { GlidePathParams } from "../api/client";
import NumberField from "./NumberField";

interface Props {
  value: GlidePathParams;
  onChange: (p: GlidePathParams) => void;
}

const DEFAULT: GlidePathParams = {
  enabled: false,
  equityPctNow: 80,
};

export { DEFAULT as GLIDE_PATH_DEFAULT };

export default function GlidePathControl({ value, onChange }: Props) {
  function update(patch: Partial<GlidePathParams>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          className="rounded"
        />
        <span className="text-sm font-medium">Equity target override</span>
      </label>

      {value.enabled && (
        <div className="pl-2 border-l-2 border-border space-y-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Target equity % now
            <NumberField
              value={value.equityPctNow}
              min={0}
              max={100}
              step={1}
              onChange={(v) => update({ equityPctNow: v })}
              className="w-20 px-2 py-1 rounded border border-border bg-background text-sm text-foreground"
            />
          </label>
          <p className="text-xs text-muted">
            US Stock &amp; International are scaled to{" "}
            <span className="font-semibold text-foreground">{value.equityPctNow}% equity</span>; the
            other classes fill the rest.
          </p>
        </div>
      )}
    </div>
  );
}
