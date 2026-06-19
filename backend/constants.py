"""Canonical vocabulary shared across the engine, schemas, and seed data.

The allocation/target dimension is the *sub-class* (ASSET_CLASSES below). Bonds and
Alternatives are split by tax treatment so the engine can place tax-efficient sleeves
(munis) in taxable and tax-inefficient sleeves (taxable bonds, REITs, gold, crypto) in
tax-deferred. Each sub-class rolls up to a display PARENT and has a default tax profile.
"""

# The sub-classes the allocation/rebalancing engine tracks (the target dimension).
ASSET_CLASSES = [
    "US Stock",
    "International",
    "Taxable Bond",
    "Muni Bond",
    "REITs",
    "Gold & Commodities",
    "Crypto",
    "Other Alternatives",
    "Cash",
]

# Display parent + default tax-efficiency for each sub-class.
SUBCLASS = {
    "US Stock":            {"parent": "US Stock",     "tax": "efficient"},
    "International":        {"parent": "International", "tax": "efficient"},
    "Muni Bond":           {"parent": "Bond",         "tax": "efficient"},
    "Taxable Bond":        {"parent": "Bond",         "tax": "inefficient"},
    "REITs":               {"parent": "REITs",        "tax": "inefficient"},
    "Cash":                {"parent": "Cash",         "tax": "neutral"},
    "Gold & Commodities":  {"parent": "Alternatives", "tax": "inefficient"},
    "Crypto":              {"parent": "Alternatives", "tax": "inefficient"},
    "Other Alternatives":  {"parent": "Alternatives", "tax": "inefficient"},
}

# Display parents (for grouping sub-classes in the UI).
PARENTS = ["US Stock", "International", "Bond", "REITs", "Cash", "Alternatives"]

ACCOUNT_TYPES = ["taxable", "tax_deferred", "tax_free"]
TAX_EFFICIENCIES = ["efficient", "inefficient", "neutral"]


def parent_of(sub_class: str) -> str:
    return SUBCLASS.get(sub_class, {}).get("parent", sub_class)


def tax_of(sub_class: str) -> str:
    return SUBCLASS.get(sub_class, {}).get("tax", "efficient")


# Long-run annual return / volatility assumptions per sub-class, used by the Monte
# Carlo projection. Editable - conservative, broad estimates, not predictions.
RETURN_ASSUMPTIONS: dict[str, dict[str, float]] = {
    "US Stock":           {"mean": 0.070, "stdev": 0.16},
    "International":       {"mean": 0.070, "stdev": 0.18},
    "Muni Bond":          {"mean": 0.030, "stdev": 0.05},
    "Taxable Bond":       {"mean": 0.030, "stdev": 0.05},
    "REITs":              {"mean": 0.065, "stdev": 0.19},
    "Cash":               {"mean": 0.020, "stdev": 0.01},
    "Gold & Commodities": {"mean": 0.040, "stdev": 0.16},
    "Crypto":             {"mean": 0.100, "stdev": 0.55},
    "Other Alternatives": {"mean": 0.050, "stdev": 0.14},
}
