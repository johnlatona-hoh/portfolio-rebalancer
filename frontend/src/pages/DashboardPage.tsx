import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  analyzePortfolio,
  projectPortfolio,
  listTags,
  getInsights,
  type AnalyzeResponse,
  type ProjectResponse,
  type TickerTag,
} from "../api/client";
import { usePortfolio } from "../state/portfolio";
import { ACCOUNT_TYPE_LABELS } from "../utils/assetClass";
import { fmtMoney } from "../utils/money";
import { deflatePoints } from "../utils/inflation";
import AllocationBars from "../components/AllocationBars";
import TradeTable from "../components/TradeTable";
import ProjectionChart from "../components/ProjectionChart";
import HorizonControl from "../components/HorizonControl";
import ScenarioPanel from "../components/ScenarioPanel";
import GradeCard from "../components/GradeCard";
import StrategySlider from "../components/StrategySlider";
import InflationControls from "../components/InflationControls";
import TipsBox from "../components/TipsBox";
import HoldingsDetail from "../components/HoldingsDetail";

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

  // Strategy slider (gain_aversion)
  const [sliderVal, setSliderVal] = useState(0); // 0..100
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inflation / real-vs-nominal toggle
  const [realDollars, setRealDollars] = useState(true);
  const [inflationPct, setInflationPct] = useState(2.5);

  // AI insights (old-style)
  const [insights, setInsights] = useState<string[] | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Holdings drill-down
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [tagMap, setTagMap] = useState<Record<string, TickerTag>>({});

  const [error, setError] = useState<string | null>(null);

  // Load all tags once for the HoldingsDetail drill-down.
  useEffect(() => {
    listTags()
      .then((tags) =>
        setTagMap(Object.fromEntries(tags.map((t) => [t.ticker, t])))
      )
      .catch(() => {});
  }, []);

  const valueByClass = useMemo(
    () => (analysis ? Object.fromEntries(analysis.blended.map((b) => [b.asset_class, b.value])) : {}),
    [analysis]
  );

  // Analyze whenever holdings/targets/gainAversion changes. Debounce the slider.
  const runAnalysis = useCallback(
    (gainAversion: number) => {
      if (!loaded) return;
      setError(null);
      analyzePortfolio(holdings, targets, gainAversion / 100)
        .then(setAnalysis)
        .catch((e) => setError(e?.response?.data?.detail ?? "Analysis failed."));
    },
    [holdings, targets, loaded]
  );

  useEffect(() => {
    runAnalysis(sliderVal);
  }, [holdings, targets, loaded]); // only re-run on portfolio changes here

  function handleSlider(v: number) {
    setSliderVal(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runAnalysis(v), 450);
  }

  // Re-project when analysis or horizon changes.
  useEffect(() => {
    if (!analysis) return;
    projectPortfolio(valueByClass, horizon).then(setProjection).catch(() => setProjection(null));
  }, [analysis, horizon, valueByClass]);

  // Apply inflation deflation client-side.
  const displayedPoints = useMemo(() => {
    if (!projection) return null;
    return realDollars ? deflatePoints(projection.points, inflationPct) : projection.points;
  }, [projection, realDollars, inflationPct]);

  async function loadInsights() {
    if (!analysis) return;
    setLoadingInsights(true);
    try {
      const summary = {
        total_value: analysis.total_value,
        allocations: analysis.blended,
        accounts: analysis.by_account.map((a) => ({ type: a.account_type, by_class: a.by_class })),
        grade: analysis.grade,
      };
      setInsights(await getInsights(summary));
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
  const totalGains = analysis.realized_gains ?? 0;

  return (
    <div className="space-y-6">
      {/* ---- summary strip ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="text-xs uppercase text-muted">Total Portfolio</div>
          <div className="text-2xl font-semibold mt-1">{fmtMoney(analysis.total_value)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-muted">Accounts</div>
          <div className="text-2xl font-semibold mt-1">{accountCount}</div>
          <div className="text-xs text-muted mt-1">
            {[...new Set(analysis.by_account.map((a) => ACCOUNT_TYPE_LABELS[a.account_type]))].join(", ")}
          </div>
        </Card>
        <Card>
          <GradeCard grade={analysis.grade} />
        </Card>
      </div>

      {/* ---- strategy slider ---- */}
      <Card>
        <h3 className="font-semibold mb-3">Rebalancing Strategy</h3>
        <StrategySlider
          value={sliderVal}
          onChange={handleSlider}
          realizedGains={totalGains}
          maxDriftPct={analysis.max_drift_pct ?? 0}
        />
        {totalGains > 0 && (
          <p className="text-xs text-muted mt-3">
            This plan realizes an estimated{" "}
            <strong className="text-warn">{fmtMoney(totalGains)}</strong> in capital gains in
            taxable accounts. Adjust the slider to reduce this.
          </p>
        )}
      </Card>

      {/* ---- allocation + projection ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold mb-3">Current vs Target (Blended)</h3>
          <AllocationBars
            blended={analysis.blended}
            onSelectClass={setSelectedClass}
          />
          <p className="text-xs text-muted mt-3">
            Each bar shows current allocation (filled) vs your target (white marker). Click a
            class to see its individual holdings.
          </p>
        </Card>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="font-semibold">Projection</h3>
            <div className="flex flex-wrap gap-2 items-center">
              <InflationControls
                realDollars={realDollars}
                onToggle={setRealDollars}
                inflationPct={inflationPct}
                onInflationChange={setInflationPct}
              />
              <HorizonControl months={horizon} onChange={setHorizon} />
            </div>
          </div>
          {displayedPoints ? (
            <ProjectionChart points={displayedPoints} realDollars={realDollars} />
          ) : (
            <p className="text-muted text-sm">Projecting…</p>
          )}
        </Card>
      </div>

      {/* ---- trades ---- */}
      <Card>
        <h3 className="font-semibold mb-3">Proposed Rebalancing Trades (tax-aware)</h3>
        <TradeTable trades={analysis.trades} />
        {analysis.grade.reasons.length > 0 && (
          <ul className="mt-4 text-xs list-disc pl-5 space-y-1" style={{ color: "#d8a657" }}>
            {analysis.grade.reasons.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---- tips ---- */}
      <Card>
        <h3 className="font-semibold mb-3">Investing Principles (Rob Berger)</h3>
        <TipsBox analysis={analysis} />
      </Card>

      {/* ---- AI advisor (legacy insights) ---- */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">AI Tax-Location Advisor</h3>
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

      {/* ---- scenario / what-if ---- */}
      <Card>
        <ScenarioPanel
          baseHoldings={holdings}
          targets={targets}
          horizonMonths={horizon}
          current={analysis}
        />
      </Card>

      {/* ---- holdings drill-down modal ---- */}
      {selectedClass && (
        <HoldingsDetail
          assetClass={selectedClass}
          holdings={holdings}
          tags={tagMap}
          totalPortfolioValue={analysis.total_value}
          onClose={() => setSelectedClass(null)}
        />
      )}
    </div>
  );
}
