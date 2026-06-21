"""Tests for the pure-Python portfolio-tilts analysis.

Works on the same plain dicts as the rebalance engine:
  holding = {account_name, account_type, ticker, quantity, cost_basis, current_value}
  tags    = {ticker: {"asset_class", "name", optionally "style"/"size"/"sector"}}
"""

from services import tilts


def _h(ticker, value):
    return {"account_name": "B", "account_type": "taxable", "ticker": ticker,
            "quantity": 1.0, "cost_basis": value, "current_value": value}


def _dim(result, key):
    return next(d for d in result["dimensions"] if d["key"] == key)


# ---------- name heuristics ----------

def test_heuristics_growth_value_size():
    assert tilts.classify_style_size_sector("Vanguard Growth ETF", "VUG", None)[0] == "growth"
    assert tilts.classify_style_size_sector("Vanguard Value ETF", "VTV", None)[0] == "value"
    assert tilts.classify_style_size_sector("iShares Small-Cap ETF", "IJR", None)[1] == "small"
    s = tilts.classify_style_size_sector("Vanguard Total Stock Market ETF", "VTI", None)
    assert s[0] == "blend" and s[1] == tilts.SIZE_TOTAL and s[2] == "Broad"


def test_persisted_values_win_over_heuristic():
    persisted = {"name": "Apple Inc", "style": "growth", "size": "large", "sector": "Technology"}
    assert tilts.classify_style_size_sector("Apple Inc", "AAPL", persisted) == ("growth", "large", "Technology")


def test_market_region_inference():
    assert tilts.classify_market_region("Vanguard FTSE Emerging Markets ETF") == "emerging"
    assert tilts.classify_market_region("Vanguard FTSE Developed Markets ETF") == "developed"
    assert tilts.classify_market_region("Some Mystery Fund") is None


# ---------- aggregation ----------

def _tags():
    return {
        "VTI":  {"asset_class": "US Stock", "name": "Vanguard Total Stock Market ETF"},
        "VUG":  {"asset_class": "US Stock", "name": "Vanguard Growth ETF",
                 "style": "growth", "size": "large", "sector": "Broad"},
        "AVUV": {"asset_class": "US Stock", "name": "Avantis US Small Cap Value ETF",
                 "style": "value", "size": "small", "sector": "Broad"},
        "VXUS": {"asset_class": "International", "name": "Vanguard Total International Stock ETF"},
        "VWO":  {"asset_class": "International", "name": "Vanguard FTSE Emerging Markets ETF",
                 "style": "blend", "size": "large", "sector": "Broad"},
        "BND":  {"asset_class": "Taxable Bond", "name": "Vanguard Total Bond Market ETF"},
        "AAPL": {"asset_class": "US Stock", "name": "Apple Inc"},
    }


def test_macro_mix_balanced_and_equity_pct():
    holdings = [_h("VTI", 60000), _h("BND", 40000)]
    res = tilts.compute_tilts(holdings, _tags(), 100000)
    macro = _dim(res, "macro")
    assert macro["breakdown"]["Stocks"] == 60.0
    assert macro["breakdown"]["Bonds"] == 40.0
    assert macro["verdict"] == "Balanced"


def test_us_intl_home_bias_is_strong():
    holdings = [_h("VTI", 90000), _h("VXUS", 10000)]
    res = tilts.compute_tilts(holdings, _tags(), 100000)
    geo = _dim(res, "us_intl")
    assert geo["breakdown"]["US"] == 90.0
    assert geo["verdict"] == "Strong tilt"


def test_us_intl_near_neutral():
    holdings = [_h("VTI", 60000), _h("VXUS", 40000)]
    geo = _dim(tilts.compute_tilts(holdings, _tags(), 100000), "us_intl")
    assert geo["verdict"] == "Neutral"


def test_total_market_reads_as_neutral_size_and_style():
    holdings = [_h("VTI", 100000)]
    res = tilts.compute_tilts(holdings, _tags(), 100000)
    assert _dim(res, "size")["verdict"] == "Neutral"
    assert _dim(res, "style")["verdict"] == "Neutral"


def test_small_value_tilt_detected():
    holdings = [_h("AVUV", 60000), _h("VTI", 40000)]
    res = tilts.compute_tilts(holdings, _tags(), 100000)
    assert _dim(res, "size")["verdict"] in ("Modest tilt", "Strong tilt")
    style = _dim(res, "style")
    assert style["breakdown"]["value"] > style["breakdown"]["growth"]


def test_dev_em_overweight_emerging():
    holdings = [_h("VWO", 50000), _h("VTI", 50000)]
    res = tilts.compute_tilts(holdings, _tags(), 100000)
    de = _dim(res, "dev_em")
    assert de["breakdown"]["emerging"] == 100.0
    assert de["verdict"] == "Strong tilt"


def test_unclassified_individual_stock_flagged():
    holdings = [_h("VTI", 50000), _h("AAPL", 50000)]
    res = tilts.compute_tilts(holdings, _tags(), 100000)
    assert "AAPL" in res["unclassified_tickers"]
    assert "VTI" not in res["unclassified_tickers"]
    # Coverage on style should be ~50% (only VTI classifiable).
    assert _dim(res, "style")["coverage_pct"] == 50.0


def test_empty_portfolio_returns_no_dimensions():
    assert tilts.compute_tilts([], _tags(), 0)["dimensions"] == []
