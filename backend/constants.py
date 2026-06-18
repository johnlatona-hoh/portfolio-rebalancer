"""Canonical vocabulary shared across the engine, schemas, and seed data."""

# The six asset classes the allocation/rebalancing engine tracks.
ASSET_CLASSES = [
    "US Stock",
    "International",
    "Bond",
    "REITs",
    "Cash",
    "Alternatives",
]

# Account tax treatments.
ACCOUNT_TYPES = ["taxable", "tax_deferred", "tax_free"]

# Tax-efficiency profile of a holding (drives asset-location placement).
TAX_EFFICIENCIES = ["efficient", "inefficient", "neutral"]

# Long-run annual return / volatility assumptions per asset class, used by the
# Monte Carlo projection. Editable — these are deliberately conservative,
# broad-market estimates, not predictions.
RETURN_ASSUMPTIONS: dict[str, dict[str, float]] = {
    "US Stock":     {"mean": 0.070, "stdev": 0.16},
    "International": {"mean": 0.070, "stdev": 0.18},
    "Bond":         {"mean": 0.030, "stdev": 0.05},
    "REITs":        {"mean": 0.065, "stdev": 0.19},
    "Cash":         {"mean": 0.020, "stdev": 0.01},
    "Alternatives": {"mean": 0.050, "stdev": 0.14},
}
