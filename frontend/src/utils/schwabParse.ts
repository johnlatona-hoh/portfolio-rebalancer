import Papa from "papaparse";
import type { AccountType, Holding } from "../api/client";

export interface TickerMeta {
  description: string;
  assetType: string;
}

export interface ParsedAccount {
  fileName: string;
  accountName: string;
  accountType: AccountType;
  holdings: Holding[]; // includes a synthetic CASH holding when cashValue > 0
  cashValue: number;
  positionCount: number; // non-cash positions
  meta: Record<string, TickerMeta>; // ticker -> broker description/asset-type, for auto-classification
}

/** Clean a Schwab money/number cell: "$8,870.68 " -> 8870.68, "($1,538.37)" -> -1538.37,
 *  "N/A"/"--"/"" -> 0, "5,111" -> 5111. */
export function cleanNumber(raw: unknown): number {
  if (raw == null) return 0;
  let t = String(raw).trim();
  if (t === "" || t === "N/A" || t === "--") return 0;
  const negative = /^\(.*\)$/.test(t);
  t = t.replace(/[(),$"\s]/g, "");
  const v = parseFloat(t);
  if (Number.isNaN(v)) return 0;
  return negative ? -v : v;
}

/** Infer account tax treatment from the Schwab account name. Roth/HSA -> tax_free;
 *  IRA/401k/rollover/SEP -> tax_deferred; everything else -> taxable. Order matters
 *  because "Roth IRA" contains "ira". */
export function inferAccountType(name: string): AccountType {
  const n = name.toLowerCase();
  if (n.includes("roth") || n.includes("hsa")) return "tax_free";
  if (/\b(ira|401|403|457|sep|simple|rollover)\b/.test(n) || n.includes("ira")) {
    return "tax_deferred";
  }
  return "taxable";
}

/** True if the text looks like a Schwab "Positions for account ..." export. */
export function isSchwabExport(text: string): boolean {
  return /^\s*"?Positions for account/i.test(text);
}

/** Parse a single Schwab positions CSV. Returns null if it isn't a Schwab export. */
export function parseSchwabCsv(text: string, fileName: string): ParsedAccount | null {
  if (!isSchwabExport(text)) return null;

  const rows = (Papa.parse<string[]>(text, { skipEmptyLines: true }).data || []).filter(
    (r) => Array.isArray(r) && r.length > 0
  );
  if (rows.length === 0) return null;

  // Account name lives in the title row: Positions for account <NAME> ...698 as of ...
  const title = rows[0][0] ?? "";
  const m =
    title.match(/Positions for account\s+(.+?)\s+\.\.\..*?as of/i) ||
    title.match(/Positions for account\s+(.+?)\s+as of/i) ||
    title.match(/Positions for account\s+(.+)/i);
  const accountName = (m?.[1] ?? fileName.replace(/\.csv$/i, "")).trim();

  // Locate the header row and resolve the columns we need.
  const headerIdx = rows.findIndex((r) => (r[0] ?? "").trim() === "Symbol");
  if (headerIdx === -1) return null;
  const header = rows[headerIdx].map((h) => (h ?? "").trim());
  const col = (pred: (h: string) => boolean) => header.findIndex(pred);

  const symIdx = col((h) => h === "Symbol");
  const costIdx = col((h) => h.startsWith("Cost Basis"));
  const mktIdx = col((h) => h.startsWith("Mkt Val"));
  const qtyIdx = col((h) => h.startsWith("Qty"));
  const descIdx = col((h) => h === "Description");
  const assetTypeIdx = col((h) => h.startsWith("Asset Type"));

  const holdings: Holding[] = [];
  const meta: Record<string, TickerMeta> = {};
  let cashValue = 0;

  for (const r of rows.slice(headerIdx + 1)) {
    const sym = (r[symIdx] ?? "").trim();
    if (!sym) continue;
    if (/^cash/i.test(sym)) {
      cashValue += cleanNumber(r[mktIdx]);
      continue;
    }
    const current_value = cleanNumber(r[mktIdx]);
    if (current_value === 0) continue; // skip empty/closed lines
    const ticker = sym.toUpperCase();
    meta[ticker] = {
      description: (r[descIdx] ?? "").trim(),
      assetType: (r[assetTypeIdx] ?? "").trim(),
    };
    holdings.push({
      account_name: accountName,
      account_type: "taxable", // provisional; caller applies the chosen account type
      ticker,
      quantity: cleanNumber(r[qtyIdx]),
      cost_basis: cleanNumber(r[costIdx]),
      current_value,
    });
  }

  const positionCount = holdings.length;
  if (cashValue > 0) {
    holdings.push({
      account_name: accountName,
      account_type: "taxable",
      ticker: "CASH",
      quantity: cashValue,
      cost_basis: cashValue,
      current_value: cashValue,
    });
  }

  return {
    fileName,
    accountName,
    accountType: inferAccountType(accountName),
    holdings,
    cashValue,
    positionCount,
    meta,
  };
}

/** Reconstruct accounts from a flat holdings list (e.g. when loading a snapshot). */
export function accountsFromHoldings(holdings: Holding[]): ParsedAccount[] {
  const groups = new Map<string, ParsedAccount>();
  for (const h of holdings) {
    if (!groups.has(h.account_name)) {
      groups.set(h.account_name, {
        fileName: "",
        accountName: h.account_name,
        accountType: h.account_type,
        holdings: [],
        cashValue: 0,
        positionCount: 0,
        meta: {},
      });
    }
    const a = groups.get(h.account_name)!;
    a.holdings.push(h);
    if (h.ticker === "CASH") a.cashValue += h.current_value;
    else a.positionCount += 1;
  }
  return [...groups.values()];
}

/** Apply the (possibly user-overridden) account type/name to every holding. */
export function holdingsForAccount(acct: ParsedAccount): Holding[] {
  return acct.holdings.map((h) => ({
    ...h,
    account_name: acct.accountName,
    account_type: acct.accountType,
  }));
}
