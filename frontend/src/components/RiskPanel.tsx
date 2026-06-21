import { useState } from "react";
import type { PortfolioRisk, HoldingRisk, AccountRisk } from "../api/client";
import { fmtMoney } from "../utils/money";
import { ACCOUNT_TYPE_LABELS } from "../utils/assetClass";

interface Props {
  risk: PortfolioRisk;
}

type SortDir = "asc" | "desc";

function riskColor(value: number, greenThresh: number, yellowThresh: number, higher = true): string {
  if (higher) {
    if (value >= greenThresh) return "#4caf7d";
    if (value >= yellowThresh) return "#d8a657";
    return "#c0544a";
  } else {
    if (value <= greenThresh) return "#4caf7d";
    if (value <= yellowThresh) return "#d8a657";
    return "#c0544a";
  }
}

/** "Good / Average / Concerning" band text derived from the SAME thresholds as riskColor, so the
 * words can never drift from the chip color. `higher` means a bigger value is better. */
function bandGuide(green: number, yellow: number, higher: boolean, unit = "%"): string {
  const g = `${green}${unit}`;
  const y = `${yellow}${unit}`;
  if (higher) {
    return `Good ≥ ${g} · Average ${y}–${g} · Concerning < ${y}`;
  }
  return `Good ≤ ${g} · Average ${g}–${y} · Concerning > ${y}`;
}

function fmt1(n: number) {
  return n.toFixed(1) + "%";
}

function fmtFee(n: number) {
  return n.toFixed(2) + "%";
}

interface Chip {
  label: string;
  value: string;
  subtitle: string;
  color: string;
  help: string;
  guide: string;
}

function MetricChip({ label, value, subtitle, color, help, guide }: Chip) {
  return (
    <div className="group relative flex flex-col gap-0.5 min-w-[120px] border border-border rounded-lg p-3">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted">
        {label}
        <button
          type="button"
          aria-label={help}
          onClick={(e) => e.preventDefault()}
          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border text-[9px] leading-none text-muted cursor-help focus:outline-none focus:ring-1 focus:ring-accent"
        >
          ?
        </button>
      </span>
      <span className="text-xl font-semibold" style={{ color }}>{value}</span>
      <span className="text-[11px] text-muted">{subtitle}</span>
      {/* Hover/focus popover — what the metric means + why it matters */}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1 w-60 rounded-lg border border-border bg-surface p-2.5 text-[11px] font-normal normal-case leading-relaxed text-fg opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {help}
        <span className="mt-1.5 block border-t border-border pt-1.5 text-muted">
          <span className="font-medium text-fg">Guideline:</span> {guide}
        </span>
      </span>
    </div>
  );
}

type AccountSortKey = keyof Pick<AccountRisk, "account_name" | "value" | "expected_return_pct" | "volatility_pct" | "max_drawdown_pct" | "fee_pct">;
type HoldingSortKey = keyof Pick<HoldingRisk, "ticker" | "account_name" | "current_value" | "portfolio_pct" | "account_pct" | "expected_return_pct" | "volatility_pct" | "max_drawdown_pct" | "fee_pct">;

function SortTh<K extends string>({ col, label, sort, onSort }: { col: K; label: string; sort: { col: K; dir: SortDir }; onSort: (c: K) => void }) {
  const active = sort.col === col;
  return (
    <th
      className="text-left text-xs text-muted py-1.5 px-2 cursor-pointer select-none whitespace-nowrap hover:text-fg"
      onClick={() => onSort(col)}
    >
      {label}{active ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );
}

export default function RiskPanel({ risk }: Props) {
  const [accountsOpen, setAccountsOpen] = useState(true);
  const [holdingsOpen, setHoldingsOpen] = useState(false);
  const [showAllHoldings, setShowAllHoldings] = useState(false);

  const [acctSort, setAcctSort] = useState<{ col: AccountSortKey; dir: SortDir }>({ col: "value", dir: "desc" });
  const [holdSort, setHoldSort] = useState<{ col: HoldingSortKey; dir: SortDir }>({ col: "current_value", dir: "desc" });

  function toggleAcctSort(col: AccountSortKey) {
    setAcctSort((s) => ({ col, dir: s.col === col && s.dir === "desc" ? "asc" : "desc" }));
  }
  function toggleHoldSort(col: HoldingSortKey) {
    setHoldSort((s) => ({ col, dir: s.col === col && s.dir === "desc" ? "asc" : "desc" }));
  }

  const sortedAccounts = [...risk.by_account].sort((a, b) => {
    const va = a[acctSort.col] as number | string;
    const vb = b[acctSort.col] as number | string;
    return acctSort.dir === "asc" ? (va < vb ? -1 : 1) : (va > vb ? -1 : 1);
  });

  const sortedHoldings = [...risk.by_holding].sort((a, b) => {
    const va = a[holdSort.col] as number | string;
    const vb = b[holdSort.col] as number | string;
    return holdSort.dir === "asc" ? (va < vb ? -1 : 1) : (va > vb ? -1 : 1);
  });
  const visibleHoldings = showAllHoldings ? sortedHoldings : sortedHoldings.slice(0, 15);

  const chips: Chip[] = [
    {
      label: "Expected Return",
      value: fmt1(risk.expected_return_pct),
      subtitle: "annual estimate",
      color: riskColor(risk.expected_return_pct, 6, 3, true),
      help: "The average yearly growth your mix of assets has earned historically, weighted by how much you hold of each. Higher is better, but it usually comes with more volatility — it sets your long-run wealth-building pace.",
      guide: bandGuide(6, 3, true),
    },
    {
      label: "Volatility",
      value: fmt1(risk.volatility_pct),
      subtitle: "annual std dev",
      color: riskColor(risk.volatility_pct, 10, 18, false),
      help: "How much your portfolio's value swings up and down in a typical year (standard deviation). Lower means a smoother ride; high volatility raises the odds you'll sell in a panic at the wrong time.",
      guide: bandGuide(10, 18, false),
    },
    {
      label: "Max Drawdown Est.",
      value: fmt1(risk.max_drawdown_pct),
      subtitle: "rough worst case",
      color: riskColor(Math.abs(risk.max_drawdown_pct), 25, 45, false),
      help: "A rough estimate of the worst peak-to-trough drop this mix could see in a severe downturn. It's a gut-check: could you stay invested if your balance fell this far without selling?",
      guide: bandGuide(25, 45, false) + " (size of the drop)",
    },
    {
      label: "Diversification",
      value: fmt1(risk.diversification_benefit_pct),
      subtitle: "vol saved by mix",
      color: riskColor(risk.diversification_benefit_pct, 10, 5, true),
      help: "How much volatility you avoid because your assets don't all move together, versus holding them in isolation. Higher means your mix is doing real work to reduce risk for free.",
      guide: bandGuide(10, 5, true),
    },
    {
      label: "Largest Position",
      value: fmt1(risk.largest_position_pct),
      subtitle: "% of portfolio",
      color: riskColor(risk.largest_position_pct, 10, 20, false),
      help: "The share of your whole portfolio sitting in a single holding. A large number means concentration risk — one bad pick can dominate your results, so lower is generally safer.",
      guide: bandGuide(10, 20, false),
    },
    {
      label: "Annual Fees",
      value: fmtFee(risk.weighted_fee_pct),
      subtitle: fmtMoney(risk.annual_fee_cost) + "/yr",
      color: riskColor(risk.weighted_fee_pct, 0.1, 0.4, false),
      help: "The blended yearly expense ratio across your funds, in percent and dollars. Fees compound against you every year, so even a few tenths of a percent can cost tens of thousands over decades — lower is better.",
      guide: bandGuide(0.1, 0.4, false),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Portfolio-level chips */}
      <div className="flex flex-wrap gap-3">
        {chips.map((c) => (
          <MetricChip key={c.label} {...c} />
        ))}
      </div>
      <p className="text-xs text-muted">
        Top-5 concentration: <span className="text-fg">{fmt1(risk.top5_concentration_pct)}</span> of portfolio.
        All figures are estimates based on historical asset-class assumptions, not predictions.
      </p>

      {/* By Account */}
      <div>
        <button
          className="text-sm font-medium flex items-center gap-1 mb-2 hover:text-fg"
          onClick={() => setAccountsOpen((o) => !o)}
        >
          <span>{accountsOpen ? "▾" : "▸"}</span> By Account
        </button>
        {accountsOpen && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <SortTh col="account_name" label="Account" sort={acctSort} onSort={toggleAcctSort} />
                  <th className="text-left text-xs text-muted py-1.5 px-2">Type</th>
                  <SortTh col="value" label="Value" sort={acctSort} onSort={toggleAcctSort} />
                  <SortTh col="expected_return_pct" label="Exp. Return" sort={acctSort} onSort={toggleAcctSort} />
                  <SortTh col="volatility_pct" label="Volatility" sort={acctSort} onSort={toggleAcctSort} />
                  <SortTh col="max_drawdown_pct" label="Max Drawdown" sort={acctSort} onSort={toggleAcctSort} />
                  <SortTh col="fee_pct" label="Fees" sort={acctSort} onSort={toggleAcctSort} />
                </tr>
              </thead>
              <tbody>
                {sortedAccounts.map((a) => (
                  <tr key={a.account_name} className="border-b border-border/40 hover:bg-surface/50">
                    <td className="py-1.5 px-2">{a.account_name}</td>
                    <td className="py-1.5 px-2 text-muted text-xs">{ACCOUNT_TYPE_LABELS[a.account_type]}</td>
                    <td className="py-1.5 px-2">{fmtMoney(a.value)}</td>
                    <td className="py-1.5 px-2" style={{ color: riskColor(a.expected_return_pct, 6, 3, true) }}>{fmt1(a.expected_return_pct)}</td>
                    <td className="py-1.5 px-2" style={{ color: riskColor(a.volatility_pct, 10, 18, false) }}>{fmt1(a.volatility_pct)}</td>
                    <td className="py-1.5 px-2" style={{ color: riskColor(Math.abs(a.max_drawdown_pct), 25, 45, false) }}>{fmt1(a.max_drawdown_pct)}</td>
                    <td className="py-1.5 px-2" style={{ color: riskColor(a.fee_pct, 0.1, 0.4, false) }}>{fmtFee(a.fee_pct)}<span className="text-muted text-[10px]"> ({fmtMoney(a.annual_fee_cost)})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* By Holding */}
      <div>
        <button
          className="text-sm font-medium flex items-center gap-1 mb-2 hover:text-fg"
          onClick={() => setHoldingsOpen((o) => !o)}
        >
          <span>{holdingsOpen ? "▾" : "▸"}</span>
          {holdingsOpen ? "Hide" : "Show"} holdings breakdown ({risk.by_holding.length})
        </button>
        {holdingsOpen && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <SortTh col="ticker" label="Ticker" sort={holdSort} onSort={toggleHoldSort} />
                    <SortTh col="account_name" label="Account" sort={holdSort} onSort={toggleHoldSort} />
                    <th className="text-left text-xs text-muted py-1.5 px-2">Asset Class</th>
                    <SortTh col="current_value" label="Value" sort={holdSort} onSort={toggleHoldSort} />
                    <SortTh col="portfolio_pct" label="% Portfolio" sort={holdSort} onSort={toggleHoldSort} />
                    <SortTh col="account_pct" label="% Account" sort={holdSort} onSort={toggleHoldSort} />
                    <SortTh col="expected_return_pct" label="Exp. Return" sort={holdSort} onSort={toggleHoldSort} />
                    <SortTh col="volatility_pct" label="Volatility" sort={holdSort} onSort={toggleHoldSort} />
                    <SortTh col="max_drawdown_pct" label="Max Drawdown" sort={holdSort} onSort={toggleHoldSort} />
                    <SortTh col="fee_pct" label="Fee" sort={holdSort} onSort={toggleHoldSort} />
                  </tr>
                </thead>
                <tbody>
                  {visibleHoldings.map((h, i) => (
                    <tr
                      key={`${h.ticker}-${h.account_name}-${i}`}
                      className={`border-b border-border/40 hover:bg-surface/50 ${h.portfolio_pct > 15 ? "font-semibold" : ""}`}
                    >
                      <td className="py-1.5 px-2 font-mono text-xs">{h.ticker}</td>
                      <td className="py-1.5 px-2 text-muted text-xs">{h.account_name}</td>
                      <td className="py-1.5 px-2 text-xs text-muted">{h.asset_class}</td>
                      <td className="py-1.5 px-2">{fmtMoney(h.current_value)}</td>
                      <td className="py-1.5 px-2">{fmt1(h.portfolio_pct)}</td>
                      <td className="py-1.5 px-2">{fmt1(h.account_pct)}</td>
                      <td className="py-1.5 px-2" style={{ color: riskColor(h.expected_return_pct, 6, 3, true) }}>{fmt1(h.expected_return_pct)}</td>
                      <td className="py-1.5 px-2" style={{ color: riskColor(h.volatility_pct, 10, 18, false) }}>{fmt1(h.volatility_pct)}</td>
                      <td className="py-1.5 px-2" style={{ color: riskColor(Math.abs(h.max_drawdown_pct), 25, 45, false) }}>{fmt1(h.max_drawdown_pct)}</td>
                      <td className="py-1.5 px-2" style={{ color: riskColor(h.fee_pct, 0.1, 0.4, false) }}>{fmtFee(h.fee_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!showAllHoldings && risk.by_holding.length > 15 && (
              <button
                className="mt-2 text-xs text-accent hover:underline"
                onClick={() => setShowAllHoldings(true)}
              >
                Show all {risk.by_holding.length} holdings
              </button>
            )}
            {showAllHoldings && risk.by_holding.length > 15 && (
              <button
                className="mt-2 text-xs text-accent hover:underline"
                onClick={() => setShowAllHoldings(false)}
              >
                Show fewer
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
