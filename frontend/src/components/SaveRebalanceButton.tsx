import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { saveRebalanceEvent, type AnalyzeResponse, type SaveRebalanceRequest } from "../api/client";
import { useAuth } from "../state/auth";
import { fmtMoney } from "../utils/money";

interface Props {
  analysis: AnalyzeResponse | null;
}

export default function SaveRebalanceButton({ analysis }: Props) {
  const { user, isLoggedIn } = useAuth();
  const [label, setLabel] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (req: SaveRebalanceRequest) => saveRebalanceEvent(req),
    onSuccess: (ev) => {
      setSavedAt(ev.created_at);
      setLabel("");
      setShowInput(false);
      setTimeout(() => setSavedAt(null), 3000);
    },
  });

  function buildPayload(): SaveRebalanceRequest | null {
    if (!analysis || !user) return null;
    const allocation_json = Object.fromEntries(
      analysis.blended.map((b) => [b.asset_class, b.pct])
    );
    const targets_json = Object.fromEntries(
      analysis.blended.map((b) => [b.asset_class, b.target_pct])
    );
    return {
      user_id: user.id,
      label: label.trim() || undefined,
      total_value: analysis.total_value,
      max_drift_pct: analysis.max_drift_pct ?? 0,
      allocation_json,
      targets_json,
      grade_score: analysis.grade?.score ?? undefined,
      trade_count: analysis.trades?.length ?? 0,
      realized_gains_total: analysis.realized_gains ?? 0,
    };
  }

  function handleSave() {
    const payload = buildPayload();
    if (!payload) return;
    saveMutation.mutate(payload);
  }

  if (!isLoggedIn) {
    return (
      <span className="text-xs text-muted">
        Log in via Snapshots to enable Save Rebalance.
      </span>
    );
  }

  if (savedAt) {
    return (
      <span className="text-xs text-good">
        Saved {fmtMoney(analysis?.total_value ?? 0)} snapshot at{" "}
        {new Date(savedAt).toLocaleTimeString()}.
      </span>
    );
  }

  if (showInput) {
    return (
      <span className="flex items-center gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setShowInput(false);
          }}
          placeholder="Label (optional)"
          autoFocus
          className="text-sm px-2 py-1 rounded border border-border bg-background w-40"
        />
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending || !analysis}
          className="text-sm px-3 py-1 rounded bg-accent hover:bg-accent-hover disabled:opacity-50"
        >
          {saveMutation.isPending ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setShowInput(false)}
          className="text-sm text-muted hover:text-foreground"
        >
          Cancel
        </button>
        {saveMutation.isError && (
          <span className="text-xs text-bad">Save failed.</span>
        )}
      </span>
    );
  }

  return (
    <button
      onClick={() => setShowInput(true)}
      disabled={!analysis}
      className="text-sm px-3 py-1.5 rounded border border-border hover:bg-card disabled:opacity-40"
    >
      Save Rebalance
    </button>
  );
}
