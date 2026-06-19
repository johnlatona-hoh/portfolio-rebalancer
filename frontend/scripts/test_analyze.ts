// End-to-end: parse the three real Schwab files, send to the live /analyze API,
// and print the blended allocation, grade, and any unknown tickers.
// Run (backend must be up): node --experimental-strip-types scripts/test_analyze.ts
import { readFileSync } from "node:fs";
import { parseSchwabCsv, holdingsForAccount } from "../src/utils/schwabParse.ts";

const DIR = "C:/Users/johnl/Downloads/FINANCE/AI Investment Rebalance/06.18.26-eod";
const files = [
  "JOINT - John-Julia-Positions-2026-06-18-170907.csv",
  "Rollover IRA-Positions-2026-06-18-170933.csv",
  "Roth Contributory IRA-Positions-2026-06-18-170941.csv",
];

const holdings = files.flatMap((f) => {
  const acct = parseSchwabCsv(readFileSync(`${DIR}/${f}`, "utf-8"), f)!;
  return holdingsForAccount(acct);
});

const targets = {
  "US Stock": 40,
  International: 18,
  "Muni Bond": 8,
  "Taxable Bond": 14,
  REITs: 5,
  Cash: 3,
  "Gold & Commodities": 4,
  Crypto: 4,
  "Other Alternatives": 4,
};

const res = await fetch("http://127.0.0.1:8000/portfolio/analyze", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ holdings, targets }),
});
const data = await res.json();

console.log("total_value:", data.total_value);
console.log("unknown_tickers:", data.unknown_tickers);
console.log("\nblended allocation:");
for (const b of data.blended) {
  console.log(
    `  ${b.asset_class.padEnd(14)} ${String(b.pct).padStart(6)}%  (tgt ${b.target_pct}%)  delta ${b.delta_value}`
  );
}
console.log("\ngrade:", data.grade.grade, `(${data.grade.misplaced_count} misplaced of ${data.grade.total_holdings})`);
for (const n of data.grade.notes) console.log("  -", n);
console.log("\ntrades:", data.trades.length);
for (const t of data.trades.slice(0, 12)) {
  console.log(`  ${t.account_name.padEnd(22)} ${t.action.padEnd(4)} ${t.asset_class.padEnd(13)} ${String(t.amount).padStart(12)}  ${t.tax_note}`);
}
