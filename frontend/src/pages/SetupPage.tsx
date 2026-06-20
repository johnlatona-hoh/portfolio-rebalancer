import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { listTags, autoClassifyTags, type Holding, type AccountType } from "../api/client";
import { usePortfolio } from "../state/portfolio";
import { ASSET_CLASSES, ACCOUNT_TYPE_LABELS } from "../utils/assetClass";
import { fmtMoney } from "../utils/money";
import { downloadText } from "../utils/download";
import {
  parseSchwabCsv,
  parseFidelityCsv,
  parseVanguardCsv,
  parseTemplateCsv,
  holdingsForAccount,
  inferAccountType,
  type ParsedAccount,
  type TickerMeta,
} from "../utils/schwabParse";
import TickerTagEditor from "../components/TickerTagEditor";

const TEMPLATE =
  "account_name,account_type,ticker,quantity,cost_basis,current_value\n" +
  "Brokerage,taxable,VTI,100,18000,28000\n" +
  "Rollover IRA,tax_deferred,BND,200,16000,15500\n" +
  "Roth IRA,tax_free,VXUS,150,7500,9000\n" +
  "HSA,tax_free,VTI,20,4000,5600\n";

const ACCOUNT_TYPES: AccountType[] = ["taxable", "tax_deferred", "tax_free"];

const DEFAULT_TARGETS: Record<string, number> = {
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

export default function SetupPage() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { accounts, setAccounts, holdings, targets, setTargets, reset } = usePortfolio();
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [classifying, setClassifying] = useState(false);
  const [localTargets, setLocalTargets] = useState<Record<string, number>>(
    Object.keys(targets).length ? targets : DEFAULT_TARGETS
  );

  const totalCash = useMemo(() => accounts.reduce((s, a) => s + a.cashValue, 0), [accounts]);
  const totalValue = useMemo(
    () => holdings.reduce((s, h) => s + h.current_value, 0),
    [holdings]
  );

  function downloadTemplate() {
    downloadText(TEMPLATE, "portfolio_template.csv");
  }

  /** Find unknown tickers and auto-classify them from their broker descriptions
   *  (no manual tagging, no AI). Only falls back to the manual editor if a ticker
   *  has no description to classify from. */
  async function resolveUnknown(accts: ParsedAccount[]) {
    const hs = accts.flatMap(holdingsForAccount);
    const metaMap: Record<string, TickerMeta> = Object.assign({}, ...accts.map((a) => a.meta));

    const tags = await listTags();
    const known = new Set(tags.map((t) => t.ticker));
    let missing = [...new Set(hs.map((h) => h.ticker))].filter((t) => !known.has(t));

    if (missing.length) {
      setClassifying(true);
      try {
        await autoClassifyTags(
          missing.map((t) => ({
            ticker: t,
            description: metaMap[t]?.description ?? "",
            asset_type: metaMap[t]?.assetType ?? "",
          }))
        );
        // Invalidate the shared tags cache so DashboardPage picks up newly classified tickers.
        await queryClient.invalidateQueries({ queryKey: ["tags"] });
        const freshTags = await listTags();
        const after = new Set(freshTags.map((t) => t.ticker));
        missing = missing.filter((t) => !after.has(t));
      } finally {
        setClassifying(false);
      }
    }
    setUnknown(missing);
  }

  async function handleFiles(files: FileList) {
    setParseErrors([]);
    const errors: string[] = [];
    const newAccounts: ParsedAccount[] = [];

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
                errors.push(`${file.name}: no recognizable holdings (not a Schwab, Fidelity, Vanguard, or template export).`);
              } else {
                newAccounts.push(...tmpl);
              }
            }
          }
        }
      } catch (e: any) {
        errors.push(`${file.name}: ${e?.message ?? "could not read file"}`);
      }
    }

    if (errors.length) setParseErrors(errors);
    if (newAccounts.length) {
      const merged = [...accounts, ...newAccounts];
      setAccounts(merged);
      await resolveUnknown(merged);
    }
  }

  function setAccountType(idx: number, type: AccountType) {
    setAccounts(accounts.map((a, i) => (i === idx ? { ...a, accountType: type } : a)));
  }

  function removeAccount(idx: number) {
    setAccounts(accounts.filter((_, i) => i !== idx));
  }

  function clearAll() {
    reset();
    setUnknown([]);
    setParseErrors([]);
    setLocalTargets(DEFAULT_TARGETS);
  }

  const targetSum = Object.values(localTargets).reduce((a, b) => a + b, 0);
  const cashPct = totalValue > 0 ? (totalCash / totalValue) * 100 : 0;

  function proceed() {
    setTargets(localTargets);
    nav("/dashboard");
  }

  return (
    <div className="max-w-3xl space-y-8">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">1. Upload your holdings</h2>
          {accounts.length > 0 && (
            <button onClick={clearAll} className="text-sm px-3 py-1.5 rounded border border-border hover:bg-card">
              Clear all
            </button>
          )}
        </div>
        <p className="text-sm text-muted mb-3">
          Upload your <strong>Schwab, Fidelity, or Vanguard position exports</strong> (one CSV per
          account) — the broker is detected automatically and tickers are classified from their
          descriptions. Select several at once. Data stays in your browser; nothing is saved unless
          you create a snapshot. (A simple CSV template is also supported.)
        </p>
        <div className="flex gap-3 items-center flex-wrap">
          <label className="text-sm px-3 py-2 rounded bg-accent hover:bg-accent-hover cursor-pointer">
            Upload CSV(s)
            <input
              type="file"
              accept=".csv"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </label>
          <button
            onClick={downloadTemplate}
            className="text-sm px-3 py-2 rounded border border-border hover:bg-card"
          >
            Download template
          </button>
          {accounts.length > 0 && (
            <span className="text-sm text-good">
              {accounts.length} account{accounts.length > 1 ? "s" : ""},{" "}
              {holdings.filter((h) => h.ticker !== "CASH").length} positions ·{" "}
              {fmtMoney(totalValue)}
            </span>
          )}
          {classifying && <span className="text-sm text-muted">classifying tickers…</span>}
        </div>
        {parseErrors.length > 0 && (
          <ul className="mt-3 text-sm text-bad list-disc pl-5">
            {parseErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}

        {accounts.length > 0 && (
          <div className="mt-4 space-y-2">
            {accounts.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2 rounded border border-border text-sm"
              >
                <span className="flex-1 font-medium">{a.accountName}</span>
                <span className="text-muted">{a.positionCount} positions</span>
                {a.cashValue > 0 && (
                  <span className="text-warn">+ {fmtMoney(a.cashValue)} cash</span>
                )}
                <select
                  value={a.accountType}
                  onChange={(e) => setAccountType(i, e.target.value as AccountType)}
                  className="bg-surface border border-border rounded px-2 py-1"
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <button onClick={() => removeAccount(i)} className="text-bad px-1">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {totalCash > 0 && (
          <div className="mt-3 p-3 rounded border border-warn/50 bg-warn/10 text-sm text-warn">
            <strong>{fmtMoney(totalCash)} in cash</strong> ({cashPct.toFixed(1)}% of the
            portfolio) is counted as a Cash position. If some of this is uninvested dry powder,
            your Cash target below determines how much the rebalancer suggests deploying.
          </div>
        )}
      </section>

      {unknown.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-2">2. Classify remaining tickers</h2>
          <p className="text-sm text-muted mb-2">
            These had no description to auto-classify from. Set them manually.
          </p>
          <TickerTagEditor tickers={unknown} onAllResolved={() => resolveUnknown(accounts)} />
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
