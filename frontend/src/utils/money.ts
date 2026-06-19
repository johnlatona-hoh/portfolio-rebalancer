export function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** Compact currency for chart axes: $1.2M, $840k, $95k, $500. */
export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1_000).toFixed(0)}k`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export function fmtSignedMoney(n: number): string {
  const sign = n > 0 ? "+" : "";
  return sign + fmtMoney(n);
}

export function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}
