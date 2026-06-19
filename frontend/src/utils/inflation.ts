import type { ProjectionPoint } from "../api/client";

/** Deflate all projection values to today's purchasing power. */
export function deflatePoints(
  points: ProjectionPoint[],
  annualRatePct: number
): ProjectionPoint[] {
  const r = annualRatePct / 100;
  return points.map((p) => {
    const factor = Math.pow(1 + r, p.month / 12);
    return {
      month: p.month,
      p10: p.p10 / factor,
      p50: p.p50 / factor,
      p90: p.p90 / factor,
      deterministic: p.deterministic / factor,
    };
  });
}
