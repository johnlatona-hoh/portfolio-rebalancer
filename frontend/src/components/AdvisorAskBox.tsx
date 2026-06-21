import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { askAdvisor, type AnalyzeResponse, type ProjectResponse, type AdvisorTurn } from "../api/client";

interface Props {
  analysis: AnalyzeResponse;
  projection: ProjectResponse | null;
  horizon: number;
  contribution: number;
}

const SUGGESTED = [
  "Am I too concentrated, and what would you change?",
  "Is my asset location tax-efficient? What should I move?",
  "Will this portfolio support the retirement income I want?",
];

/**
 * Free-form, conversational Q&A answered as a fee-only RIA / fiduciary. Sends an anonymized
 * snapshot of the current analysis + projection with each question so the model reasons about
 * the user's actual numbers. Keeps a local conversation thread for follow-up context.
 */
export default function AdvisorAskBox({ analysis, projection, horizon, contribution }: Props) {
  const [turns, setTurns] = useState<AdvisorTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  function buildSummary() {
    const tail = projection?.points?.[projection.points.length - 1] ?? null;
    return {
      total_value: analysis.total_value,
      allocations: analysis.blended,
      accounts: analysis.by_account.map((a) => ({ type: a.account_type, by_class: a.by_class })),
      grade: analysis.grade,
      risk: analysis.risk,
      tilts: analysis.tilts?.dimensions.map((d) => ({
        dimension: d.label,
        verdict: d.verdict,
        breakdown: d.breakdown,
      })),
      projection: tail
        ? {
            horizon_months: horizon,
            monthly_contribution: contribution,
            ending_p10: tail.p10,
            ending_p50: tail.p50,
            ending_p90: tail.p90,
          }
        : null,
    };
  }

  const mutation = useMutation({
    mutationFn: (question: string) => askAdvisor(buildSummary(), question, turns),
    onSuccess: (answer, question) => {
      if (!answer) {
        // Empty answer => no GEMINI_API_KEY on the server.
        setNotConfigured(true);
        return;
      }
      setTurns((prev) => [
        ...prev,
        { role: "user", content: question },
        { role: "advisor", content: answer },
      ]);
    },
    onError: (e: { response?: { data?: { detail?: string } }; message?: string }) =>
      setErr(e?.response?.data?.detail ?? e?.message ?? "Couldn't reach the advisor."),
  });

  function submit(question: string) {
    const q = question.trim();
    if (!q || mutation.isPending) return;
    setErr(null);
    setNotConfigured(false);
    setDraft("");
    mutation.mutate(q);
  }

  function clearConversation() {
    setTurns([]);
    setErr(null);
    setNotConfigured(false);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Ask a question about your portfolio. Answers come from an AI acting as a thoughtful,
        fee-only fiduciary, using your current allocation, risk metrics, and projection.
      </p>

      {/* Conversation thread */}
      {turns.length > 0 && (
        <div className="space-y-3">
          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="text-sm">
                <span className="text-xs uppercase tracking-wide text-muted">You</span>
                <p className="mt-0.5">{t.content}</p>
              </div>
            ) : (
              <div key={i} className="text-sm rounded-lg border border-border bg-surface p-3">
                <span className="text-xs uppercase tracking-wide text-accent">Advisor</span>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{t.content}</p>
              </div>
            )
          )}
        </div>
      )}

      {mutation.isPending && (
        <p className="text-sm text-muted">Thinking…</p>
      )}
      {err && <p className="text-sm text-bad">{err}</p>}
      {notConfigured && (
        <p className="text-sm text-muted">
          The AI advisor isn't configured on this server (no API key).
        </p>
      )}

      {/* Suggested prompts (only before the first question) */}
      {turns.length === 0 && !mutation.isPending && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTED.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              className="text-xs px-2 py-1 rounded-full border border-border text-muted hover:text-fg hover:bg-surface"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit(draft);
            }
          }}
          rows={2}
          placeholder={turns.length ? "Ask a follow-up…" : "Type your question…"}
          className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-fg resize-y"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => submit(draft)}
            disabled={mutation.isPending || !draft.trim()}
            className="text-sm px-3 py-1.5 rounded bg-accent hover:bg-accent-hover disabled:opacity-50"
          >
            {mutation.isPending ? "Thinking…" : "Ask"}
          </button>
          <span className="text-xs text-muted">Ctrl/⌘ + Enter to send</span>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={clearConversation}
              className="ml-auto text-xs text-muted hover:text-fg hover:underline"
            >
              Clear conversation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
