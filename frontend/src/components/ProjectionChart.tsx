import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { ProjectionPoint } from "../api/client";
import { fmtMoney, fmtCompact } from "../utils/money";

interface Props {
  points: ProjectionPoint[];
  height?: number;
  realDollars?: boolean;      // label axes as "today's $" vs "future $"
  netOfFees?: boolean;        // returns shown after subtracting expense ratios
  monthlyContribution?: number; // >0 contributing, <0 withdrawing
}

const MEDIAN_COLOR = "#f5a623";   // bright orange — median (p50)
const FAN_COLOR = "#6b8cba";      // muted blue — p10-p90 fan
const DET_COLOR = "#4caf7d";      // green — steady/deterministic return

/** Monte Carlo fan chart: p10–p90 shaded band, distinct amber median, dashed deterministic. */
export default function ProjectionChart({
  points,
  height = 260,
  realDollars = true,
  netOfFees = false,
  monthlyContribution = 0,
}: Props) {
  const data = points.map((p) => ({
    year: +(p.month / 12).toFixed(2),
    p10: p.p10,
    band: p.p90 - p.p10,
    p50: p.p50,
    deterministic: p.deterministic,
  }));

  const lastData = data[data.length - 1];
  const lastPoint = points[points.length - 1];
  const horizonYears = lastData ? lastData.year : 0;

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 12, right: 64, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3c" />
          <XAxis
            dataKey="year"
            stroke="#8e8e93"
            tickFormatter={(v) => `${v}y`}
            fontSize={11}
          />
          <YAxis
            stroke="#8e8e93"
            tickFormatter={fmtCompact}
            fontSize={11}
            width={60}
            tickCount={6}
          />
          <Tooltip
            contentStyle={{ background: "#2c2c2e", border: "1px solid #3a3a3c", borderRadius: 8 }}
            formatter={(value: number, name: string) => {
              if (name === "band") return [fmtMoney(value), "p10–p90 span"];
              if (name === "p50") return [fmtMoney(value), "Median (p50)"];
              if (name === "deterministic") return [fmtMoney(value), "Steady-return"];
              return [fmtMoney(value), name];
            }}
            labelFormatter={(v) => `Year ${Number(v).toFixed(1)}`}
          />

          {/* p10 base (invisible) + band = p10..p90 fan */}
          <Area
            dataKey="p10"
            stackId="fan"
            stroke="none"
            fill="transparent"
            isAnimationActive={false}
          />
          <Area
            dataKey="band"
            stackId="fan"
            stroke={FAN_COLOR}
            strokeWidth={0}
            fill={FAN_COLOR}
            fillOpacity={0.18}
            isAnimationActive={false}
          />

          {/* Median — bright orange, prominent */}
          <Line
            dataKey="p50"
            stroke={MEDIAN_COLOR}
            strokeWidth={3}
            dot={false}
            isAnimationActive={false}
          />

          {/* Steady/deterministic return — solid green, clearly distinct */}
          <Line
            dataKey="deterministic"
            stroke={DET_COLOR}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />

          {/* End-callout labels via ReferenceLine at the horizon */}
          {lastPoint && (
            <>
              <ReferenceLine
                x={horizonYears}
                stroke="transparent"
                label={{
                  position: "right",
                  value: fmtCompact(lastPoint.p90),
                  fontSize: 10,
                  fill: FAN_COLOR,
                }}
              />
              <ReferenceLine
                x={horizonYears}
                stroke="transparent"
                label={{
                  position: "right",
                  value: fmtCompact(lastPoint.p50),
                  fontSize: 10,
                  fill: MEDIAN_COLOR,
                  dy: 12,
                }}
              />
              <ReferenceLine
                x={horizonYears}
                stroke="transparent"
                label={{
                  position: "right",
                  value: fmtCompact(lastPoint.p10),
                  fontSize: 10,
                  fill: FAN_COLOR,
                  dy: 24,
                }}
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-muted pl-8">
        <span className="flex items-center gap-1">
          <span className="inline-block w-6 h-0.5" style={{ background: MEDIAN_COLOR, height: 3 }} />
          Median outcome (p50)
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-6 h-2.5 rounded-sm opacity-40"
            style={{ background: FAN_COLOR }}
          />
          Likely range (p10–p90)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-6 h-0.5" style={{ background: DET_COLOR, height: 2 }} />
          Steady return (no volatility)
        </span>
        <span className="ml-auto opacity-60">{realDollars ? "Today's $" : "Future $"}</span>
      </div>

      {/* Explanatory copy */}
      {lastPoint && (
        <p className="text-xs text-muted mt-2 leading-relaxed">
          In ~80% of simulations the portfolio ends between{" "}
          <span className="text-fg">{fmtCompact(lastPoint.p10)}</span> and{" "}
          <span className="text-fg">{fmtCompact(lastPoint.p90)}</span>; the median is{" "}
          <span className="text-fg" style={{ color: MEDIAN_COLOR }}>
            {fmtCompact(lastPoint.p50)}
          </span>
          . The dashed line is steady-return growth with no year-to-year volatility.
          {realDollars && " Values are shown in today's purchasing power."}
          {netOfFees && " Returns are shown net of fund expense ratios."}
          {monthlyContribution > 0 &&
            ` Assumes ${fmtMoney(monthlyContribution)}/mo in contributions.`}
          {monthlyContribution < 0 &&
            ` Assumes ${fmtMoney(-monthlyContribution)}/mo in withdrawals.`}
        </p>
      )}
    </div>
  );
}
