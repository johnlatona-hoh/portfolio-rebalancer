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

# Historical worst-case peak-to-trough drawdowns (decimal fractions, negative).
MAX_DRAWDOWN_PCT: dict[str, float] = {
    "US Stock":           -0.50,
    "International":      -0.55,
    "Taxable Bond":       -0.15,
    "Muni Bond":          -0.12,
    "REITs":              -0.68,
    "Cash":               -0.01,
    "Gold & Commodities": -0.45,
    "Crypto":             -0.85,
    "Other Alternatives": -0.40,
}

# Symmetric pairwise annual-return correlations (unique pairs; diagonal = 1.0 implied).
CORRELATION: dict[tuple[str, str], float] = {
    ("US Stock", "International"):                0.85,
    ("US Stock", "Taxable Bond"):                -0.10,
    ("US Stock", "Muni Bond"):                   -0.05,
    ("US Stock", "REITs"):                        0.65,
    ("US Stock", "Cash"):                         0.00,
    ("US Stock", "Gold & Commodities"):           0.05,
    ("US Stock", "Crypto"):                       0.20,
    ("US Stock", "Other Alternatives"):           0.50,
    ("International", "Taxable Bond"):           -0.05,
    ("International", "Muni Bond"):              -0.03,
    ("International", "REITs"):                   0.55,
    ("International", "Cash"):                    0.00,
    ("International", "Gold & Commodities"):      0.10,
    ("International", "Crypto"):                  0.18,
    ("International", "Other Alternatives"):      0.45,
    ("Taxable Bond", "Muni Bond"):                0.80,
    ("Taxable Bond", "REITs"):                    0.10,
    ("Taxable Bond", "Cash"):                     0.20,
    ("Taxable Bond", "Gold & Commodities"):       0.15,
    ("Taxable Bond", "Crypto"):                   0.00,
    ("Taxable Bond", "Other Alternatives"):       0.10,
    ("Muni Bond", "REITs"):                       0.08,
    ("Muni Bond", "Cash"):                        0.18,
    ("Muni Bond", "Gold & Commodities"):          0.10,
    ("Muni Bond", "Crypto"):                      0.00,
    ("Muni Bond", "Other Alternatives"):          0.08,
    ("REITs", "Cash"):                            0.00,
    ("REITs", "Gold & Commodities"):              0.15,
    ("REITs", "Crypto"):                          0.10,
    ("REITs", "Other Alternatives"):              0.35,
    ("Cash", "Gold & Commodities"):               0.02,
    ("Cash", "Crypto"):                           0.00,
    ("Cash", "Other Alternatives"):               0.05,
    ("Gold & Commodities", "Crypto"):             0.15,
    ("Gold & Commodities", "Other Alternatives"): 0.25,
    ("Crypto", "Other Alternatives"):             0.20,
}


def get_correlation(a: str, b: str) -> float:
    if a == b:
        return 1.0
    return CORRELATION.get((a, b), CORRELATION.get((b, a), 0.0))
