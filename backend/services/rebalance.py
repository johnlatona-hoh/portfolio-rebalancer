"""Pure-Python tax-aware rebalancing engine.

No DB or network - works on plain dicts so it is trivially unit-testable:
  holding = {account_name, account_type, ticker, quantity, cost_basis, current_value}
  tags    = {ticker: {"asset_class": str, "tax_efficiency": str}}

Asset-location principles implemented (see the tax-efficient asset-location guide):
  - Avoid realizing gains: satisfy sells inside tax-advantaged accounts first.
  - Tax-inefficient holdings (bonds, REITs) belong in tax-deferred accounts.
  - High-growth / tax-efficient equity belongs in tax-free (Roth) or taxable.
"""

import math

from constants import (
    ASSET_CLASSES, parent_of,
    RETURN_ASSUMPTIONS, MAX_DRAWDOWN_PCT, get_correlation, FEE_ASSUMPTIONS,
)

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


def within_band_classes(blended, total, targets, band_pct):
    """Rebalance-band tolerance: the set of classes whose current blended allocation is
    within +/- band_pct of its target. These are left untouched by the trade plan (frozen
    at their current per-account holdings). band_pct <= 0 returns an empty set, so the
    default behavior is unchanged."""
    if not band_pct or band_pct <= 0:
        return set()
    out = set()
    for c in set(blended) | set(targets):
        cur_pct = (blended.get(c, 0.0) / total * 100) if total else 0.0
        tgt = float(targets.get(c, 0.0))
        # Only freeze classes where the portfolio already holds something.
        # A class with a target but zero current holdings must never be frozen —
        # doing so silently prevents the rebalancer from buying into it at all.
        if abs(cur_pct - tgt) <= band_pct and cur_pct > 0:
            out.add(c)
    return out


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


def _est_gain(amount: float, h: dict) -> float:
    """Capital gain realized by selling `amount` of holding `h`, assuming proportional
    cost basis (no specific-lot ID). Cash and underwater positions return 0."""
    v = h.get("current_value", 0) or 0
    if v <= 0:
        return 0.0
    cb = h.get("cost_basis", 0) or 0
    gain_ratio = max(0.0, (v - cb) / v)
    return round(amount * gain_ratio, 2)


def target_composition(holdings, targets, tags, total, frozen=None):
    """Decide what each account should hold, by asset class, keeping each account's
    total value fixed (no inter-account transfers) and honoring asset-location
    preferences. Returns {account_name: {asset_class: dollars}}.

    Tax-advantaged accounts get first claim on their preferred classes, so scarce
    tax-inefficient assets land in tax-deferred and growth equity in Roth before the
    taxable account fills with whatever remains.

    `frozen` is a set of rebalance-band classes that must not be traded: each is pinned
    to its CURRENT holding within each account (no relocation, no buy/sell) and excluded
    from the target fill. With frozen empty (the default), behavior is unchanged.
    """
    frozen = frozen or set()
    remaining = {c: total * (targets.get(c, 0.0) / 100.0) for c in ASSET_CLASSES}
    accounts = account_breakdown(holdings, tags)
    ordered = sorted(accounts, key=lambda a: _ACCOUNT_FILL_ORDER.get(a["account_type"], 3))

    comp: dict[str, dict] = {a["account_name"]: {} for a in accounts}
    for a in ordered:
        cap = a["value"]
        # Pin frozen (within-band) classes to their current holding in this account so the
        # plan never trades or relocates them; reduce this account's fillable capacity.
        for cls in frozen:
            cur = a["by_class"].get(cls, 0.0)
            if cur > 0.005:
                comp[a["account_name"]][cls] = cur
                cap -= cur
        pref = PLACEMENT.get(a["account_type"], ASSET_CLASSES)
        # primary pass: preferred classes; fallback pass: anything still owed
        for cls in pref + [c for c in ASSET_CLASSES if c not in pref]:
            if cls in frozen:
                continue
            if cap <= 0.005:
                break
            take = min(cap, remaining.get(cls, 0.0))
            if take <= 0.005:
                continue
            comp[a["account_name"]][cls] = comp[a["account_name"]].get(cls, 0.0) + take
            cap -= take
            remaining[cls] -= take
    return comp


def _plan_account(holdings, name, atype, current, target, tags, gain_budget=None):
    """Rebalance one account toward its target composition.

    Returns (trades, realized_gains, remaining_budget). For taxable accounts a
    `gain_budget` may cap how much realized gain SELLs are allowed to generate; once
    exhausted, any further reduction is skipped (drift) and buys are reduced to keep
    the account cash-neutral.
    """
    trades = []
    realized = 0.0

    # First, raise cash by selling overweight classes.
    proceeds = 0.0
    class_overs = {cls: current.get(cls, 0.0) - target.get(cls, 0.0)
                   for cls in set(current) | set(target)
                   if current.get(cls, 0.0) - target.get(cls, 0.0) > 0.01}

    if atype == "taxable":
        # Holding-granular: sell within each overweight class, lowest gain-ratio first.
        for cls, owe in sorted(class_overs.items(), key=lambda kv: -kv[1]):
            held = [h for h in holdings
                    if h["account_name"] == name and _class_of(h["ticker"], tags) == cls]
            held.sort(key=lambda h: (max(0.0, (h["current_value"] - (h["cost_basis"] or 0))
                                          / max(h["current_value"], 1e-9)),
                                     -h["current_value"]))
            need = owe
            for h in held:
                if need <= 0.01:
                    break
                take = min(h["current_value"], need)
                est = _est_gain(take, h)
                # If a gain budget is set and this sell would breach it, scale down.
                if gain_budget is not None and est > 0:
                    if gain_budget <= 0.01:
                        continue  # no budget left for any gain-bearing sell
                    if est > gain_budget:
                        # Scale the sell down so its est_gain == remaining budget.
                        gain_ratio = est / take if take > 0 else 0
                        if gain_ratio > 0:
                            take = round(gain_budget / gain_ratio, 2)
                            est = _est_gain(take, h)
                if take <= 0.01:
                    continue
                trades.append({
                    "account_name": name, "account_type": atype, "action": "SELL",
                    "asset_class": cls, "ticker": h["ticker"],
                    "amount": round(take, 2), "est_gain": est,
                    "tax_note": _sell_note(cls, atype),
                })
                proceeds += take
                realized += est
                if gain_budget is not None:
                    gain_budget = max(0.0, gain_budget - est)
                need -= take
    else:
        # Tax-advantaged: no gains realized, class-granular is fine.
        for cls, owe in class_overs.items():
            trades.append({
                "account_name": name, "account_type": atype, "action": "SELL",
                "asset_class": cls, "ticker": _ticker_for(holdings, name, cls, tags),
                "amount": round(owe, 2), "est_gain": 0.0,
                "tax_note": _sell_note(cls, atype),
            })
            proceeds += owe

    # Then deploy proceeds into underweight classes (preserve target order via PLACEMENT).
    class_unders = [(cls, target.get(cls, 0.0) - current.get(cls, 0.0))
                    for cls in set(current) | set(target)
                    if target.get(cls, 0.0) - current.get(cls, 0.0) > 0.01]
    pref = PLACEMENT.get(atype, ASSET_CLASSES)
    pref_index = {c: i for i, c in enumerate(pref)}
    class_unders.sort(key=lambda kv: pref_index.get(kv[0], 99))

    for cls, want in class_unders:
        if proceeds <= 0.01:
            break
        spend = round(min(proceeds, want), 2)
        if spend <= 0.01:
            continue
        trades.append({
            "account_name": name, "account_type": atype, "action": "BUY",
            "asset_class": cls, "ticker": None, "amount": spend,
            "est_gain": 0.0, "tax_note": _TAX_NOTE_BUY[atype],
        })
        proceeds -= spend

    return trades, round(realized, 2)


def plan_trades(holdings, targets, tags, total, gain_aversion: float = 0.0, frozen=None):
    """Produce an execution-ready, tax-aware BUY/SELL list. Each account is rebalanced
    in place toward its target composition, so an account's buys are funded by its own
    sells (cash-neutral per account; never over-allocated).

    `gain_aversion` (0..1): 0 ignores realized gains (best-allocation plan); 1 forbids
    realizing any gains in taxable accounts. Intermediate values cap realized gains at
    `(1 - g) * G_full` where G_full is the unconstrained gains figure.

    `frozen` is the rebalance-band class set, pinned to current holdings (never traded).
    """
    g = max(0.0, min(1.0, float(gain_aversion or 0.0)))
    comp = target_composition(holdings, targets, tags, total, frozen=frozen)
    accounts = account_breakdown(holdings, tags)

    # Pre-pass at g=0 to size the gain budget for the constrained pass.
    G_full = 0.0
    if g > 0:
        for a in accounts:
            if a["account_type"] != "taxable":
                continue
            _, realized = _plan_account(
                holdings, a["account_name"], a["account_type"],
                a["by_class"], comp.get(a["account_name"], {}), tags, gain_budget=None,
            )
            G_full += realized
    budget = max(0.0, (1 - g) * G_full) if g > 0 else None

    all_trades = []
    realized_total = 0.0
    for a in accounts:
        b = budget if a["account_type"] == "taxable" else None
        trades, realized = _plan_account(
            holdings, a["account_name"], a["account_type"],
            a["by_class"], comp.get(a["account_name"], {}), tags, gain_budget=b,
        )
        all_trades.extend(trades)
        realized_total += realized
        if b is not None:
            budget = max(0.0, budget - realized)
    return all_trades, round(realized_total, 2)


def location_grade(holdings, tags):
    """Value-weighted asset-location score on a 1-100 scale (100 = best).

    A holding is "misplaced" when a tax-inefficient asset (taxable bonds, REITs, etc.)
    sits in a taxable account, where its ordinary-income distributions are taxed each
    year instead of being sheltered. The score reflects the share of inefficient DOLLARS
    that are correctly located, not a count of holdings.

    score = 100 * (inefficient $ correctly placed / total inefficient $); 100 when there
    are no inefficient assets to worry about; floored at 1.
    """
    misplaced_value = 0.0
    inefficient_value = 0.0
    misplaced: list[dict] = []
    notes: list[str] = []

    for h in holdings:
        tag = tags.get(h["ticker"])
        if not tag or tag["tax_efficiency"] != "inefficient":
            continue
        v = h["current_value"]
        inefficient_value += v
        if h["account_type"] == "taxable":
            misplaced_value += v
            misplaced.append({"ticker": h["ticker"], "asset_class": tag["asset_class"], "value": v})

    if inefficient_value <= 0:
        score = 100
    else:
        well_placed_ratio = max(0.0, (inefficient_value - misplaced_value) / inefficient_value)
        score = max(1, min(100, int(round(100 * well_placed_ratio))))

    # Build human reasons, biggest offenders first.
    misplaced.sort(key=lambda x: -x["value"])
    for m in misplaced[:5]:
        notes.append(
            f"${m['value']:,.0f} {m['ticker']} ({m['asset_class']}) is in a taxable account - "
            f"consider moving it to a tax-deferred account."
        )
    if inefficient_value > 0:
        correct = inefficient_value - misplaced_value
        notes.append(
            f"${correct:,.0f} of ${inefficient_value:,.0f} tax-inefficient assets "
            f"({(correct / inefficient_value) * 100:.0f}%) are correctly in tax-advantaged accounts."
        )

    methodology = (
        "Score is value-weighted on a 1-100 scale (100 = best). It measures the share of "
        "tax-inefficient dollars (taxable bonds, REITs, etc.) sitting in tax-advantaged "
        "accounts. A holding is 'misplaced' when an inefficient asset sits in a taxable "
        "account, where its ordinary-income distributions are taxed each year. Munis, broad "
        "equity index funds, and cash are not penalized."
    )

    return {
        "score": score,
        "misplaced_count": len(misplaced),
        "total_holdings": len(holdings),
        "inefficient_value": round(inefficient_value, 2),
        "misplaced_value": round(misplaced_value, 2),
        "reasons": notes,
        "methodology": methodology,
    }


def _portfolio_vol(weights_by_class: dict) -> tuple[float, float]:
    """Return (portfolio_volatility, weighted_avg_volatility) as decimals (e.g. 0.12 = 12%).
    weights_by_class: {asset_class: fraction_of_portfolio} — fractions, not percentages."""
    classes = [c for c in ASSET_CLASSES if weights_by_class.get(c, 0.0) > 0]
    variance = 0.0
    for ci in classes:
        for cj in classes:
            wi = weights_by_class.get(ci, 0.0)
            wj = weights_by_class.get(cj, 0.0)
            si = RETURN_ASSUMPTIONS.get(ci, {"stdev": 0.0})["stdev"]
            sj = RETURN_ASSUMPTIONS.get(cj, {"stdev": 0.0})["stdev"]
            variance += wi * wj * si * sj * get_correlation(ci, cj)
    portfolio_vol = math.sqrt(max(variance, 0.0))
    weighted_avg_vol = sum(
        weights_by_class.get(c, 0.0) * RETURN_ASSUMPTIONS.get(c, {"stdev": 0.0})["stdev"]
        for c in classes
    )
    return portfolio_vol, weighted_avg_vol


def _class_of(ticker: str, tags: dict) -> str | None:
    return tags.get(ticker, {}).get("asset_class")


def _fee_of(ticker: str, cls: str, tags: dict) -> float:
    """Effective annual expense ratio (decimal) for a holding: the ticker's explicit
    expense_ratio if set, else the asset-class fallback from FEE_ASSUMPTIONS."""
    er = tags.get(ticker, {}).get("expense_ratio")
    if er is not None:
        return er
    return FEE_ASSUMPTIONS.get(cls, 0.0)


def compute_risk_metrics(holdings: list, by_account_data: list, tags: dict, total_value: float):
    """Return a dict matching PortfolioRisk, or None if total_value is zero."""
    if total_value <= 0:
        return None

    # Build portfolio-level weights by asset class
    class_values: dict[str, float] = {}
    for h in holdings:
        cls = _class_of(h["ticker"], tags)
        if cls:
            class_values[cls] = class_values.get(cls, 0.0) + h["current_value"]
    weights = {c: v / total_value for c, v in class_values.items()}

    # Portfolio expected return: Σ(w_i × mean_i)
    expected_return = sum(
        weights.get(c, 0.0) * RETURN_ASSUMPTIONS.get(c, {"mean": 0.0})["mean"]
        for c in ASSET_CLASSES
    )

    # Portfolio volatility: √(wᵀΣw)
    portfolio_vol, weighted_avg_vol = _portfolio_vol(weights)
    div_benefit = (
        max(0.0, 1.0 - portfolio_vol / weighted_avg_vol) if weighted_avg_vol > 0 else 0.0
    )

    # Max drawdown estimate: value-weighted average of class drawdowns
    max_dd = sum(
        weights.get(c, 0.0) * MAX_DRAWDOWN_PCT.get(c, 0.0)
        for c in ASSET_CLASSES
    )

    # Position sizing
    tagged = sorted(
        [h for h in holdings if _class_of(h["ticker"], tags)],
        key=lambda h: h["current_value"],
        reverse=True,
    )
    largest_pct = (tagged[0]["current_value"] / total_value * 100) if tagged else 0.0
    top5_pct = sum(h["current_value"] for h in tagged[:5]) / total_value * 100

    # Portfolio-wide fees: value-weighted expense ratio + total annual cost
    portfolio_fee_cost = sum(
        h["current_value"] * _fee_of(h["ticker"], _class_of(h["ticker"], tags), tags)
        for h in tagged
    )
    weighted_fee = portfolio_fee_cost / total_value if total_value > 0 else 0.0

    # Per-account fee cost, summed from each holding's effective expense ratio
    acct_fee_cost: dict[str, float] = {}
    for h in tagged:
        cls = _class_of(h["ticker"], tags)
        acct_fee_cost[h["account_name"]] = acct_fee_cost.get(h["account_name"], 0.0) + \
            h["current_value"] * _fee_of(h["ticker"], cls, tags)

    # Per-account risk
    acct_val_map = {a["account_name"]: a["value"] for a in by_account_data}
    account_risks = []
    for a in by_account_data:
        acct_val = a["value"]
        if acct_val <= 0:
            continue
        acct_weights = {c: v / acct_val for c, v in a["by_class"].items()}
        acct_return = sum(
            acct_weights.get(c, 0.0) * RETURN_ASSUMPTIONS.get(c, {"mean": 0.0})["mean"]
            for c in ASSET_CLASSES
        )
        acct_vol, _ = _portfolio_vol(acct_weights)
        acct_dd = sum(
            acct_weights.get(c, 0.0) * MAX_DRAWDOWN_PCT.get(c, 0.0)
            for c in ASSET_CLASSES
        )
        fee_cost = acct_fee_cost.get(a["account_name"], 0.0)
        account_risks.append({
            "account_name": a["account_name"],
            "account_type": a["account_type"],
            "value": round(acct_val, 2),
            "expected_return_pct": round(acct_return * 100, 2),
            "volatility_pct": round(acct_vol * 100, 2),
            "max_drawdown_pct": round(acct_dd * 100, 2),
            "fee_pct": round(fee_cost / acct_val * 100, 4),
            "annual_fee_cost": round(fee_cost, 2),
        })

    # Per-holding risk
    holding_risks = []
    for h in tagged:
        cls = _class_of(h["ticker"], tags)
        acct_val = acct_val_map.get(h["account_name"], 0.0)
        fee = _fee_of(h["ticker"], cls, tags)
        holding_risks.append({
            "ticker": h["ticker"],
            "account_name": h["account_name"],
            "asset_class": cls,
            "current_value": round(h["current_value"], 2),
            "portfolio_pct": round(h["current_value"] / total_value * 100, 2),
            "account_pct": round(h["current_value"] / acct_val * 100, 2) if acct_val > 0 else 0.0,
            "expected_return_pct": round(RETURN_ASSUMPTIONS.get(cls, {"mean": 0.0})["mean"] * 100, 2),
            "volatility_pct": round(RETURN_ASSUMPTIONS.get(cls, {"stdev": 0.0})["stdev"] * 100, 2),
            "max_drawdown_pct": round(MAX_DRAWDOWN_PCT.get(cls, 0.0) * 100, 2),
            "fee_pct": round(fee * 100, 4),
            "annual_fee_cost": round(h["current_value"] * fee, 2),
        })

    return {
        "expected_return_pct": round(expected_return * 100, 2),
        "volatility_pct": round(portfolio_vol * 100, 2),
        "max_drawdown_pct": round(max_dd * 100, 2),
        "diversification_benefit_pct": round(div_benefit * 100, 2),
        "largest_position_pct": round(largest_pct, 2),
        "top5_concentration_pct": round(top5_pct, 2),
        "weighted_fee_pct": round(weighted_fee * 100, 4),
        "annual_fee_cost": round(portfolio_fee_cost, 2),
        "by_account": account_risks,
        "by_holding": holding_risks,
    }


def _tax_loss_harvest(holdings, tags):
    """Lots in TAXABLE accounts sitting at an unrealized loss - candidates for harvesting.
    Skips zero/unknown cost basis (a 0 basis is 'unknown', not a 100% loss). Losses in
    tax-advantaged accounts are excluded (they cannot be harvested). Sorted biggest loss first."""
    lots = []
    for h in holdings:
        if h.get("account_type") != "taxable":
            continue
        cost = h.get("cost_basis") or 0.0
        cur = h.get("current_value") or 0.0
        if cost <= 0 or cur >= cost:
            continue
        loss = cur - cost
        lots.append({
            "ticker": h["ticker"],
            "account_name": h["account_name"],
            "asset_class": _class_of(h["ticker"], tags),
            "current_value": round(cur, 2),
            "cost_basis": round(cost, 2),
            "unrealized_loss": round(loss, 2),
            "loss_pct": round(loss / cost * 100, 2),
        })
    lots.sort(key=lambda x: x["unrealized_loss"])
    return lots


def analyze(holdings, targets, tags, gain_aversion: float = 0.0, drift_band_pct: float = 0.0):
    """Top-level orchestration used by the /analyze router. `gain_aversion` (0..1)
    slides between best-allocation (0) and zero-realized-gains (1) in taxable accounts.
    `drift_band_pct` leaves classes within +/- band of target untouched (no trade)."""
    blended, total = roll_up(holdings, tags)
    within_band = within_band_classes(blended, total, targets, drift_band_pct)
    trades, realized_gains = plan_trades(holdings, targets, tags, total, gain_aversion,
                                         frozen=within_band)
    grade = location_grade(holdings, tags)

    # Compute post-plan blended allocation (drift): apply the trades to the current values.
    post = {c: blended.get(c, 0.0) for c in ASSET_CLASSES}
    for t in trades:
        if t["asset_class"] in post:
            sign = 1 if t["action"] == "BUY" else -1
            post[t["asset_class"]] = post.get(t["asset_class"], 0.0) + sign * t["amount"]

    blended_view = []
    for cls in ASSET_CLASSES:
        val = blended.get(cls, 0.0)
        if val == 0 and targets.get(cls, 0) == 0:
            continue
        post_pct = (post.get(cls, 0.0) / total * 100) if total else 0.0
        tgt = float(targets.get(cls, 0.0))
        blended_view.append({
            "asset_class": cls,
            "group": parent_of(cls),
            "value": round(val, 2),
            "pct": round((val / total * 100) if total else 0.0, 2),
            "target_pct": tgt,
            # actual net change the plan makes (post - current); ~0 for frozen classes
            "delta_value": round(post.get(cls, 0.0) - val, 2),
            "post_pct": round(post_pct, 2),
            "drift_pct": round(post_pct - tgt, 2),
            "within_band": cls in within_band,
        })

    unknown = sorted({h["ticker"] for h in holdings if h.get("ticker") not in tags})
    # Largest residual drift the plan is actually trying to close - exclude band-frozen
    # classes, whose drift is an intentional, accepted tolerance (not a planning failure).
    max_drift = max((abs(b["drift_pct"]) for b in blended_view if not b["within_band"]),
                    default=0.0)

    by_account_data = account_breakdown(holdings, tags)
    return {
        "total_value": round(total, 2),
        "blended": blended_view,
        "by_account": by_account_data,
        "trades": trades,
        "grade": grade,
        "realized_gains": realized_gains,
        "max_drift_pct": round(max_drift, 2),
        "unknown_tickers": unknown,
        "risk": compute_risk_metrics(holdings, by_account_data, tags, total),
        "tax_loss_harvest": _tax_loss_harvest(holdings, tags),
    }


# ---------------------------------------------------------------------------
# Glide-path helpers
# ---------------------------------------------------------------------------

_EQUITY_CLASSES = {"US Stock", "International"}


def interpolate_glide_path(
    current_age: int,
    retirement_age: int,
    equity_pct_now: float,
    equity_pct_retirement: float,
    base_targets: dict,
) -> dict:
    """Scale US Stock + International targets to match the user-specified equity% for
    today; all other classes scale proportionally to fill (100 - equity_pct_now)%.

    The analyze() endpoint applies this BEFORE the rebalancing engine so the trade plan
    reflects the age-adjusted targets rather than the raw targets the user entered.

    Args:
        current_age:         user's current age (years)
        retirement_age:      target retirement age (years)
        equity_pct_now:      desired equity % at current_age (0-100)
        equity_pct_retirement: desired equity % at retirement_age (not used here;
                               stored for informational display on the frontend)
        base_targets:        dict {asset_class: target_pct} (need not sum to 100)

    Returns a new dict with the same keys, rescaled so equity classes sum to equity_pct_now
    and non-equity classes fill the remainder.
    """
    target_equity = float(equity_pct_now)

    current_equity = sum(base_targets.get(c, 0.0) for c in _EQUITY_CLASSES)
    if current_equity <= 0:
        # No equity classes in the base targets - nothing to scale.
        return dict(base_targets)

    equity_scale = target_equity / current_equity

    non_equity_current = sum(v for k, v in base_targets.items() if k not in _EQUITY_CLASSES)
    non_equity_target = 100.0 - target_equity
    non_equity_scale = (non_equity_target / non_equity_current) if non_equity_current > 0 else 1.0

    return {
        k: round(v * (equity_scale if k in _EQUITY_CLASSES else non_equity_scale), 2)
        for k, v in base_targets.items()
    }
