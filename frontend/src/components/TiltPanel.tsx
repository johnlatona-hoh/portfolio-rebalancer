import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { classifyTilts, type PortfolioTilts, type TiltDimension, type TickerTag } from "../api/client";

interface Props {
  tilts: PortfolioTilts;
  tagMap: Record<string, TickerTag>;
  onClassified: () => void;   // re-run analysis after AI fills classifications
}

// Distinct, theme-consistent colors for the stacked-bar buckets (cycled per dimension).
const BUCKET_COLORS = ["#6b8cba", "#f5a623", "#4caf7d", "#b48ead", "#d8a657", "#c0544a", "#7da7d9"];

function verdictColor(verdict: string): string {
  switch (verdict) {
    case "Neutral":
    case "Balanced":
      return "#4caf7d";
    case "Modest tilt":
    case "Aggressive":
      return "#d8a657";
    case "Strong tilt":
      return "#c0544a";
    case "Conservative":
      return "#6b8cba";
    default:
      return "#8e8e93";
  }
}

function DimensionRow({ dim }: { dim: TiltDimension }) {
  // Order buckets by share desc; drop zero buckets for a tidy bar.
  const entries = Object.entries(dim.breakdown)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const baselineText = Object.entries(dim.baseline)
    .map(([k, v]) => `${k} ${v.toFixed(0)}%`)
    .join(" / ");

  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{dim.label}</span>
          {dim.coverage_pct < 100 && (
            <span className="text-[10px] text-muted">
              ({dim.coverage_pct.toFixed(0)}% classified)
            </span>
          )}
        </div>
        <span
          className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
          style={{ color: verdictColor(dim.verdict), border: `1px solid ${verdictColor(dim.verdict)}` }}
        >
          {dim.verdict}
        </span>
      </div>

      {/* stacked bar */}
      {entries.length > 0 ? (
        <div className="flex h-4 w-full overflow-hidden rounded">
          {entries.map(([label, pct], i) => (
            <div
              key={label}
              className="h-full"
              style={{ width: `${pct}%`, background: BUCKET_COLORS[i % BUCKET_COLORS.length] }}
              title={`${label}: ${pct.toFixed(1)}%`}
            />
          ))}
        </div>
      ) : (
        <div className="h-4 w-full rounded bg-surface" />
      )}

      {/* bucket legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {entries.map(([label, pct], i) => (
          <span key={label} className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: BUCKET_COLORS[i % BUCKET_COLORS.length] }}
            />
            <span className="text-fg capitalize">{label}</span>
            <span className="text-muted">{pct.toFixed(0)}%</span>
          </span>
        ))}
      </div>

      <p className="mt-2 text-xs text-muted leading-relaxed">{dim.note}</p>
      {baselineText && (
        <p className="mt-0.5 text-[11px] text-muted">Neutral baseline: {baselineText}.</p>
      )}
    </div>
  );
}

export default function TiltPanel({ tilts, tagMap, onClassified }: Props) {
  const unclassified = tilts.unclassified_tickers;

  const items = useMemo(
    () => unclassified.map((t) => ({ ticker: t, name: tagMap[t]?.name ?? "" })),
    [unclassified, tagMap]
  );

  const mutation = useMutation({
    mutationFn: () => classifyTilts(items),
    onSuccess: (updated) => {
      if (updated.length > 0) onClassified();
    },
  });

  const noneUpdated = mutation.isSuccess && mutation.data?.length === 0;
  const err = mutation.isError
    ? ((mutation.error as { response?: { data?: { detail?: string } }; message?: string })?.response
        ?.data?.detail ??
      (mutation.error as { message?: string })?.message ??
      "Couldn't classify holdings.")
    : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        How your equity sleeve leans versus a neutral, cap-weighted market - across style, size,
        geography, and sector. A <span className="text-fg">tilt</span> isn't inherently good or bad;
        it's a deliberate bet to understand and size on purpose.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {tilts.dimensions.map((d) => (
          <DimensionRow key={d.key} dim={d} />
        ))}
      </div>

      {/* AI classification for unclassified equity holdings */}
      {unclassified.length > 0 && (
        <div className="border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="text-sm px-3 py-1.5 rounded bg-accent hover:bg-accent-hover disabled:opacity-50"
            >
              {mutation.isPending
                ? "Classifying…"
                : `Classify ${unclassified.length} holding${unclassified.length === 1 ? "" : "s"} with AI`}
            </button>
            <span className="text-xs text-muted">
              {unclassified.slice(0, 8).join(", ")}
              {unclassified.length > 8 ? `, +${unclassified.length - 8} more` : ""}
            </span>
          </div>
          {noneUpdated && (
            <p className="mt-2 text-xs text-muted">
              AI couldn't classify these (it may be off on this server, or didn't recognize them).
            </p>
          )}
          {err && <p className="mt-2 text-xs text-bad">{err}</p>}
        </div>
      )}

      <p className="text-[11px] text-muted">
        Classifications are inferred from fund names and an optional AI pass - approximate, and
        individual stocks may be missing. Tilts are informational, not advice.
      </p>
    </div>
  );
}
