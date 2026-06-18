import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import { listTags, type Holding, type AccountType } from "../api/client";
import { usePortfolio } from "../state/portfolio";
import { ASSET_CLASSES } from "../utils/assetClass";
import TickerTagEditor from "../components/TickerTagEditor";

const TEMPLATE =
  "account_name,account_type,ticker,quantity,cost_basis,current_value\n" +
  "Brokerage,taxable,VTI,100,18000,28000\n" +
  "Rollover IRA,tax_deferred,BND,200,16000,15500\n" +
  "Roth IRA,tax_free,VXUS,150,7500,9000\n" +
  "HSA,tax_free,VTI,20,4000,5600\n";

const ACCOUNT_TYPES: AccountType[] = ["taxable", "tax_deferred", "tax_free"];

const DEFAULT_TARGETS: Record<string, number> = {
  "US Stock": 45,
  International: 20,
  Bond: 25,
  REITs: 5,
  Cash: 3,
  Alternatives: 2,
};

export default function SetupPage() {
  const nav = useNavigate();
  const { holdings, setHoldings, targets, setTargets } = usePortfolio();
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [localTargets, setLocalTargets] = useState<Record<string, number>>(
    Object.keys(targets).length ? targets : DEFAULT_TARGETS
  );

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "portfolio_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File) {
    setParseErrors([]);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        const errors: string[] = [];
        const parsed: Holding[] = [];
        (res.data as any[]).forEach((row, idx) => {
          const ln = idx + 2;
          const ticker = (row.ticker ?? "").trim().toUpperCase();
          const acctType = (row.account_type ?? "").trim();
          if (!ticker) return; // skip blank
          if (!ACCOUNT_TYPES.includes(acctType as AccountType)) {
            errors.push(`Row ${ln} (${ticker}): account_type "${acctType}" invalid.`);
            return;
          }
          const cv = Number(row.current_value);
          if (Number.isNaN(cv)) {
            errors.push(`Row ${ln} (${ticker}): current_value not a number.`);
            return;
          }
          parsed.push({
            account_name: (row.account_name ?? "").trim() || "Unnamed",
            account_type: acctType as AccountType,
            ticker,
            quantity: Number(row.quantity) || 0,
            cost_basis: Number(row.cost_basis) || 0,
            current_value: cv,
          });
        });

        if (errors.length) {
          setParseErrors(errors);
          return;
        }
        setHoldings(parsed);

        // detect unknown tickers against the server tag map
        const tags = await listTags();
        const known = new Set(tags.map((t) => t.ticker));
        const missing = [...new Set(parsed.map((h) => h.ticker))].filter((t) => !known.has(t));
        setUnknown(missing);
      },
      error: (e) => setParseErrors([e.message]),
    });
  }

  const targetSum = Object.values(localTargets).reduce((a, b) => a + b, 0);

  function proceed() {
    setTargets(localTargets);
    nav("/dashboard");
  }

  return (
    <div className="max-w-3xl space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-2">1. Upload your holdings</h2>
        <p className="text-sm text-muted mb-3">
          Fill out the CSV template (one row per holding) and upload it. Data stays in your
          browser — nothing is saved unless you explicitly create a snapshot.
        </p>
        <div className="flex gap-3 items-center">
          <button
            onClick={downloadTemplate}
            className="text-sm px-3 py-2 rounded border border-border hover:bg-card"
          >
            Download CSV template
          </button>
          <label className="text-sm px-3 py-2 rounded bg-accent hover:bg-accent-hover cursor-pointer">
            Upload CSV
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
          {holdings.length > 0 && (
            <span className="text-sm text-good">{holdings.length} holdings loaded</span>
          )}
        </div>
        {parseErrors.length > 0 && (
          <ul className="mt-3 text-sm text-bad list-disc pl-5">
            {parseErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </section>

      {unknown.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-2">2. Classify unknown tickers</h2>
          <TickerTagEditor tickers={unknown} onAllResolved={() => setUnknown([])} />
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-2">
          {unknown.length > 0 ? "3" : "2"}. Set your target allocation
        </h2>
        <div className="space-y-2 max-w-md">
          {ASSET_CLASSES.map((c) => (
            <div key={c} className="flex items-center gap-3">
              <label className="w-32 text-sm">{c}</label>
              <input
                type="number"
                min={0}
                max={100}
                value={localTargets[c] ?? 0}
                onChange={(e) =>
                  setLocalTargets((t) => ({ ...t, [c]: Number(e.target.value) }))
                }
                className="w-24 bg-surface border border-border rounded px-2 py-1 text-sm"
              />
              <span className="text-muted text-sm">%</span>
            </div>
          ))}
          <div className={`text-sm mt-2 ${targetSum === 100 ? "text-good" : "text-warn"}`}>
            Total: {targetSum}% {targetSum !== 100 && "(should equal 100%)"}
          </div>
        </div>
      </section>

      <button
        onClick={proceed}
        disabled={holdings.length === 0 || unknown.length > 0}
        className="px-5 py-2.5 rounded bg-accent hover:bg-accent-hover disabled:opacity-40"
      >
        View Dashboard →
      </button>
    </div>
  );
}
