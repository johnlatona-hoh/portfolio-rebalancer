import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  analyzePortfolio,
  projectPortfolio,
  listTags,
  getInsights,
  getPrices,
  type AnalyzeResponse,
  type ProjectResponse,
  type TickerTag,
} from "../api/client";
import { usePortfolio } from "../state/portfolio";
import { parseSchwabCsv, parseFidelityCsv, parseVanguardCsv, parseTemplateCsv } from "../utils/schwabParse";
import { ACCOUNT_TYPE_LABELS } from "../utils/assetClass";
import { fmtMoney } from "../utils/money";
import { deflatePoints } from "../utils/inflation";
import AllocationBars from "../components/AllocationBars";
import TradeTable from "../components/TradeTable";
import SaveRebalanceButton from "../components/SaveRebalanceButton";
import ProjectionChart from "../components/ProjectionChart";
import ReturnAssumptions from "../components/ReturnAssumptions";
import HorizonControl from "../components/HorizonControl";
import ScenarioPanel from "../components/ScenarioPanel";
import GradeCard from "../components/GradeCard";
import StrategySlider from "../components/StrategySlider";
import InflationControls from "../components/InflationControls";
import TipsBox from "../components/TipsBox";
import TaxLossPanel from "../components/TaxLossPanel";
import BenchmarkControl, { type Benchmark } from "../components/BenchmarkControl";
import DriftBandControl from "../components/DriftBandControl";
import RiskPanel from "../components/RiskPanel";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-lg p-4 ${className}`}>{children}</div>
  );
}

export default function DashboardPage() {
  const { holdings, targets, loaded, accounts, setAccounts, loadPortfolio, refreshHoldings } = usePortfolio();

  // Live price refresh
  const [priceMsg, setPriceMsg] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [projection, setProjection] = useState<ProjectResponse | null>(null);

  // Horizon: pendingHorizon updates live (label shows immediately); horizon commits
  // only after 2 s of no change (debounced) to avoid hammering the projection API.
  const [horizon, setHorizon] = useState(240);
  const [pendingHorizon, setPendingHorizon] = useState(240);
  const horizonDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Strategy slider (gain_aversion) + rebalance band. The committed values live in refs
  // so a debounced re-analyze always reads the latest of BOTH inputs (no stale capture
  // when the two sliders are moved within each other's debounce window).
  const [sliderVal, setSliderVal] = useState(0);
  const [pendingBand, setPendingBand] = useState(0);
  const sliderRef = useRef(0);
  const bandRef = useRef(0);
  const analyzeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bandDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inflation / real-vs-nominal toggle
  const [realDollars, setRealDollars] = useState(true);
  const [inflationPct, setInflationPct] = useState(2.5);

  // Net-of-fees toggle + monthly contribution/withdrawal (debounced like horizon)
  const [netOfFees, setNetOfFees] = useState(false);
  const [contribution, setContribution] = useState(0);
  const [pendingContribution, setPendingContribution] = useState(0);
  const contribDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Benchmark overlay
  const [benchmark, setBenchmark] = useState<Benchmark>(null);

  // AI insights
  const [insights, setInsights] = useState<string[] | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Tag map — cached for 5 min; shared via QueryClient so SetupPage invalidates on classify.
  const { data: tagList = [] } = useQuery<TickerTag[]>({ queryKey: ["tags"], queryFn: listTags });
  const tagMap = useMemo(
    () => Object.fromEntries(tagList.map((t) => [t.ticker, t])),
    [tagList]
  );

  const valueByClass = useMemo(
    () => (analysis ? Object.fromEntries(analysis.blended.map((b) => [b.asset_class, b.value])) : {}),
    [analysis]
  );

  // Analysis mutation — variables are passed at call time to avoid stale closures.
  const analyzeMutation = useMutation({
    mutationFn: (p: { h: typeof holdings; t: typeof targets }) =>
      analyzePortfolio(p.h, p.t, sliderRef.current / 100, bandRef.current),
    onSuccess: setAnalysis,
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      setError(e?.response?.data?.detail ?? "Analysis failed."),
  });

  // Re-analyze using the latest committed slider + band (read from refs).
  const runAnalysis = useCallback(() => {
    if (!loaded) return;
    setError(null);
    analyzeMutation.mutate({ h: holdings, t: targets });
  }, [holdings, targets, loaded]);

  // Re-analyze on portfolio change.
  useEffect(() => {
    runAnalysis();
  }, [holdings, targets, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced strategy slider re-analyze.
  function handleSlider(v: number) {
    setSliderVal(v);
    sliderRef.current = v;
    if (analyzeDebounceRef.current) clearTimeout(analyzeDebounceRef.current);
    analyzeDebounceRef.current = setTimeout(runAnalysis, 1000);
  }

  // Debounced rebalance-band re-analyze.
  function handleBand(v: number) {
    setPendingBand(v);
    bandRef.current = v;
    if (bandDebounceRef.current) clearTimeout(bandDebounceRef.current);
    bandDebounceRef.current = setTimeout(runAnalysis, 1000);
  }

  // Horizon: update label immediately, debounce the actual projection by 1 s.
  function handleHorizon(months: number) {
    setPendingHorizon(months);
    if (horizonDebounceRef.current) clearTimeout(horizonDebounceRef.current);
    horizonDebounceRef.current = setTimeout(() => setHorizon(months), 1000);
  }

  // Contribution: update the field immediately, debounce the projection by 1 s.
  function handleContribution(amount: number) {
    setPendingContribution(amount);
    if (contribDebounceRef.current) clearTimeout(contribDebounceRef.current);
    contribDebounceRef.current = setTimeout(() => setContribution(amount), 1000);
  }

  // Fee drag (annual decimal) applied only when the net-of-fees toggle is on.
  const feeDrag = netOfFees && analysis?.risk ? analysis.risk.weighted_fee_pct / 100 : 0;

  // Re-project when committed horizon/contribution, fee toggle, benchmark, or analysis changes.
  useEffect(() => {
    if (!analysis) return;
    projectPortfolio(valueByClass, horizon, {
      feeDrag,
      monthlyContribution: contribution,
      benchmark: benchmark ?? undefined,
    })
      .then(setProjection)
      .catch(() => setProjection(null));
  }, [analysis, horizon, valueByClass, feeDrag, contribution, benchmark]);

  // Deflate projection client-side for real-dollars view.
  const displayedPoints = useMemo(() => {
    if (!projection) return null;
    return realDollars ? deflatePoints(projection.points, inflationPct) : projection.points;
  }, [projection, realDollars, inflationPct]);

  const displayedBenchmark = useMemo(() => {
    if (!projection?.benchmark_points) return null;
    return realDollars
      ? deflatePoints(projection.benchmark_points, inflationPct)
      : projection.benchmark_points;
  }, [projection, realDollars, inflationPct]);

  const priceMutation = useMutation({
    mutationFn: (tickers: string[]) => getPrices(tickers),
    onSuccess: (quotes, tickers) => {
      const n = Object.keys(quotes).length;
      if (n === 0) {
        setPriceMsg("No prices available right now (source may be unavailable).");
        return;
      }
      const updated = holdings.map((h) => {
        const q = quotes[h.ticker.toUpperCase()];
        return q ? { ...h, current_value: Math.round(q.price * h.quantity * 100) / 100 } : h;
      });
      refreshHoldings(updated);
      const missing = tickers.length - n;
      setPriceMsg(
        `Updated ${n} of ${tickers.length} holdings` +
          (missing > 0 ? ` (${missing} kept their uploaded value)` : "") +
          ` - as of ${new Date().toLocaleDateString()}.`
      );
    },
    onError: () => setPriceMsg("Could not refresh prices. Try again later."),
    onSettled: () => setPriceMsg((m) => m),
  });

  function refreshPrices() {
    if (!loaded) return;
    setPriceMsg(null);
    const tickers = [...new Set(holdings.map((h) => h.ticker).filter(Boolean))];
    priceMutation.mutate(tickers);
  }

  const [parseErrors, setParseErrors] = useState<string[]>([]);

  async function parseFiles(files: FileList) {
    setParseErrors([]);
    const errors: string[] = [];
    const newAccounts: typeof accounts = [];
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const schwab = parseSchwabCsv(text, file.name);
        if (schwab) {
          newAccounts.push(schwab);
        } else {
          const fidelity = parseFidelityCsv(text, file.name);
          if (fidelity) {
            newAccounts.push(...fidelity);
          } else {
            const vanguard = parseVanguardCsv(text, file.name);
            if (vanguard) {
              newAccounts.push(...vanguard);
            } else {
              const tmpl = parseTemplateCsv(text, file.name);
              if (tmpl.length === 0) {
                errors.push(`${file.name}: not a recognized Schwab, Fidelity, Vanguard, or template CSV.`);
              } else {
                newAccounts.push(...tmpl);
              }
            }
          }
        }
      } catch (e: unknown) {
        errors.push(`${file.name}: ${e instanceof Error ? e.message : "could not read file"}`);
      }
    }
    if (errors.length) setParseErrors(errors);
    if (newAccounts.length) setAccounts([...accounts, ...newAccounts]);
  }

  function removeAccount(idx: number) {
    setAccounts(accounts.filter((_, i) => i !== idx));
  }

  function resetSettings() {
    setSliderVal(0);
    sliderRef.current = 0;
    setPendingBand(0);
    bandRef.current = 0;
    setHorizon(240);
    setPendingHorizon(240);
    setRealDollars(true);
    setInflationPct(2.5);
    setNetOfFees(false);
    setContribution(0);
    setPendingContribution(0);
    setBenchmark(null);
    setInsights(null);
    clearTimeout(analyzeDebounceRef.current ?? undefined);
    runAnalysis();
  }

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

  const totalGains = analysis.realized_gains ?? 0;

  return (
    <div className="space-y-6">
      {/* ---- summary strip ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs uppercase text-muted">Total Portfolio</div>
              <div className="text-2xl font-semibold mt-1">{fmtMoney(analysis.total_value)}</div>
            </div>
            <div className="flex flex-col gap-1 items-end">
              <button
                onClick={refreshPrices}
                disabled={priceMutation.isPending}
                className="text-xs px-2 py-1 rounded border border-border hover:bg-surface disabled:opacity-50 whitespace-nowrap"
                title="Fetch the latest market prices and recompute each holding's value (quantity x price). Cached for 24h."
              >
                {priceMutation.isPending ? "Refreshing…" : "↻ Refresh prices"}
              </button>
              <button
                onClick={resetSettings}
                className="text-xs px-2 py-1 rounded border border-border hover:bg-surface whitespace-nowrap"
                title="Reset all sliders, toggles, and controls to their defaults. Your holdings and targets are unchanged."
              >
                ↺ Reset settings
              </button>
            </div>
          </div>
          {priceMsg && <div className="text-xs text-muted mt-2">{priceMsg}</div>}
        </Card>
        <Card>
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-xs uppercase text-muted">Accounts</div>
              <div className="text-2xl font-semibold mt-1">{analysis.by_account.length}</div>
            </div>
            <label className="text-xs px-2 py-1 rounded border border-border hover:bg-surface cursor-pointer whitespace-nowrap">
              + Add account
              <input
                type="file"
                accept=".csv"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && parseFiles(e.target.files)}
              />
            </label>
          </div>
          {accounts.length > 0 ? (
            <div className="space-y-1 mt-1">
              {accounts.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 truncate font-medium">{a.accountName}</span>
                  <span className="text-muted">{ACCOUNT_TYPE_LABELS[a.accountType]}</span>
                  <span className="text-muted">{a.positionCount}pos</span>
                  <button
                    onClick={() => removeAccount(i)}
                    className="text-bad hover:text-bad/80 px-0.5"
                    title={`Remove ${a.accountName}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted mt-1">
              {[...new Set(analysis.by_account.map((a) => ACCOUNT_TYPE_LABELS[a.account_type]))].join(", ")}
            </div>
          )}
          {parseErrors.length > 0 && (
            <ul className="mt-2 text-xs text-bad list-disc pl-4">
              {parseErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
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
        <DriftBandControl value={pendingBand} onChange={handleBand} />
      </Card>

      {/* ---- allocation + projection ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold mb-3">Current vs Target (Blended)</h3>
          <AllocationBars
            blended={analysis.blended}
            holdings={holdings}
            tags={tagMap}
            totalPortfolioValue={analysis.total_value}
          />
          <p className="text-xs text-muted mt-3">
            Click any category to see the individual holdings within it.
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
              <HorizonControl months={pendingHorizon} onChange={handleHorizon} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-muted">
            <label className="flex items-center gap-1">
              <span>Monthly add / withdraw</span>
              <span className="text-fg">$</span>
              <input
                type="number"
                step="50"
                value={pendingContribution}
                onChange={(e) => handleContribution(Math.round(Number(e.target.value) || 0))}
                className="w-24 bg-surface border border-border rounded px-2 py-1 text-fg"
                title="Dollars added each month. Use a negative number for a withdrawal (e.g. retirement drawdown)."
              />
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={netOfFees}
                onChange={(e) => setNetOfFees(e.target.checked)}
              />
              <span>
                Net of fees
                {analysis.risk && netOfFees
                  ? ` (-${analysis.risk.weighted_fee_pct.toFixed(2)}%/yr)`
                  : ""}
              </span>
            </label>
            <BenchmarkControl value={benchmark} onChange={setBenchmark} />
          </div>
          {displayedPoints ? (
            <ProjectionChart
              points={displayedPoints}
              realDollars={realDollars}
              netOfFees={netOfFees}
              monthlyContribution={contribution}
              benchmarkPoints={displayedBenchmark}
            />
          ) : (
            <p className="text-muted text-sm">Projecting…</p>
          )}
          <ReturnAssumptions blended={analysis.blended} />
        </Card>
      </div>

      {/* ---- risk / reward ---- */}
      {analysis.risk && (
        <Card>
          <h3 className="font-semibold mb-4">Risk / Reward Analysis</h3>
          <RiskPanel risk={analysis.risk} />
        </Card>
      )}

      {/* ---- trades ---- */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Proposed Rebalancing Trades (tax-aware)</h3>
          <SaveRebalanceButton analysis={analysis} />
        </div>
        <TradeTable trades={analysis.trades} />
        {analysis.grade.reasons.length > 0 && (
          <ul className="mt-4 text-xs list-disc pl-5 space-y-1" style={{ color: "#d8a657" }}>
            {analysis.grade.reasons.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---- tax-loss harvesting (renders only when there are candidates) ---- */}
      <TaxLossPanel lots={analysis.tax_loss_harvest} />

      {/* ---- tips ---- */}
      <Card>
        <h3 className="font-semibold mb-3">Investing Principles</h3>
        <TipsBox analysis={analysis} />
      </Card>

      {/* ---- AI advisor ---- */}
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
    </div>
  );
}
