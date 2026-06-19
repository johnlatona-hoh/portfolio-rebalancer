import { useState } from "react";
import type { AnalyzeResponse, BergerTip } from "../api/client";
import { getBergerTips } from "../api/client";

// ---- Curated principles (always shown) ----
const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: "Keep costs ruthlessly low",
    body: "Every basis point in fees compounds against you. Prioritize broad index ETFs with expense ratios under 0.10%. Over 30 years, a 1% fee difference on a $1M portfolio costs ~$300k.",
  },
  {
    title: "Own the whole market — don't predict it",
    body: "Total-market index funds (VTI, VXUS) capture every dollar of economic growth without picking winners. Active management rarely beats the index after fees and taxes.",
  },
  {
    title: "Asset location is free alpha",
    body: "Put tax-inefficient assets (bonds, REITs) in tax-deferred accounts; hold tax-efficient equity in taxable. This alone can be worth 0.5–1% per year with no added risk.",
  },
  {
    title: "Rebalance inside tax-advantaged accounts first",
    body: "Your IRA and 401(k) can buy and sell freely with no taxable event. Use them to rebalance before touching your brokerage — save taxable-account trades for harvest losses.",
  },
  {
    title: "Your savings rate matters more than your returns",
    body: "A 2% higher savings rate beats a 2% higher return, especially in the early years. Automate your contributions before optimizing your allocation.",
  },
  {
    title: "Simplicity beats complexity",
    body: "A 3-fund portfolio (total US stock + total international + total bond) beats most sophisticated strategies after costs, taxes, and behavioral mistakes. You can add complexity, but rarely should.",
  },
  {
    title: "Never try to time the market",
    body: "Missing the 10 best trading days in a decade can cut returns in half. Stay invested, rebalance mechanically, and ignore the noise. The best time to invest was yesterday.",
  },
];

// ---- Rule-based context tips ----
function contextTips(analysis: AnalyzeResponse): { title: string; body: string }[] {
  const tips: { title: string; body: string }[] = [];
  const { blended, by_account, grade } = analysis;

  // High cash
  const cashPct = blended.find((b) => b.asset_class === "Cash")?.pct ?? 0;
  if (cashPct > 5) {
    tips.push({
      title: `${cashPct.toFixed(0)}% in cash — consider deploying it`,
      body: "Cash drag is real. Money-market funds pay less than the long-run stock premium. Consider moving excess cash into your target allocation incrementally.",
    });
  }

  // Missing international
  const intlPct = blended.find((b) => b.asset_class === "International")?.pct ?? 0;
  if (intlPct < 5 && analysis.total_value > 10_000) {
    tips.push({
      title: "No international exposure — diversify globally",
      body: "US stocks are ~60% of world-market cap. International (VXUS, VEU) diversifies currency, country, and sector risk. Most target-date funds allocate 20–40% internationally.",
    });
  }

  // Taxable bonds in taxable
  if (grade.misplaced_count > 0) {
    tips.push({
      title: "Move tax-inefficient assets to tax-sheltered accounts",
      body: `Your grade is ${grade.score}/10. Moving bonds and REITs from taxable to your IRA or 401(k) improves the score and reduces your annual tax drag — see the details panel above.`,
    });
  }

  // Tax-deferred accounts holding efficient equity — minor tip
  const hasTaxDeferred = by_account.some((a) => a.account_type === "tax_deferred");
  const hasRoth = by_account.some((a) => a.account_type === "tax_free");
  if (hasTaxDeferred && hasRoth) {
    tips.push({
      title: "Prioritize high-growth equity in your Roth",
      body: "Roth withdrawals are tax-free, so assets with the highest expected growth (small-cap, international) compound best there. Use your traditional IRA for bonds and REITs.",
    });
  }

  return tips;
}

interface Props {
  analysis: AnalyzeResponse;
}

export default function TipsBox({ analysis }: Props) {
  const [aiTips, setAiTips] = useState<BergerTip[] | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const ctx = contextTips(analysis);
  const displayed = showAll ? PRINCIPLES : PRINCIPLES.slice(0, 3);

  async function loadAiTips() {
    setLoadingAi(true);
    try {
      const summary = {
        total_value: analysis.total_value,
        allocations: analysis.blended.map((b) => ({
          asset_class: b.asset_class,
          pct: b.pct,
          target_pct: b.target_pct,
        })),
        accounts: analysis.by_account.map((a) => ({ type: a.account_type })),
        grade: { score: analysis.grade.score, misplaced_count: analysis.grade.misplaced_count },
      };
      const tips = await getBergerTips(summary);
      setAiTips(tips);
    } finally {
      setLoadingAi(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* context tips — rule-based */}
      {ctx.length > 0 && (
        <div>
          <div className="text-xs uppercase text-muted mb-2">For your portfolio</div>
          <div className="space-y-3">
            {ctx.map((t, i) => (
              <div key={i} className="border-l-2 pl-3" style={{ borderColor: "#d8a657" }}>
                <div className="text-sm font-medium">{t.title}</div>
                <div className="text-xs text-muted mt-0.5 leading-relaxed">{t.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* curated principles */}
      <div>
        <div className="text-xs uppercase text-muted mb-2">Core principles</div>
        <div className="space-y-3">
          {displayed.map((t, i) => (
            <div key={i} className="border-l-2 border-border pl-3">
              <div className="text-sm font-medium">{t.title}</div>
              <div className="text-xs text-muted mt-0.5 leading-relaxed">{t.body}</div>
            </div>
          ))}
        </div>
        {PRINCIPLES.length > 3 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-muted hover:text-fg underline mt-3"
          >
            {showAll ? "Show fewer" : `Show all ${PRINCIPLES.length} principles`}
          </button>
        )}
      </div>

      {/* AI deep-dive */}
      <div className="pt-2 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase text-muted">AI deep-dive (Gemini)</span>
          <button
            onClick={loadAiTips}
            disabled={loadingAi}
            className="text-xs px-3 py-1 rounded bg-accent hover:bg-accent-hover disabled:opacity-50"
          >
            {loadingAi ? "Thinking…" : aiTips ? "Refresh" : "Get personalized tips"}
          </button>
        </div>

        {aiTips === null && (
          <p className="text-xs text-muted">
            Get 3–4 portfolio-specific tips written in Rob Berger's plain-English style,
            powered by Gemini AI.
          </p>
        )}
        {aiTips !== null && aiTips.length === 0 && (
          <p className="text-xs text-muted">
            AI tips unavailable (no Gemini API key configured on the server).
          </p>
        )}
        {aiTips && aiTips.length > 0 && (
          <div className="space-y-4">
            {aiTips.map((t, i) => (
              <div key={i} className="border-l-2 border-accent pl-3">
                <div className="text-sm font-medium">{t.title}</div>
                <div className="text-xs text-muted mt-0.5 leading-relaxed">{t.body}</div>
                {(t.advantage || t.disadvantage) && (
                  <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                    {t.advantage && (
                      <div>
                        <span className="text-good">+ </span>
                        <span className="text-muted">{t.advantage}</span>
                      </div>
                    )}
                    {t.disadvantage && (
                      <div>
                        <span className="text-warn">- </span>
                        <span className="text-muted">{t.disadvantage}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
