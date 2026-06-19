import { fmtMoney } from "../utils/money";

interface Props {
  value: number;           // 0..100 (maps to gain_aversion 0..1)
  onChange: (v: number) => void;
  realizedGains: number;   // from last analysis
  maxDriftPct: number;     // from last analysis
}

/** Slides between "Best allocation" (g=0) and "Zero realized gains" (g=1).
 *  Shows a live trade-off note. */
export default function StrategySlider({ value, onChange, realizedGains, maxDriftPct }: Props) {
  const g = value / 100;
  const isFull = value === 0;
  const isZero = value === 100;

  return (
    <div>
      <div className="flex justify-between text-xs text-muted mb-1">
        <span>Best allocation</span>
        <span>Zero realized gains</span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-amber-500"
      />

      {/* trade-off note */}
      <div className="mt-2 text-xs text-muted leading-relaxed">
        {isFull && (
          <span>
            <strong className="text-fg">Best allocation mode:</strong> the engine freely sells
            overweight holdings regardless of embedded gains. You stay closest to your target
            but may realize taxable capital gains.
          </span>
        )}
        {isZero && (
          <span>
            <strong className="text-fg">Zero realized gains:</strong> no appreciated taxable
            holdings are sold. You preserve capital-gains tax savings but may drift{" "}
            {maxDriftPct > 0 ? <strong className="text-warn">{maxDriftPct.toFixed(1)}%</strong> : "slightly"}{" "}
            off target.
          </span>
        )}
        {!isFull && !isZero && (
          <span>
            At <strong className="text-fg">{value}%</strong> gain avoidance the plan caps
            realized gains at{" "}
            <strong className="text-fg">{fmtMoney(realizedGains)}</strong>{" "}
            (vs unconstrained). Remaining drift:{" "}
            <strong className={maxDriftPct > 3 ? "text-warn" : "text-fg"}>
              {maxDriftPct.toFixed(1)}%
            </strong>{" "}
            off target.
          </span>
        )}
      </div>

      {/* advantage / disadvantage */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-muted uppercase mb-1">Advantage</div>
          <div className="text-good">
            {g < 0.5
              ? "Minimizes allocation drift — stays closest to target."
              : "Avoids capital-gains taxes on appreciated lots."}
          </div>
        </div>
        <div>
          <div className="text-muted uppercase mb-1">Trade-off</div>
          <div className="text-warn">
            {g < 0.5
              ? "May trigger taxable capital-gains events when selling appreciated lots."
              : "Leaves portfolio off-target; drift compounds over time."}
          </div>
        </div>
      </div>
    </div>
  );
}
