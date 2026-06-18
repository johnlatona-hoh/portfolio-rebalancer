import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  analyzePortfolio,
  projectPortfolio,
  getInsights,
  type AnalyzeResponse,
  type ProjectResponse,
} from "../api/client";
import { usePortfolio } from "../state/portfolio";
import { ACCOUNT_TYPE_LABELS } from "../utils/assetClass";
import { fmtMoney } from "../utils/money";
import AllocationBars from "../components/AllocationBars";
import TradeTable from "../components/TradeTable";
import ProjectionChart from "../components/ProjectionChart";
import HorizonControl from "../components/HorizonControl";
import ScenarioPanel from "../components/ScenarioPanel";

const GRADE_COLOR: Record<string, string> = {
  A: "text-good",
  B: "text-good",
  C: "text-warn",
  D: "text-warn",
  F: "text-bad",
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-lg p-4 ${className}`}>{children}</div>
  );
}

export default function DashboardPage() {
  const { holdings, targets, loaded } = usePortfolio();
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [projection, setProjection] = useState<ProjectResponse | null>(null);
  const [horizon, setHorizon] = useState(240); // months
  const [insights, setInsights] = useState<string[] | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valueByClass = useMemo(
    () => (analysis ? Object.fromEntries(analysis.blended.map((b) => [b.asset_class, b.value])) : {}),
    [analysis]
  );

  // Analyze whenever holdings/targets change.
  useEffect(() => {
    if (!loaded) return;
    setError(null);
    analyzePortfolio(holdings, targets)
      .then(setAnalysis)
      .catch((e) => setError(e?.response?.data?.detail ?? "Analysis failed."));
  }, [holdings, targets, loaded]);

  // Re-project when analysis or horizon changes.
  useEffect(() => {
    if (!analysis) return;
    projectPortfolio(valueByClass, horizon).then(setProjection).catch(() => setProjection(null));
  }, [analysis, horizon, valueByClass]);

  async function loadInsights() {
    if (!analysis) return;
    setLoadingInsights(true);
    try {
      const summary = {
        total_value: analysis.total_value,
        allocations: analysis.blended,
        accounts: analysis.by_account.map((a) => ({
          type: a.account_type,
          by_class: a.by_class,
        })),
        grade: analysis.grade,
      };
      const res = await getInsights(summary);
      setInsights(res);
    } finally {
      setLoadingInsights(false);
    }
  }

  if (!loaded) {
    return (
      <div className="text-center py-20">
        <p className="text-muted mb-4">No portfolio loaded yet.</p>
        <Link to="/" className="px-4 py-2 rounded bg-accent hover:bg-accent-hover">
          Go to Setup
        </Link>
      </div>
    );
  }

  if (error) return <p className="text-bad">{error}</p>;
  if (!analysis) return <p className="text-muted">Analyzing…</p>;

  const accountCount = analysis.by_account.length;

  return (
    <div className="space-y-6">
      {/* summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="text-xs uppercase text-muted">Total Portfolio</div>
          <div className="text-2xl font-semibold mt-1">{fmtMoney(analysis.total_value)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-muted">Accounts</div>
          <div className="text-2xl font-semibold mt-1">{accountCount}</div>
          <div className="text-xs text-muted mt-1">
            {[...new Set(analysis.by_account.map((a) => ACCOUNT_TYPE_LABELS[a.account_type]))].join(
              ", "
            )}
          </div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-muted">Tax-Location Grade</div>
          <div className={`text-2xl font-semibold mt-1 ${GRADE_COLOR[analysis.grade.grade]}`}>
            {analysis.grade.grade}
          </div>
          <div className="text-xs text-muted mt-1">
            {analysis.grade.misplaced_count} of {analysis.grade.total_holdings} holdings misplaced
          </div>
        </Card>
      </div>

      {/* allocation + projection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold mb-3">Current vs Target (Blended)</h3>
          <AllocationBars blended={analysis.blended} />
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Projection</h3>
            <HorizonControl months={horizon} onChange={setHorizon} />
          </div>
          {projection ? (
            <ProjectionChart points={projection.points} />
          ) : (
            <p className="text-muted text-sm">Projecting…</p>
          )}
          <p className="text-xs text-muted mt-2">
            Shaded band = 10th–90th percentile (Monte Carlo). Solid = median, dashed = deterministic.
          </p>
        </Card>
      </div>

      {/* trades */}
      <Card>
        <h3 className="font-semibold mb-3">Proposed Rebalancing Trades (tax-aware)</h3>
        <TradeTable trades={analysis.trades} />
        {analysis.grade.notes.length > 0 && (
          <ul className="mt-4 text-xs text-warn list-disc pl-5 space-y-1">
            {analysis.grade.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </Card>

      {/* AI advisor */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">AI Advisor</h3>
          <button
            onClick={loadInsights}
            disabled={loadingInsights}
            className="text-sm px-3 py-1.5 rounded bg-accent hover:bg-accent-hover disabled:opacity-50"
          >
            {loadingInsights ? "Thinking…" : insights ? "Refresh" : "Get insights"}
          </button>
        </div>
        {insights === null ? (
          <p className="text-sm text-muted">
            Get tax-location suggestions based on your current allocation.
          </p>
        ) : insights.length === 0 ? (
          <p className="text-sm text-muted">
            No insights available (AI is off, or your portfolio looks well-placed).
          </p>
        ) : (
          <ul className="space-y-2 text-sm list-disc pl-5">
            {insights.map((ins, i) => (
              <li key={i}>{ins}</li>
            ))}
          </ul>
        )}
      </Card>

      {/* scenario */}
      <Card>
        <ScenarioPanel
          baseHoldings={holdings}
          targets={targets}
          horizonMonths={horizon}
          current={analysis}
        />
      </Card>
    </div>
  );
}
