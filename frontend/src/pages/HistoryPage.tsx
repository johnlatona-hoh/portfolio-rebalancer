import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listRebalanceEvents, deleteRebalanceEvent, type RebalanceEvent } from "../api/client";
import { useAuth } from "../state/auth";
import { fmtMoney } from "../utils/money";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function GradeChip({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted">—</span>;
  const color =
    score >= 8 ? "text-good" : score >= 5 ? "text-warn" : "text-bad";
  return <span className={`font-semibold ${color}`}>{score}/10</span>;
}

export default function HistoryPage() {
  const { user, isLoggedIn } = useAuth();
  const qc = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data: events = [], isLoading } = useQuery<RebalanceEvent[]>({
    queryKey: ["rebalance-history", user?.id],
    queryFn: () => listRebalanceEvents(user!.id),
    enabled: isLoggedIn,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRebalanceEvent(id, user!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rebalance-history", user?.id] });
      setConfirmId(null);
    },
  });

  if (!isLoggedIn) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-muted mb-4">Log in via the Snapshots page to view your rebalance history.</p>
        <Link to="/snapshots" className="px-4 py-2 rounded bg-accent hover:bg-accent-hover">
          Go to Snapshots
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return <p className="text-muted py-12 text-center">Loading history…</p>;
  }

  if (events.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-muted mb-2">No saved rebalances yet.</p>
        <p className="text-sm text-muted">
          Use the <strong>Save Rebalance</strong> button on the Dashboard after running an analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Rebalance History</h1>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Label</th>
              <th className="text-right px-4 py-3 font-medium">Total Value</th>
              <th className="text-right px-4 py-3 font-medium">Max Drift</th>
              <th className="text-right px-4 py-3 font-medium">Grade</th>
              <th className="text-right px-4 py-3 font-medium">Trades</th>
              <th className="text-right px-4 py-3 font-medium">Est. Gains</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr
                key={ev.id}
                className="border-b border-border last:border-0 hover:bg-card/50"
              >
                <td className="px-4 py-3 text-muted whitespace-nowrap">{fmtDate(ev.created_at)}</td>
                <td className="px-4 py-3">{ev.label ?? <span className="text-muted italic">—</span>}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtMoney(ev.total_value)}</td>
                <td className="px-4 py-3 text-right">
                  {ev.max_drift_pct != null
                    ? `${ev.max_drift_pct.toFixed(1)}pp`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <GradeChip score={ev.grade_score} />
                </td>
                <td className="px-4 py-3 text-right">{ev.trade_count}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {ev.realized_gains_total !== 0
                    ? fmtMoney(ev.realized_gains_total)
                    : <span className="text-muted">—</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  {confirmId === ev.id ? (
                    <span className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => deleteMutation.mutate(ev.id)}
                        disabled={deleteMutation.isPending}
                        className="text-xs px-2 py-1 rounded bg-bad/20 hover:bg-bad/40 text-bad"
                      >
                        {deleteMutation.isPending ? "Deleting…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="text-xs text-muted hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmId(ev.id)}
                      className="text-xs text-muted hover:text-bad"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted mt-3">
        Showing {events.length} saved rebalance{events.length !== 1 ? "s" : ""}.
      </p>
    </div>
  );
}
