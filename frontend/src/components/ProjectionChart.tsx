import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { ProjectionPoint } from "../api/client";
import { fmtMoney } from "../utils/money";

interface Props {
  points: ProjectionPoint[];
  height?: number;
}

/** Monte Carlo fan chart: p10–p90 band, p50 median, deterministic reference line. */
export default function ProjectionChart({ points, height = 220 }: Props) {
  // Transform to a stacked band: base = p10, span = p90 - p10.
  const data = points.map((p) => ({
    year: +(p.month / 12).toFixed(2),
    p10: p.p10,
    band: p.p90 - p.p10,
    p50: p.p50,
    deterministic: p.deterministic,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3c" />
        <XAxis
          dataKey="year"
          stroke="#8e8e93"
          tickFormatter={(v) => `${v}y`}
          fontSize={11}
        />
        <YAxis
          stroke="#8e8e93"
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          fontSize={11}
          width={48}
        />
        <Tooltip
          contentStyle={{ background: "#2c2c2e", border: "1px solid #3a3a3c", borderRadius: 8 }}
          formatter={(value: number, name: string) => {
            const label =
              name === "band" ? "p90–p10 span" : name === "p50" ? "Median" : name;
            return [fmtMoney(value), label];
          }}
          labelFormatter={(v) => `Year ${v}`}
        />
        {/* invisible base then visible band = the p10..p90 fan */}
        <Area dataKey="p10" stackId="fan" stroke="none" fill="transparent" isAnimationActive={false} />
        <Area
          dataKey="band"
          stackId="fan"
          stroke="none"
          fill="#6b8cba"
          fillOpacity={0.18}
          isAnimationActive={false}
        />
        <Line dataKey="p50" stroke="#6b8cba" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line
          dataKey="deterministic"
          stroke="#4caf7d"
          strokeWidth={1}
          strokeDasharray="4 3"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
