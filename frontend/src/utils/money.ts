export function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function fmtSignedMoney(n: number): string {
  const sign = n > 0 ? "+" : "";
  return sign + fmtMoney(n);
}

export function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}
