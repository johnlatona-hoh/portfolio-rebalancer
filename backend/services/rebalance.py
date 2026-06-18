"""Pure-Python tax-aware rebalancing engine.

No DB or network — works on plain dicts so it is trivially unit-testable:
  holding = {account_name, account_type, ticker, quantity, cost_basis, current_value}
  tags    = {ticker: {"asset_class": str, "tax_efficiency": str}}

Asset-location principles implemented (see the tax-efficient asset-location guide):
  - Avoid realizing gains: satisfy sells inside tax-advantaged accounts first.
  - Tax-inefficient holdings (bonds, REITs) belong in tax-deferred accounts.
  - High-growth / tax-efficient equity belongs in tax-free (Roth) or taxable.
"""

from constants import ASSET_CLASSES

# Where to *sell* from, in order — tax-advantaged first so we don't realize gains.
SELL_ORDER = ["tax_deferred", "tax_free", "taxable"]

# Where to *buy* a new position, by the holding's tax-efficiency, in preference order.
BUY_ORDER = {
    "inefficient": ["tax_deferred", "tax_free", "taxable"],
    "efficient":   ["tax_free", "taxable", "tax_deferred"],
    "neutral":     ["taxable", "tax_deferred", "tax_free"],
}

# The "ideal" account type for a holding given its tax-efficiency, for grading.
# A holding is "misplaced" only when a tax-inefficient asset sits in a taxable account.
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


def _accounts_holding_class(holdings, tags, cls):
    """Map account_name -> {account_type, value} holding the given class."""
    out: dict[str, dict] = {}
    for h in holdings:
        if _class_of(h["ticker"], tags) == cls:
            a = out.setdefault(h["account_name"], {"account_type": h["account_type"], "value": 0.0, "ticker": h["ticker"]})
            a["value"] += h["current_value"]
    return out


def _all_accounts(holdings):
    """Map account_name -> account_type for every account in the portfolio."""
    return {h["account_name"]: h["account_type"] for h in holdings}


def plan_trades(holdings, deltas, tags):
    """Produce a tax-aware BUY/SELL list satisfying the per-class deltas.

    Sells are sourced from tax-advantaged accounts first (avoid realizing gains).
    Buys are placed in the account type that best fits the asset's tax profile.
    """
    trades = []
    all_accounts = _all_accounts(holdings)

    for cls, amount in deltas.items():
        if amount < 0:  # SELL |amount| of this class
            remaining = -amount
            holders = _accounts_holding_class(holdings, tags, cls)
            ordered = sorted(
                holders.items(),
                key=lambda kv: SELL_ORDER.index(kv[1]["account_type"])
                if kv[1]["account_type"] in SELL_ORDER else len(SELL_ORDER),
            )
            for name, info in ordered:
                if remaining <= 0:
                    break
                take = min(info["value"], remaining)
                if take <= 0:
                    continue
                trades.append({
                    "account_name": name,
                    "account_type": info["account_type"],
                    "action": "SELL",
                    "asset_class": cls,
                    "ticker": info.get("ticker"),
                    "amount": round(take, 2),
                    "tax_note": _TAX_NOTE_SELL[info["account_type"]],
                })
                remaining -= take

        elif amount > 0:  # BUY this class
            # pick the best-fitting account type that actually exists
            tax_eff = "neutral"
            for h in holdings:
                if _class_of(h["ticker"], tags) == cls:
                    tax_eff = tags.get(h["ticker"], {}).get("tax_efficiency", "neutral")
                    break
            pref = BUY_ORDER.get(tax_eff, BUY_ORDER["neutral"])
            target_name = None
            target_type = None
            for atype in pref:
                for name, t in all_accounts.items():
                    if t == atype:
                        target_name, target_type = name, atype
                        break
                if target_name:
                    break
            if target_name is None and all_accounts:
                target_name, target_type = next(iter(all_accounts.items()))
            if target_name:
                trades.append({
                    "account_name": target_name,
                    "account_type": target_type,
                    "action": "BUY",
                    "asset_class": cls,
                    "ticker": None,
                    "amount": round(amount, 2),
                    "tax_note": _TAX_NOTE_BUY[target_type],
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
                f"{h['ticker']} ({tag['asset_class']}) is in a taxable account — "
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
    trades = plan_trades(holdings, deltas, tags)
    grade = location_grade(holdings, tags)

    blended_view = []
    for cls in ASSET_CLASSES:
        val = blended.get(cls, 0.0)
        if val == 0 and targets.get(cls, 0) == 0:
            continue
        blended_view.append({
            "asset_class": cls,
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
