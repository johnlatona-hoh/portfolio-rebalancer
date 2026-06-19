import axios from "axios";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

export const api = axios.create({ baseURL: BASE });

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

export interface AnalyzeResponse {
  total_value: number;
  blended: ClassAllocation[];
  by_account: AccountAllocation[];
  trades: Trade[];
  grade: LocationGrade;
  realized_gains: number;  // total est. gains realized by the trade plan
  max_drift_pct: number;   // largest post-plan deviation from any target (pct pts)
  unknown_tickers: string[];
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
}

export interface TickerTag {
  ticker: string;
  asset_class: string;
  tax_efficiency: TaxEfficiency;
  name: string | null;
}

export interface SnapshotMeta {
  id: string;
  label: string | null;
  created_at: string;
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
  gainAversion = 0
): Promise<AnalyzeResponse> {
  const { data } = await api.post<AnalyzeResponse>("/portfolio/analyze", {
    holdings,
    targets,
    gain_aversion: gainAversion,
  });
  return data;
}

export async function projectPortfolio(
  valueByClass: Record<string, number>,
  horizonMonths: number,
  assumptions?: Record<string, { mean: number; stdev: number }>
): Promise<ProjectResponse> {
  const { data } = await api.post<ProjectResponse>("/portfolio/project", {
    value_by_class: valueByClass,
    horizon_months: horizonMonths,
    n_paths: 1000,
    assumptions: assumptions ?? null,
  });
  return data;
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

export async function saveSnapshot(
  pin: string,
  payload: unknown,
  label?: string
): Promise<{ id: string; created_at: string }> {
  const { data } = await api.post("/snapshots", { pin, payload, label });
  return data;
}

export async function loadSnapshot(
  pin: string,
  id?: string
): Promise<{ id: string; payload: unknown; label: string | null; created_at: string }> {
  const { data } = await api.post("/snapshots/load", { pin, id: id ?? null });
  return data;
}

export async function getInsights(summary: unknown): Promise<string[]> {
  const { data } = await api.post<{ insights: string[] }>("/advisor/insights", { summary });
  return data.insights;
}

export async function getBergerTips(summary: unknown): Promise<BergerTip[]> {
  const { data } = await api.post<{ tips: BergerTip[] }>("/advisor/tips", { summary });
  return data.tips;
}
