import axios from "axios";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

export const api = axios.create({ baseURL: BASE });

/** Lightweight health ping used to warm the free-tier backend on app load. */
export async function pingHealth(): Promise<void> {
  await api.get("/health");
}

// ---------- Interfaces (keep in sync with backend/schemas.py) ----------

export type AccountType = "taxable" | "tax_deferred" | "tax_free";
export type TaxEfficiency = "efficient" | "inefficient" | "neutral";

export interface Holding {
  account_name: string;
  account_type: AccountType;
  ticker: string;
  quantity: number;
  cost_basis: number;
  current_value: number;
}

export interface ClassAllocation {
  asset_class: string; // sub-class, e.g. "Muni Bond"
  group: string;       // display parent, e.g. "Bond"
  value: number;
  pct: number;
  target_pct: number;
  delta_value: number;
  post_pct: number;    // blended pct after applying the trade plan
  drift_pct: number;   // post_pct - target_pct (residual misalignment)
  within_band?: boolean; // left untouched by the rebalance band
}

export interface AccountAllocation {
  account_name: string;
  account_type: AccountType;
  value: number;
  by_class: Record<string, number>;
}

export interface Trade {
  account_name: string;
  account_type: AccountType;
  action: "BUY" | "SELL" | "HOLD";
  asset_class: string;
  ticker: string | null;
  amount: number;
  tax_note: string;
  est_gain: number; // estimated realized gain on taxable sells; 0 otherwise
}

export interface LocationGrade {
  score: number;            // 1-10, 10 = best
  misplaced_count: number;
  total_holdings: number;
  inefficient_value: number;
  misplaced_value: number;
  reasons: string[];
  methodology: string;
}

export interface HoldingRisk {
  ticker: string;
  account_name: string;
  asset_class: string;
  current_value: number;
  portfolio_pct: number;
  account_pct: number;
  expected_return_pct: number;
  volatility_pct: number;
  max_drawdown_pct: number;  // negative, e.g. -50.0
  fee_pct: number;           // annual expense ratio %, e.g. 0.03
  annual_fee_cost: number;   // $/yr
}

export interface AccountRisk {
  account_name: string;
  account_type: AccountType;
  value: number;
  expected_return_pct: number;
  volatility_pct: number;
  max_drawdown_pct: number;  // negative
  fee_pct: number;           // value-weighted expense ratio %
  annual_fee_cost: number;   // $/yr
}

export interface PortfolioRisk {
  expected_return_pct: number;
  volatility_pct: number;
  max_drawdown_pct: number;              // negative
  diversification_benefit_pct: number;  // % of vol removed by diversification
  largest_position_pct: number;
  top5_concentration_pct: number;
  weighted_fee_pct: number;             // value-weighted expense ratio % across everything
  annual_fee_cost: number;              // total $/yr across all holdings
  by_account: AccountRisk[];
  by_holding: HoldingRisk[];
}

export interface HarvestLot {
  ticker: string;
  account_name: string;
  asset_class: string | null;
  current_value: number;
  cost_basis: number;
  unrealized_loss: number; // negative
  loss_pct: number;        // negative %
}

export interface AnalyzeResponse {
  total_value: number;
  blended: ClassAllocation[];
  by_account: AccountAllocation[];
  trades: Trade[];
  grade: LocationGrade;
  realized_gains: number;  // total est. gains realized by the trade plan
  max_drift_pct: number;   // largest post-plan deviation from any target (pct pts)
  unknown_tickers: string[];
  risk: PortfolioRisk | null;
  tax_loss_harvest: HarvestLot[];  // taxable lots at an unrealized loss
}

export interface ProjectionPoint {
  month: number;
  p10: number;
  p50: number;
  p90: number;
  deterministic: number;
}

export interface ProjectResponse {
  points: ProjectionPoint[];
  starting_value: number;
  benchmark_points?: ProjectionPoint[] | null;
}

export interface TickerTag {
  ticker: string;
  asset_class: string;
  tax_efficiency: TaxEfficiency;
  name: string | null;
  expense_ratio?: number | null;  // annual decimal, e.g. 0.0003 = 0.03%; null -> class fallback
}

export interface SnapshotMeta {
  id: string;
  label: string | null;
  description: string | null;
  created_at: string;
}

export interface UserResponse {
  id: string;
  email: string;
  created_at: string;
}

export interface LoginResponse {
  user: UserResponse;
  snapshots: SnapshotMeta[];
}

export interface BergerTip {
  title: string;
  body: string;
  advantage: string;
  disadvantage: string;
}

// ---------- Calls ----------

export async function analyzePortfolio(
  holdings: Holding[],
  targets: Record<string, number>,
  gainAversion = 0,
  driftBandPct = 0
): Promise<AnalyzeResponse> {
  const { data } = await api.post<AnalyzeResponse>("/portfolio/analyze", {
    holdings,
    targets,
    gain_aversion: gainAversion,
    drift_band_pct: driftBandPct,
  });
  return data;
}

export async function projectPortfolio(
  valueByClass: Record<string, number>,
  horizonMonths: number,
  opts?: {
    assumptions?: Record<string, { mean: number; stdev: number }>;
    feeDrag?: number;            // annual decimal, e.g. 0.0005
    monthlyContribution?: number; // negative = withdrawal
    benchmark?: Record<string, number>; // class-weight % for an overlay line
  }
): Promise<ProjectResponse> {
  const { data } = await api.post<ProjectResponse>("/portfolio/project", {
    value_by_class: valueByClass,
    horizon_months: horizonMonths,
    n_paths: 1000,
    assumptions: opts?.assumptions ?? null,
    fee_drag: opts?.feeDrag ?? 0,
    monthly_contribution: opts?.monthlyContribution ?? 0,
    benchmark: opts?.benchmark ?? null,
  });
  return data;
}

export interface PriceQuote {
  price: number;
  as_of: string; // ISO8601
}

export async function getPrices(tickers: string[]): Promise<Record<string, PriceQuote>> {
  if (tickers.length === 0) return {};
  const { data } = await api.get<{ prices: Record<string, PriceQuote> }>("/prices", {
    params: { tickers: tickers.join(",") },
  });
  return data.prices;
}

export async function listTags(): Promise<TickerTag[]> {
  const { data } = await api.get<TickerTag[]>("/tags");
  return data;
}

export async function upsertTag(tag: TickerTag): Promise<TickerTag> {
  const { data } = await api.post<TickerTag>("/tags", tag);
  return data;
}

export async function autoClassifyTags(
  items: { ticker: string; description?: string; asset_type?: string }[]
): Promise<TickerTag[]> {
  const { data } = await api.post<TickerTag[]>("/tags/auto", { items });
  return data;
}

export async function suggestTag(
  ticker: string
): Promise<{ ticker: string; suggestion: Omit<TickerTag, "ticker"> | null }> {
  const { data } = await api.post("/tags/suggest", { ticker });
  return data;
}

// ---------- User accounts ----------

export async function registerUser(email: string, pin: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/users/register", { email, pin });
  return data;
}

export async function loginUser(email: string, pin: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/users/login", { email, pin });
  return data;
}

// ---------- Snapshots (user-scoped) ----------

export async function saveSnapshot(
  email: string,
  pin: string,
  payload: unknown,
  label: string,
  description?: string
): Promise<{ id: string; created_at: string }> {
  const { data } = await api.post("/snapshots", { email, pin, payload, label, description: description ?? "" });
  return data;
}

export async function loadSnapshot(
  email: string,
  pin: string,
  id: string
): Promise<{ id: string; payload: unknown; label: string | null; description: string | null; created_at: string }> {
  const { data } = await api.post("/snapshots/load", { email, pin, id });
  return data;
}

export async function deleteSnapshot(
  email: string,
  pin: string,
  id: string
): Promise<void> {
  await api.delete(`/snapshots/${id}`, { data: { email, pin } });
}

export async function getInsights(summary: unknown): Promise<string[]> {
  const { data } = await api.post<{ insights: string[] }>("/advisor/insights", { summary });
  return data.insights;
}

export async function getBergerTips(summary: unknown): Promise<BergerTip[]> {
  const { data } = await api.post<{ tips: BergerTip[] }>("/advisor/tips", { summary });
  return data.tips;
}
