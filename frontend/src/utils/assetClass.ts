// The six asset classes (must match backend constants.ASSET_CLASSES) + display colors.

export const ASSET_CLASSES = [
  "US Stock",
  "International",
  "Bond",
  "REITs",
  "Cash",
  "Alternatives",
] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number];

export const CLASS_COLORS: Record<string, string> = {
  "US Stock": "#6b8cba",
  International: "#4caf7d",
  Bond: "#d8a657",
  REITs: "#b07cc6",
  Cash: "#7d8590",
  Alternatives: "#d16a6a",
};

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  taxable: "Taxable",
  tax_deferred: "Tax-Deferred",
  tax_free: "Tax-Free",
};
