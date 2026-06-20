"""Tests for the pure-Python tax-aware rebalancing engine.

The engine works on plain dicts so it stays decoupled from FastAPI/Pydantic:
  holding = {account_name, account_type, ticker, quantity, cost_basis, current_value}
  tags    = {ticker: {"asset_class": str, "tax_efficiency": str}}
"""

from services import rebalance


def _tags():
    return {
        "VTI":  {"asset_class": "US Stock",      "tax_efficiency": "efficient"},
        "VXUS": {"asset_class": "International",  "tax_efficiency": "efficient"},
        "BND":  {"asset_class": "Taxable Bond",  "tax_efficiency": "inefficient"},
        "VTEB": {"asset_class": "Muni Bond",     "tax_efficiency": "efficient"},
        "VNQ":  {"asset_class": "REITs",         "tax_efficiency": "inefficient"},
        "VMFXX": {"asset_class": "Cash",         "tax_efficiency": "neutral"},
    }


def _holding(account_name, account_type, ticker, value):
    return {
        "account_name": account_name,
        "account_type": account_type,
        "ticker": ticker,
        "quantity": 1.0,
        "cost_basis": value,
        "current_value": value,
    }


# ---------- roll_up ----------

def test_roll_up_blends_values_across_accounts_by_class():
    holdings = [
        _holding("Brokerage", "taxable", "VTI", 60000),
        _holding("IRA", "tax_deferred", "VTI", 20000),
        _holding("IRA", "tax_deferred", "BND", 20000),
    ]
    blended, total = rebalance.roll_up(holdings, _tags())

    assert total == 100000
    assert blended["US Stock"] == 80000
    assert blended["Taxable Bond"] == 20000


def test_roll_up_reports_per_account_breakdown():
    holdings = [
        _holding("Brokerage", "taxable", "VTI", 60000),
        _holding("IRA", "tax_deferred", "BND", 40000),
    ]
    _, _ = rebalance.roll_up(holdings, _tags())
    by_account = rebalance.account_breakdown(holdings, _tags())

    brokerage = next(a for a in by_account if a["account_name"] == "Brokerage")
    assert brokerage["value"] == 60000
    assert brokerage["by_class"]["US Stock"] == 60000


# ---------- compute_deltas ----------

def test_compute_deltas_returns_buy_and_sell_amounts():
    blended = {"US Stock": 80000, "Taxable Bond": 20000}
    targets = {"US Stock": 60, "Taxable Bond": 40}  # percentages
    deltas = rebalance.compute_deltas(blended, 100000, targets)

    assert deltas["US Stock"] == -20000       # overweight -> sell
    assert deltas["Taxable Bond"] == 20000    # underweight -> buy


# ---------- plan_trades: tax-awareness ----------

def test_plan_trades_prefers_tax_advantaged_accounts_over_taxable():
    """When a delta can be satisfied inside a tax-advantaged account, the engine
    must not generate a sell in the taxable account (avoid realizing gains)."""
    holdings = [
        _holding("Brokerage", "taxable", "VTI", 50000),
        _holding("IRA", "tax_deferred", "VTI", 30000),
        _holding("IRA", "tax_deferred", "BND", 20000),
    ]
    targets = {"US Stock": 60, "Taxable Bond": 40}  # sell 20k US Stock, buy 20k Bond
    result = rebalance.analyze(holdings, targets, _tags())

    taxable_sells = [
        t for t in result["trades"]
        if t["account_type"] == "taxable" and t["action"] == "SELL"
    ]
    assert taxable_sells == []  # the IRA can absorb the whole rebalance

    ira_activity = [t for t in result["trades"] if t["account_type"] == "tax_deferred"]
    assert any(t["action"] == "SELL" and t["asset_class"] == "US Stock" for t in ira_activity)
    assert any(t["action"] == "BUY" and t["asset_class"] == "Taxable Bond" for t in ira_activity)


def test_trades_are_cash_neutral_within_each_account():
    """Execution-ready: each account is rebalanced in place, so the dollars bought in an
    account must equal the dollars sold there (no inter-account transfers, no account
    over-allocated beyond its own total)."""
    holdings = [
        _holding("Brokerage", "taxable", "VTI", 60000),
        _holding("Brokerage", "taxable", "VNQ", 40000),   # 100k taxable
        _holding("IRA", "tax_deferred", "VTI", 50000),
        _holding("IRA", "tax_deferred", "BND", 50000),     # 100k tax_deferred
        _holding("Roth", "tax_free", "VTI", 50000),        # 50k tax_free
    ]
    targets = {"US Stock": 50, "Taxable Bond": 30, "REITs": 10, "International": 10}
    result = rebalance.analyze(holdings, targets, _tags())

    totals, buys, sells = {}, {}, {}
    for h in holdings:
        totals[h["account_name"]] = totals.get(h["account_name"], 0) + h["current_value"]
    for t in result["trades"]:
        bucket = buys if t["action"] == "BUY" else sells
        bucket[t["account_name"]] = bucket.get(t["account_name"], 0) + t["amount"]

    for acct, tot in totals.items():
        b, s = buys.get(acct, 0), sells.get(acct, 0)
        assert abs(b - s) < 1.0, f"{acct} not cash-neutral: buys {b} vs sells {s}"
        assert b <= tot + 1.0, f"{acct} over-allocated: buys {b} > account total {tot}"


def test_selling_cash_from_taxable_does_not_warn_about_capital_gains():
    """Reducing a Cash position deploys cash; it never realizes a capital gain, so the
    tax note must not say it might."""
    holdings = [
        _holding("Brokerage", "taxable", "VMFXX", 50000),  # Cash overweight
        _holding("Brokerage", "taxable", "VTI", 50000),
    ]
    targets = {"US Stock": 100, "Cash": 0}  # deploy all cash into US Stock
    result = rebalance.analyze(holdings, targets, _tags())

    cash_sells = [t for t in result["trades"] if t["asset_class"] == "Cash" and t["action"] == "SELL"]
    assert cash_sells, "expected a Cash sell"
    for t in cash_sells:
        assert "capital gains" not in t["tax_note"].lower()


def test_muni_bonds_are_not_churned_out_of_taxable():
    """A tax-exempt muni bond held in taxable should stay put - the engine must not
    sell it to relocate 'bonds' to tax-deferred (that would needlessly realize gains).
    The taxable-bond sleeve, by contrast, belongs in tax-deferred."""
    holdings = [
        _holding("Brokerage", "taxable", "VTEB", 50000),     # muni, efficient - keep in taxable
        _holding("Brokerage", "taxable", "VTI", 50000),
        _holding("IRA", "tax_deferred", "BND", 50000),        # taxable bond - belongs here
        _holding("IRA", "tax_deferred", "VTI", 50000),
    ]
    # targets already match current blended (US 50, Muni 25, Taxable Bond 25) -> ideally no trades
    targets = {"US Stock": 50, "Muni Bond": 25, "Taxable Bond": 25}
    result = rebalance.analyze(holdings, targets, _tags())

    muni_sells = [
        t for t in result["trades"]
        if t["asset_class"] == "Muni Bond" and t["action"] == "SELL"
    ]
    assert muni_sells == [], f"munis should not be sold, got {muni_sells}"


# ---------- location_grade (1-10 score) ----------

def test_grade_flags_inefficient_asset_in_taxable_account():
    holdings = [
        _holding("Brokerage", "taxable", "VNQ", 10000),  # REIT in taxable = misplaced
        _holding("IRA", "tax_deferred", "BND", 10000),   # bond in tax-deferred = correct
    ]
    grade = rebalance.location_grade(holdings, _tags())

    assert grade["misplaced_count"] == 1
    assert grade["total_holdings"] == 2
    assert any("VNQ" in r for r in grade["reasons"])
    assert grade["methodology"]  # non-empty explanation


def test_grade_is_10_when_everything_well_placed():
    holdings = [
        _holding("Brokerage", "taxable", "VTI", 10000),  # efficient equity in taxable = good
        _holding("IRA", "tax_deferred", "BND", 10000),   # inefficient bond in tax-deferred = good
    ]
    grade = rebalance.location_grade(holdings, _tags())

    assert grade["misplaced_count"] == 0
    assert grade["score"] == 100


def test_grade_score_is_value_weighted():
    """Score reflects the share of inefficient DOLLARS correctly located, not a count."""
    holdings = [
        _holding("Brokerage", "taxable", "VNQ", 10000),   # 10k inefficient misplaced
        _holding("IRA", "tax_deferred", "BND", 90000),    # 90k inefficient correct
    ]
    grade = rebalance.location_grade(holdings, _tags())
    # 90k of 100k inefficient is well placed -> score 9
    assert grade["inefficient_value"] == 100000
    assert grade["misplaced_value"] == 10000
    assert grade["score"] == 90


def test_grade_is_100_with_no_inefficient_assets():
    holdings = [_holding("Brokerage", "taxable", "VTI", 10000)]
    assert rebalance.location_grade(holdings, _tags())["score"] == 100


# ---------- strategy slider (gain_aversion) ----------

def _appreciated(account, account_type, ticker, value, cost):
    """A holding with explicit cost basis so the engine can compute realized gains."""
    return {
        "account_name": account, "account_type": account_type, "ticker": ticker,
        "quantity": 1.0, "cost_basis": cost, "current_value": value,
    }


def test_gain_aversion_zero_matches_default_behavior():
    """At g=0 the trade plan should match the unconstrained engine output (no regression)."""
    holdings = [
        _appreciated("Brokerage", "taxable", "VTI", 100000, 50000),   # 50k unrealized gain
        _appreciated("Brokerage", "taxable", "VNQ", 30000, 30000),
        _appreciated("IRA", "tax_deferred", "BND", 50000, 50000),
    ]
    targets = {"US Stock": 30, "Taxable Bond": 60, "REITs": 10}
    default = rebalance.analyze(holdings, targets, _tags())
    zero = rebalance.analyze(holdings, targets, _tags(), gain_aversion=0.0)
    assert default["trades"] == zero["trades"]


def test_gain_aversion_one_avoids_selling_appreciated_taxable_holdings():
    """At g=1 the engine must not SELL appreciated taxable holdings (zero realized gains)."""
    holdings = [
        _appreciated("Brokerage", "taxable", "VTI", 100000, 50000),   # appreciated
        _appreciated("Brokerage", "taxable", "VNQ", 30000, 30000),    # no gain
        # IRA has imbalanced sleeves so tax-advantaged rebalancing must still fire.
        _appreciated("IRA", "tax_deferred", "BND", 30000, 30000),
        _appreciated("IRA", "tax_deferred", "VTI", 70000, 70000),
    ]
    targets = {"US Stock": 50, "Taxable Bond": 40, "REITs": 10}
    result = rebalance.analyze(holdings, targets, _tags(), gain_aversion=1.0)

    appreciated_sells = [
        t for t in result["trades"]
        if t["action"] == "SELL" and t["account_type"] == "taxable"
        and t.get("est_gain", 0) > 0.01
    ]
    assert appreciated_sells == [], f"should not realize gains, got {appreciated_sells}"
    assert result["realized_gains"] == 0
    # tax-advantaged rebalancing should still proceed (IRA needs to rotate VTI -> BND)
    assert any(t["account_type"] == "tax_deferred" for t in result["trades"])


def test_gain_aversion_reports_realized_gains_and_est_gain():
    holdings = [
        _appreciated("Brokerage", "taxable", "VTI", 100000, 50000),   # 50% gain ratio
        _appreciated("IRA", "tax_deferred", "BND", 50000, 50000),
    ]
    targets = {"US Stock": 50, "Taxable Bond": 50}
    result = rebalance.analyze(holdings, targets, _tags(), gain_aversion=0.0)
    tax_sells = [t for t in result["trades"]
                 if t["action"] == "SELL" and t["account_type"] == "taxable"]
    if tax_sells:
        # est_gain should be amount * (1 - cost/value) = amount * 0.5 for VTI
        t = tax_sells[0]
        assert "est_gain" in t and abs(t["est_gain"] - t["amount"] * 0.5) < 1
    assert "realized_gains" in result


# ---------- tax-loss harvesting ----------

def _lot(account_name, account_type, ticker, cost_basis, current_value):
    return {
        "account_name": account_name,
        "account_type": account_type,
        "ticker": ticker,
        "quantity": 1.0,
        "cost_basis": cost_basis,
        "current_value": current_value,
    }


def test_tax_loss_harvest_flags_taxable_loss():
    holdings = [_lot("Brokerage", "taxable", "VTI", 10000, 8000)]
    result = rebalance.analyze(holdings, {"US Stock": 100}, _tags())
    tlh = result["tax_loss_harvest"]
    assert len(tlh) == 1
    lot = tlh[0]
    assert lot["ticker"] == "VTI"
    assert lot["unrealized_loss"] == -2000
    assert lot["loss_pct"] == -20.0


def test_tax_loss_harvest_excludes_tax_advantaged_and_gains_and_zero_basis():
    holdings = [
        _lot("401k", "tax_deferred", "VTI", 10000, 8000),   # loss but not taxable
        _lot("Roth", "tax_free", "VXUS", 5000, 3000),       # loss but not taxable
        _lot("Brokerage", "taxable", "BND", 5000, 6000),    # taxable gain
        _lot("Brokerage", "taxable", "VNQ", 0, 4000),       # zero/unknown basis
    ]
    targets = {"US Stock": 40, "International": 20, "Taxable Bond": 20, "REITs": 20}
    result = rebalance.analyze(holdings, targets, _tags())
    assert result["tax_loss_harvest"] == []


def test_tax_loss_harvest_sorted_biggest_loss_first():
    holdings = [
        _lot("Brokerage", "taxable", "VTI", 10000, 9000),   # -1000
        _lot("Brokerage", "taxable", "VXUS", 10000, 6000),  # -4000
    ]
    result = rebalance.analyze(holdings, {"US Stock": 50, "International": 50}, _tags())
    losses = [l["unrealized_loss"] for l in result["tax_loss_harvest"]]
    assert losses == [-4000, -1000]


# ---------- rebalance bands ----------

def test_band_leaves_small_drift_classes_untouched():
    # 55/45 vs a 50/50 target -> 5pt drift each. A 6% band should leave both alone.
    holdings = [
        _holding("Brokerage", "taxable", "VTI", 5500),
        _holding("Brokerage", "taxable", "BND", 4500),
    ]
    targets = {"US Stock": 50, "Taxable Bond": 50}
    banded = rebalance.analyze(holdings, targets, _tags(), drift_band_pct=6.0)
    assert banded["trades"] == [] or all(t["action"] == "HOLD" for t in banded["trades"])
    us = next(b for b in banded["blended"] if b["asset_class"] == "US Stock")
    assert us["within_band"] is True


def test_band_still_trades_large_drift():
    # 70/30 vs 50/50 -> 20pt drift; a 6% band must NOT suppress this.
    holdings = [
        _holding("Brokerage", "taxable", "VTI", 7000),
        _holding("Brokerage", "taxable", "BND", 3000),
    ]
    targets = {"US Stock": 50, "Taxable Bond": 50}
    banded = rebalance.analyze(holdings, targets, _tags(), drift_band_pct=6.0)
    real_trades = [t for t in banded["trades"] if t["action"] in ("BUY", "SELL")]
    assert len(real_trades) > 0
    us = next(b for b in banded["blended"] if b["asset_class"] == "US Stock")
    assert us["within_band"] is False


def test_band_zero_matches_default():
    holdings = [
        _holding("Brokerage", "taxable", "VTI", 6000),
        _holding("Brokerage", "taxable", "BND", 4000),
    ]
    targets = {"US Stock": 50, "Taxable Bond": 50}
    default = rebalance.analyze(holdings, targets, _tags())
    banded0 = rebalance.analyze(holdings, targets, _tags(), drift_band_pct=0.0)
    assert len(default["trades"]) == len(banded0["trades"])
    assert all(not b["within_band"] for b in banded0["blended"])


def test_band_freezes_within_band_class_across_accounts_no_relocation():
    # Bond sits in taxable and US in tax-deferred (mislocated). Blended is 50/50 == target,
    # so both classes are within a 6% band. Without a band the engine relocates them
    # (asset-location swap); with the band, frozen classes must NOT be traded at all.
    holdings = [
        _holding("Brokerage", "taxable", "BND", 5000),       # bond mislocated in taxable
        _holding("401k", "tax_deferred", "VTI", 5000),       # us in tax-deferred
    ]
    targets = {"US Stock": 50, "Taxable Bond": 50}

    no_band = rebalance.analyze(holdings, targets, _tags(), drift_band_pct=0.0)
    assert len([t for t in no_band["trades"] if t["action"] in ("BUY", "SELL")]) > 0

    banded = rebalance.analyze(holdings, targets, _tags(), drift_band_pct=6.0)
    real = [t for t in banded["trades"] if t["action"] in ("BUY", "SELL")]
    assert real == []  # frozen per-account: no relocation trades despite mislocation
    for b in banded["blended"]:
        if b["asset_class"] in ("US Stock", "Taxable Bond"):
            assert b["within_band"] is True
            assert abs(b["delta_value"]) < 1


def test_band_excludes_intentional_drift_from_max_drift():
    # 55/45 vs 50/50 with a 6% band: both frozen, so max_drift_pct should report ~0,
    # not the 5pt intentional band tolerance.
    holdings = [
        _holding("B", "taxable", "VTI", 5500),
        _holding("B", "taxable", "BND", 4500),
    ]
    targets = {"US Stock": 50, "Taxable Bond": 50}
    banded = rebalance.analyze(holdings, targets, _tags(), drift_band_pct=6.0)
    assert banded["max_drift_pct"] < 1.0
