// Functional check of the Schwab parser against the real export files.
// Run: node --experimental-strip-types scripts/test_schwab.ts
import { readFileSync } from "node:fs";
import { parseSchwabCsv } from "../src/utils/schwabParse.ts";

const DIR = "C:/Users/johnl/Downloads/FINANCE/AI Investment Rebalance/06.18.26-eod";
const files = [
  "JOINT - John-Julia-Positions-2026-06-18-170907.csv",
  "Rollover IRA-Positions-2026-06-18-170933.csv",
  "Roth Contributory IRA-Positions-2026-06-18-170941.csv",
];

let failures = 0;
function check(label: string, cond: boolean, detail: string) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}  ${detail}`);
  if (!cond) failures++;
}

for (const f of files) {
  const text = readFileSync(`${DIR}/${f}`, "utf-8");
  const acct = parseSchwabCsv(text, f);
  if (!acct) {
    console.log(`FAIL  ${f}: not parsed as Schwab`);
    failures++;
    continue;
  }
  const totalMkt = acct.holdings.reduce((s, h) => s + h.current_value, 0);
  console.log(
    `\n${f}\n  name="${acct.accountName}" type=${acct.accountType} positions=${acct.positionCount} cash=${acct.cashValue} total=${totalMkt.toFixed(2)}`
  );
}

// targeted assertions
const joint = parseSchwabCsv(readFileSync(`${DIR}/${files[0]}`, "utf-8"), files[0])!;
check("JOINT type", joint.accountType === "taxable", joint.accountType);
check("JOINT cash", Math.abs(joint.cashValue - 697228.37) < 0.01, String(joint.cashValue));
check("JOINT positions", joint.positionCount === 16, String(joint.positionCount));
check(
  "JOINT VOO value",
  Math.abs((joint.holdings.find((h) => h.ticker === "VOO")?.current_value ?? 0) - 377887.1) < 0.01,
  String(joint.holdings.find((h) => h.ticker === "VOO")?.current_value)
);

const ira = parseSchwabCsv(readFileSync(`${DIR}/${files[1]}`, "utf-8"), files[1])!;
check("Rollover type", ira.accountType === "tax_deferred", ira.accountType);
check("Rollover positions", ira.positionCount === 8, String(ira.positionCount));
check(
  "Rollover EFV cost_basis=0 (was N/A)",
  ira.holdings.find((h) => h.ticker === "EFV")?.cost_basis === 0,
  String(ira.holdings.find((h) => h.ticker === "EFV")?.cost_basis)
);

const roth = parseSchwabCsv(readFileSync(`${DIR}/${files[2]}`, "utf-8"), files[2])!;
check("Roth type", roth.accountType === "tax_free", roth.accountType);
check("Roth positions", roth.positionCount === 7, String(roth.positionCount));
check("Roth cash", Math.abs(roth.cashValue - 1.87) < 0.01, String(roth.cashValue));

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
