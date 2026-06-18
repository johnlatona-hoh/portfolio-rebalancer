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
        "BND":  {"asset_class": "Bond",          "tax_efficiency": "inefficient"},
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
    assert blended["Bond"] == 20000


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
    blended = {"US Stock": 80000, "Bond": 20000}
    targets = {"US Stock": 60, "Bond": 40}  # percentages
    deltas = rebalance.compute_deltas(blended, 100000, targets)

    assert deltas["US Stock"] == -20000  # overweight -> sell
    assert deltas["Bond"] == 20000       # underweight -> buy


# ---------- plan_trades: tax-awareness ----------

def test_plan_trades_prefers_tax_advantaged_accounts_over_taxable():
    """When a delta can be satisfied inside a tax-advantaged account, the engine
    must not generate a sell in the taxable account (avoid realizing gains)."""
    holdings = [
        _holding("Brokerage", "taxable", "VTI", 50000),
        _holding("IRA", "tax_deferred", "VTI", 30000),
        _holding("IRA", "tax_deferred", "BND", 20000),
    ]
    targets = {"US Stock": 60, "Bond": 40}  # need to sell 20k US Stock, buy 20k Bond
    result = rebalance.analyze(holdings, targets, _tags())

    taxable_sells = [
        t for t in result["trades"]
        if t["account_type"] == "taxable" and t["action"] == "SELL"
    ]
    assert taxable_sells == []  # the IRA can absorb the whole rebalance

    ira_activity = [t for t in result["trades"] if t["account_type"] == "tax_deferred"]
    assert any(t["action"] == "SELL" and t["asset_class"] == "US Stock" for t in ira_activity)
    assert any(t["action"] == "BUY" and t["asset_class"] == "Bond" for t in ira_activity)


# ---------- location_grade ----------

def test_grade_flags_inefficient_asset_in_taxable_account():
    holdings = [
        _holding("Brokerage", "taxable", "VNQ", 10000),  # REIT in taxable = misplaced
        _holding("IRA", "tax_deferred", "BND", 10000),   # bond in tax-deferred = correct
    ]
    grade = rebalance.location_grade(holdings, _tags())

    assert grade["misplaced_count"] == 1
    assert grade["total_holdings"] == 2
    assert any("VNQ" in n for n in grade["notes"])


def test_grade_is_A_when_everything_well_placed():
    holdings = [
        _holding("Brokerage", "taxable", "VTI", 10000),  # efficient equity in taxable = good
        _holding("IRA", "tax_deferred", "BND", 10000),   # inefficient bond in tax-deferred = good
    ]
    grade = rebalance.location_grade(holdings, _tags())

    assert grade["misplaced_count"] == 0
    assert grade["grade"] == "A"
