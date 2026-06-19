// Sub-classes are the allocation/target dimension (must match backend constants.ASSET_CLASSES).
// Bonds and Alternatives are split by tax treatment; each rolls up to a display parent.

export const ASSET_CLASSES = [
  "US Stock",
  "International",
  "Muni Bond",
  "Taxable Bond",
  "REITs",
  "Cash",
  "Gold & Commodities",
  "Crypto",
  "Other Alternatives",
] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number];

// Sub-class -> display parent (for grouping/subtotals in the UI).
export const PARENT_OF: Record<string, string> = {
  "US Stock": "US Stock",
  International: "International",
  "Muni Bond": "Bond",
  "Taxable Bond": "Bond",
  REITs: "REITs",
  Cash: "Cash",
  "Gold & Commodities": "Alternatives",
  Crypto: "Alternatives",
  "Other Alternatives": "Alternatives",
};

export const PARENTS = ["US Stock", "International", "Bond", "REITs", "Cash", "Alternatives"];

export const CLASS_COLORS: Record<string, string> = {
  "US Stock": "#6b8cba",
  International: "#4caf7d",
  "Muni Bond": "#d8a657",
  "Taxable Bond": "#c98a3a",
  REITs: "#b07cc6",
  Cash: "#7d8590",
  "Gold & Commodities": "#c9a227",
  Crypto: "#e0823d",
  "Other Alternatives": "#d16a6a",
};

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  taxable: "Taxable",
  tax_deferred: "Tax-Deferred",
  tax_free: "Tax-Free",
};
