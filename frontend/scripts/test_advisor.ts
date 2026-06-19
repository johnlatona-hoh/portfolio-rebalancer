// Live AI-advisor test: analyze the real portfolio, then ask Gemini for insights.
// Run (backend up, GEMINI_API_KEY set): node --experimental-strip-types scripts/test_advisor.ts
import { readFileSync } from "node:fs";
import { parseSchwabCsv, holdingsForAccount } from "../src/utils/schwabParse.ts";

const DIR = "C:/Users/johnl/Downloads/FINANCE/AI Investment Rebalance/06.18.26-eod";
const files = [
  "JOINT - John-Julia-Positions-2026-06-18-170907.csv",
  "Rollover IRA-Positions-2026-06-18-170933.csv",
  "Roth Contributory IRA-Positions-2026-06-18-170941.csv",
];
const holdings = files.flatMap((f) =>
  holdingsForAccount(parseSchwabCsv(readFileSync(`${DIR}/${f}`, "utf-8"), f)!)
);
const targets = {
  "US Stock": 40, International: 18, "Muni Bond": 8, "Taxable Bond": 14,
  REITs: 5, Cash: 3, "Gold & Commodities": 4, Crypto: 4, "Other Alternatives": 4,
};

const a = await (await fetch("http://127.0.0.1:8000/portfolio/analyze", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ holdings, targets }),
})).json();

const summary = {
  total_value: a.total_value,
  allocations: a.blended,
  accounts: a.by_account.map((x: any) => ({ type: x.account_type, by_class: x.by_class })),
  grade: a.grade,
};

const res = await fetch("http://127.0.0.1:8000/advisor/insights", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ summary }),
});
const data = await res.json();
console.log("insights returned:", data.insights.length);
data.insights.forEach((s: string, i: number) => console.log(`\n${i + 1}. ${s}`));
