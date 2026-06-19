"""Pure-Python tax-aware rebalancing engine.

No DB or network - works on plain dicts so it is trivially unit-testable:
  holding = {account_name, account_type, ticker, quantity, cost_basis, current_value}
  tags    = {ticker: {"asset_class": str, "tax_efficiency": str}}

Asset-location principles implemented (see the tax-efficient asset-location guide):
  - Avoid realizing gains: satisfy sells inside tax-advantaged accounts first.
  - Tax-inefficient holdings (bonds, REITs) belong in tax-deferred accounts.
  - High-growth / tax-efficient equity belongs in tax-free (Roth) or taxable.
"""

from constants import ASSET_CLASSES, parent_of

# Per-account-type fill preference: which asset classes to place in each account type
# first. Tax-deferred soaks up tax-inefficient income (bonds, REITs); tax-free (Roth)
# takes the highest-growth equity; taxable gets tax-efficient equity, cash, and munis.
PLACEMENT = {
    # tax-inefficient income (taxable bonds, REITs, gold, crypto, alts) first; munis last.
    "tax_deferred": ["Taxable Bond", "REITs", "Other Alternatives", "Gold & Commodities",
                     "Crypto", "International", "US Stock", "Muni Bond", "Cash"],
    # highest-growth, permanently-tax-free assets first; munis/cash wasted here -> last.
    "tax_free":     ["Crypto", "US Stock", "International", "Gold & Commodities",
                     "Other Alternatives", "REITs", "Taxable Bond", "Muni Bond", "Cash"],
    # tax-efficient sleeves: munis (tax-exempt!) and broad equity first; inefficient last.
    "taxable":      ["Muni Bond", "US Stock", "International", "Cash", "Gold & Commodities",
                     "Other Alternatives", "Taxable Bond", "REITs", "Crypto"],
}

# Account types claim their preferred (scarce) classes in this order.
_ACCOUNT_FILL_ORDER = {"tax_deferred": 0, "tax_free": 1, "taxable": 2}

_TAX_NOTE_SELL = {
    "tax_deferred": "no taxable event",
    "tax_free": "no taxable event",
    "taxable": "may realize capital gains",
}
_TAX_NOTE_BUY = {
    "tax_deferred": "tax-deferred growth",
    "tax_free": "tax-free growth",
    "taxable": "deploys cash; choose tax-efficient funds",
}


def _class_of(ticker, tags):
    tag = tags.get(ticker)
    return tag["asset_class"] if tag else None


def roll_up(holdings, tags):
    """Return (blended_value_by_class, total_value) across all accounts."""
    blended = {c: 0.0 for c in ASSET_CLASSES}
    total = 0.0
    for h in holdings:
        cls = _class_of(h["ticker"], tags)
        val = h["current_value"]
        total += val
        if cls in blended:
            blended[cls] += val
    # drop zero classes for a tidy result, but keep totals exact
    return {c: v for c, v in blended.items() if v}, total


def account_breakdown(holdings, tags):
    """Per-account value and a class breakdown within each account."""
    accounts: dict[str, dict] = {}
    for h in holdings:
        name = h["account_name"]
        acct = accounts.setdefault(
            name,
            {"account_name": name, "account_type": h["account_type"], "value": 0.0, "by_class": {}},
        )
        cls = _class_of(h["ticker"], tags)
        val = h["current_value"]
        acct["value"] += val
        if cls:
            acct["by_class"][cls] = acct["by_class"].get(cls, 0.0) + val
    return list(accounts.values())


def compute_deltas(blended, total, targets):
    """Dollar buy(+)/sell(-) per class to reach the target percentages."""
    deltas = {}
    classes = set(blended) | set(targets)
    for cls in classes:
        current = blended.get(cls, 0.0)
        target_val = total * (targets.get(cls, 0.0) / 100.0)
        diff = round(target_val - current, 2)
        if diff:
            deltas[cls] = diff
    return deltas


def _sell_note(cls, account_type):
    # Reducing a Cash position just deploys cash - no gain is ever realized.
    if cls == "Cash":
        return "deploying cash; no gain realized"
    return _TAX_NOTE_SELL[account_type]


def _ticker_for(holdings, account_name, cls, tags):
    """A representative ticker of `cls` held in `account_name`, for labeling a SELL."""
    for h in holdings:
        if h["account_name"] == account_name and _class_of(h["ticker"], tags) == cls:
            return h["ticker"]
    return None


def target_composition(holdings, targets, tags, total):
    """Decide what each account should hold, by asset class, keeping each account's
    total value fixed (no inter-account transfers) and honoring asset-location
    preferences. Returns {account_name: {asset_class: dollars}}.

    Tax-advantaged accounts get first claim on their preferred classes, so scarce
    tax-inefficient assets land in tax-deferred and growth equity in Roth before the
    taxable account fills with whatever remains.
    """
    remaining = {c: total * (targets.get(c, 0.0) / 100.0) for c in ASSET_CLASSES}
    accounts = account_breakdown(holdings, tags)
    ordered = sorted(accounts, key=lambda a: _ACCOUNT_FILL_ORDER.get(a["account_type"], 3))

    comp: dict[str, dict] = {a["account_name"]: {} for a in accounts}
    for a in ordered:
        cap = a["value"]
        pref = PLACEMENT.get(a["account_type"], ASSET_CLASSES)
        # primary pass: preferred classes; fallback pass: anything still owed
        for cls in pref + [c for c in ASSET_CLASSES if c not in pref]:
            if cap <= 0.005:
                break
            take = min(cap, remaining.get(cls, 0.0))
            if take <= 0.005:
                continue
            comp[a["account_name"]][cls] = comp[a["account_name"]].get(cls, 0.0) + take
            cap -= take
            remaining[cls] -= take
    return comp


def plan_trades(holdings, targets, tags, total):
    """Produce an execution-ready, tax-aware BUY/SELL list. Each account is rebalanced
    in place toward its target composition, so an account's buys are funded by its own
    sells (cash-neutral per account; never over-allocated)."""
    comp = target_composition(holdings, targets, tags, total)
    accounts = account_breakdown(holdings, tags)
    trades = []

    for a in accounts:
        name, atype = a["account_name"], a["account_type"]
        current = a["by_class"]
        target = comp.get(name, {})
        for cls in sorted(set(current) | set(target)):
            diff = round(target.get(cls, 0.0) - current.get(cls, 0.0), 2)
            if abs(diff) < 0.01:
                continue
            if diff > 0:
                trades.append({
                    "account_name": name, "account_type": atype, "action": "BUY",
                    "asset_class": cls, "ticker": None, "amount": diff,
                    "tax_note": _TAX_NOTE_BUY[atype],
                })
            else:
                trades.append({
                    "account_name": name, "account_type": atype, "action": "SELL",
                    "asset_class": cls, "ticker": _ticker_for(holdings, name, cls, tags),
                    "amount": -diff, "tax_note": _sell_note(cls, atype),
                })
    return trades


def location_grade(holdings, tags):
    """Grade asset location. A holding is misplaced when a tax-inefficient asset
    sits in a taxable account (its income/distributions are taxed at ordinary rates
    that a tax-deferred account would have sheltered)."""
    misplaced = []
    total = len(holdings)
    for h in holdings:
        tag = tags.get(h["ticker"])
        if not tag:
            continue
        if tag["tax_efficiency"] == "inefficient" and h["account_type"] == "taxable":
            misplaced.append(
                f"{h['ticker']} ({tag['asset_class']}) is in a taxable account - "
                f"consider moving it to a tax-deferred account."
            )

    n = len(misplaced)
    ratio = (n / total) if total else 0.0
    if n == 0:
        letter = "A"
    elif ratio <= 0.1:
        letter = "B"
    elif ratio <= 0.25:
        letter = "C"
    elif ratio <= 0.5:
        letter = "D"
    else:
        letter = "F"

    return {
        "grade": letter,
        "misplaced_count": n,
        "total_holdings": total,
        "notes": misplaced,
    }


def analyze(holdings, targets, tags):
    """Top-level orchestration used by the /analyze router."""
    blended, total = roll_up(holdings, tags)
    deltas = compute_deltas(blended, total, targets)
    trades = plan_trades(holdings, targets, tags, total)
    grade = location_grade(holdings, tags)

    blended_view = []
    for cls in ASSET_CLASSES:
        val = blended.get(cls, 0.0)
        if val == 0 and targets.get(cls, 0) == 0:
            continue
        blended_view.append({
            "asset_class": cls,
            "group": parent_of(cls),
            "value": round(val, 2),
            "pct": round((val / total * 100) if total else 0.0, 2),
            "target_pct": float(targets.get(cls, 0.0)),
            "delta_value": round(deltas.get(cls, 0.0), 2),
        })

    unknown = sorted({h["ticker"] for h in holdings if h["ticker"] not in tags})

    return {
        "total_value": round(total, 2),
        "blended": blended_view,
        "by_account": account_breakdown(holdings, tags),
        "trades": trades,
        "grade": grade,
        "unknown_tickers": unknown,
    }
