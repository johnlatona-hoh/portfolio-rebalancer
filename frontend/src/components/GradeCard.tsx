import { useState } from "react";
import type { LocationGrade } from "../api/client";
import { fmtMoney } from "../utils/money";

function scoreHex(score: number): string {
  if (score >= 9) return "#4caf7d";  // green
  if (score >= 7) return "#a6c270";  // yellow-green
  if (score >= 5) return "#d8a657";  // amber
  if (score >= 3) return "#c87a3a";  // orange
  return "#c0544a";                  // red
}

function scoreLabel(score: number): string {
  if (score >= 9) return "Excellent";
  if (score >= 7) return "Good";
  if (score >= 5) return "Fair";
  if (score >= 3) return "Poor";
  return "Very poor";
}

interface Props {
  grade: LocationGrade;
}

/** Shows the 1-10 tax-location grade with an expandable methodology/details section. */
export default function GradeCard({ grade }: Props) {
  const [open, setOpen] = useState(false);
  const color = scoreHex(grade.score);

  return (
    <div>
      <div className="text-xs uppercase text-muted">Tax-Location Grade</div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-3xl font-bold" style={{ color }}>
          {grade.score}
        </span>
        <span className="text-base font-normal text-muted">/10 — {scoreLabel(grade.score)}</span>
      </div>

      {grade.misplaced_count > 0 ? (
        <p className="text-xs mt-1" style={{ color: "#d8a657" }}>
          {grade.misplaced_count} holding{grade.misplaced_count !== 1 ? "s" : ""} misplaced
          {grade.misplaced_value > 0 && ` — ${fmtMoney(grade.misplaced_value)} tax-inefficient in taxable`}
        </p>
      ) : (
        <p className="text-xs mt-1" style={{ color: "#4caf7d" }}>
          All tax-inefficient assets correctly sheltered
        </p>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-muted hover:text-fg underline mt-2 block"
      >
        {open ? "Hide details" : "Show details & methodology"}
      </button>

      {open && (
        <div className="mt-3 space-y-3 text-xs">
          {grade.reasons.length > 0 && (
            <ul className="list-disc pl-4 space-y-1" style={{ color: "#d8a657" }}>
              {grade.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
          <p className="text-muted leading-relaxed">{grade.methodology}</p>
        </div>
      )}
    </div>
  );
}
