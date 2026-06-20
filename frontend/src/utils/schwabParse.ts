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

// ---------------------------------------------------------------------------
// Fidelity parser
// ---------------------------------------------------------------------------

/** True if the text looks like a Fidelity positions export. */
export function isFidelityExport(text: string): boolean {
  if (isSchwabExport(text)) return false;
  const head = text.slice(0, 3000).toLowerCase();
  return (
    head.includes("cost basis total") ||
    head.includes('"account number"') ||
    head.includes(",account number,")
  );
}

/** Parse a Fidelity positions CSV (handles single- and multi-account exports).
 *  Returns null if the text is not a Fidelity export. */
export function parseFidelityCsv(text: string, fileName: string): ParsedAccount[] | null {
  if (!isFidelityExport(text)) return null;

  const rawRows = (Papa.parse<string[]>(text, { skipEmptyLines: true }).data || []).filter(
    (r) => Array.isArray(r) && r.length > 0
  );

  // Find the header row: first row that contains "Symbol" as a cell.
  const headerIdx = rawRows.findIndex((r) =>
    r.some((c) => (c ?? "").trim().toLowerCase() === "symbol")
  );
  if (headerIdx === -1) return null;

  const header = rawRows[headerIdx].map((h) => (h ?? "").trim().toLowerCase());
  const colIdx = (names: string[]) => {
    for (const name of names) {
      const i = header.findIndex((h) => h === name || h.startsWith(name));
      if (i !== -1) return i;
    }
    return -1;
  };

  const symIdx = colIdx(["symbol"]);
  const descIdx = colIdx(["description"]);
  const qtyIdx = colIdx(["quantity", "shares"]);
  const valIdx = colIdx(["current value"]);
  const costIdx = colIdx(["cost basis total", "cost basis"]);
  const typeIdx = colIdx(["type"]);
  const acctNameIdx = colIdx(["account name"]);

  if (symIdx === -1 || valIdx === -1) return null;

  // Default account name: try rows before header for a non-header label.
  let defaultName = fileName.replace(/\.csv$/i, "");
  for (const r of rawRows.slice(0, headerIdx)) {
    const cell = (r[0] ?? "").trim();
    if (cell && !/^(account number|date downloaded)/i.test(cell)) {
      defaultName = cell;
      break;
    }
  }

  const accountMap = new Map<string, ParsedAccount>();
  const getAccount = (name: string): ParsedAccount => {
    if (!accountMap.has(name)) {
      accountMap.set(name, {
        fileName,
        accountName: name,
        accountType: inferAccountType(name),
        holdings: [],
        cashValue: 0,
        positionCount: 0,
        meta: {},
      });
    }
    return accountMap.get(name)!;
  };

  for (const r of rawRows.slice(headerIdx + 1)) {
    const sym = (r[symIdx] ?? "").trim();
    const acctName = acctNameIdx !== -1 ? (r[acctNameIdx] ?? "").trim() || defaultName : defaultName;

    // Pending activity / subtotal rows have "--" or empty symbol.
    if (!sym || sym === "--") {
      const val = cleanNumber(r[valIdx]);
      if (val > 0) getAccount(acctName).cashValue += val;
      continue;
    }
    // Stop at Fidelity footer totals ("Total Account Value", etc.).
    if (/^total/i.test(sym)) break;

    const current_value = cleanNumber(r[valIdx]);
    if (current_value === 0) continue;

    const ticker = sym.toUpperCase();
    const acct = getAccount(acctName);
    acct.meta[ticker] = {
      description: descIdx !== -1 ? (r[descIdx] ?? "").trim() : "",
      assetType: typeIdx !== -1 ? (r[typeIdx] ?? "").trim() : "",
    };
    acct.holdings.push({
      account_name: acctName,
      account_type: "taxable",
      ticker,
      quantity: qtyIdx !== -1 ? cleanNumber(r[qtyIdx]) : 0,
      cost_basis: costIdx !== -1 ? cleanNumber(r[costIdx]) : 0,
      current_value,
    });
    acct.positionCount += 1;
  }

  for (const acct of accountMap.values()) {
    if (acct.cashValue > 0) {
      acct.holdings.push({
        account_name: acct.accountName,
        account_type: "taxable",
        ticker: "CASH",
        quantity: acct.cashValue,
        cost_basis: acct.cashValue,
        current_value: acct.cashValue,
      });
    }
  }

  return accountMap.size > 0 ? [...accountMap.values()] : null;
}

// ---------------------------------------------------------------------------
// Vanguard parser
// ---------------------------------------------------------------------------

/** True if the text looks like a Vanguard positions export.
 *  Vanguard exports do not include cost basis. */
export function isVanguardExport(text: string): boolean {
  if (isSchwabExport(text)) return false;
  const head = text.slice(0, 3000).toLowerCase();
  return (
    head.includes("fund account number") ||
    head.includes("vanguard brokerage account") ||
    (head.includes("fund name") && head.includes("share price")) ||
    (head.includes('"ticker"') && head.includes("total value") && !head.includes("cost basis"))
  );
}

/** Parse a Vanguard positions CSV. Returns null if not a Vanguard export.
 *  Cost basis is always 0 — Vanguard does not include it in position exports. */
export function parseVanguardCsv(text: string, fileName: string): ParsedAccount[] | null {
  if (!isVanguardExport(text)) return null;

  const rawRows = (Papa.parse<string[]>(text, { skipEmptyLines: true }).data || []).filter(
    (r) => Array.isArray(r) && r.length > 0
  );

  const accounts: ParsedAccount[] = [];
  let i = 0;

  while (i < rawRows.length) {
    // Find the next data section's header row (contains "Ticker" or "Symbol" or "Fund Name").
    const relHeaderIdx = rawRows.slice(i).findIndex((r) =>
      r.some((c) => {
        const t = (c ?? "").trim().toLowerCase();
        return t === "ticker" || t === "symbol" || t === "fund name";
      })
    );
    if (relHeaderIdx === -1) break;

    const absHeaderIdx = i + relHeaderIdx;

    // Account name: look in the rows immediately before the header for an account label.
    let accountName = fileName.replace(/\.csv$/i, "");
    for (let j = absHeaderIdx - 1; j >= Math.max(0, absHeaderIdx - 6); j--) {
      const cell = (rawRows[j][0] ?? "").trim();
      const cell1 = (rawRows[j][1] ?? "").trim();
      if (/fund account number/i.test(cell) && cell1) {
        accountName = cell1;
        break;
      }
      if (cell && !/^(account number|date|as of)/i.test(cell)) {
        accountName = cell;
        break;
      }
    }

    const header = rawRows[absHeaderIdx].map((h) => (h ?? "").trim().toLowerCase());
    const colIdx = (names: string[]): number => {
      for (const name of names) {
        const idx = header.indexOf(name);
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const symIdx = colIdx(["ticker", "symbol"]);
    const descIdx = colIdx(["fund name", "name", "investment name"]);
    const qtyIdx = colIdx(["shares", "quantity", "share quantity"]);
    const valIdx = colIdx(["total value", "current value", "account value", "value"]);

    if (valIdx === -1) { i = absHeaderIdx + 1; continue; }

    const acct: ParsedAccount = {
      fileName,
      accountName,
      accountType: inferAccountType(accountName),
      holdings: [],
      cashValue: 0,
      positionCount: 0,
      meta: {},
    };

    i = absHeaderIdx + 1;
    while (i < rawRows.length) {
      const r = rawRows[i];
      const firstCell = (r[0] ?? "").trim();

      // Blank row or new account section marker — end of this section.
      if (!firstCell) { i++; break; }
      if (/fund account number|account number/i.test(firstCell)) break;

      const sym = symIdx !== -1 ? (r[symIdx] ?? "").trim() : "";
      const desc = descIdx !== -1 ? (r[descIdx] ?? "").trim() : "";
      const current_value = cleanNumber(r[valIdx]);

      if (!sym || sym === "--") {
        if (current_value > 0) acct.cashValue += current_value;
        i++;
        continue;
      }
      if (/^(total|subtotal)/i.test(sym) || /^(total|subtotal)/i.test(desc)) { i++; break; }
      if (current_value === 0) { i++; continue; }

      const ticker = sym.toUpperCase();
      acct.meta[ticker] = { description: desc, assetType: "" };
      acct.holdings.push({
        account_name: accountName,
        account_type: "taxable",
        ticker,
        quantity: qtyIdx !== -1 ? cleanNumber(r[qtyIdx]) : 0,
        cost_basis: 0, // Vanguard does not export cost basis
        current_value,
      });
      acct.positionCount += 1;
      i++;
    }

    if (acct.cashValue > 0) {
      acct.holdings.push({
        account_name: accountName,
        account_type: "taxable",
        ticker: "CASH",
        quantity: acct.cashValue,
        cost_basis: acct.cashValue,
        current_value: acct.cashValue,
      });
    }

    if (acct.holdings.length > 0) accounts.push(acct);
  }

  return accounts.length > 0 ? accounts : null;
}

// ---------------------------------------------------------------------------
// Template CSV parser (fallback)
// ---------------------------------------------------------------------------

const ACCOUNT_TYPES_SET = new Set(["taxable", "tax_deferred", "tax_free"]);

/** Fallback parser for the simple canonical CSV template (account_name, account_type, ticker,
 *  quantity, cost_basis, current_value). Used when the file is not a Schwab export. */
export function parseTemplateCsv(text: string, fileName: string): ParsedAccount[] {
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const groups = new Map<string, ParsedAccount>();
  for (const row of res.data) {
    const ticker = (row.ticker ?? "").trim().toUpperCase();
    if (!ticker) continue;
    const account_name = (row.account_name ?? "").trim() || "Unnamed";
    const typeRaw = (row.account_type ?? "").trim();
    const account_type = (ACCOUNT_TYPES_SET.has(typeRaw) ? typeRaw : inferAccountType(account_name)) as import("../api/client").AccountType;
    if (!groups.has(account_name)) {
      groups.set(account_name, {
        fileName,
        accountName: account_name,
        accountType: account_type,
        holdings: [],
        cashValue: 0,
        positionCount: 0,
        meta: {},
      });
    }
    const acct = groups.get(account_name)!;
    const current_value = Number(row.current_value) || 0;
    if (ticker === "CASH") acct.cashValue += current_value;
    acct.holdings.push({
      account_name,
      account_type,
      ticker,
      quantity: Number(row.quantity) || 0,
      cost_basis: Number(row.cost_basis) || 0,
      current_value,
    });
    if (ticker !== "CASH") acct.positionCount += 1;
  }
  return [...groups.values()];
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
