"""Tests for the description-based ticker classifier (no AI required).

Classifies into sub-classes (Muni Bond vs Taxable Bond, Gold vs Crypto, etc.).
"""

from services import classify


def c(desc, asset_type=""):
    return classify.classify("XXXX", desc, asset_type)


def test_reit_from_description():
    assert c("SCHWAB U.S. REIT ETF")[:2] == ("REITs", "inefficient")
    assert c("VANGUARD GLOBAL EX-US REAL ESTATE ETF")[:2] == ("REITs", "inefficient")


def test_muni_bond_is_efficient_subclass():
    assert c("VANGUARD TAX-EXEMPT BOND INDEX FUND ETF")[:2] == ("Muni Bond", "efficient")
    assert c("ISHARES NATIONAL MUNI BOND ETF")[:2] == ("Muni Bond", "efficient")


def test_taxable_bond_is_inefficient_subclass():
    assert c("SCHWAB U.S. AGGREGATE BOND ETF")[:2] == ("Taxable Bond", "inefficient")
    assert c("SCHWAB U.S. TIPS ETF")[:2] == ("Taxable Bond", "inefficient")


def test_international_bond_classifies_as_taxable_bond():
    assert c("ISHARES CORE INTERNATIONAL AGGREGATE BOND ETF")[:2] == ("Taxable Bond", "inefficient")


def test_international_equity():
    assert c("SCHWAB EMERGING MARKETS EQUITY ETF")[:2] == ("International", "efficient")
    assert c("ISHARES MSCI EAFE VALUE ETF")[:2] == ("International", "efficient")


def test_crypto_is_its_own_subclass():
    assert c("ISHARES BITCOIN TRUST ETF")[:2] == ("Crypto", "inefficient")


def test_gold_is_gold_and_commodities():
    assert c("SPDR GOLD SHARES")[:2] == ("Gold & Commodities", "inefficient")
    assert c("WISDOMTREE EFFICIENT GOLD PLUS GOLD MINERS STRATEGY FUND")[:2] == (
        "Gold & Commodities",
        "inefficient",
    )


def test_other_alternatives_for_managed_futures():
    assert c("IMGP DBI MANAGED FUTURES STRATEGY ETF")[:2] == ("Other Alternatives", "inefficient")


def test_cash_from_asset_type():
    assert c("--", "Cash and Money Market")[:2] == ("Cash", "neutral")
    assert classify.classify("CASH", "", "")[:2] == ("Cash", "neutral")


def test_default_is_us_stock_efficient():
    assert c("INVESCO RAFI US 1000 ETF")[:2] == ("US Stock", "efficient")
    assert c("SCHWAB U.S. LARGE-CAP GROWTH ETF")[:2] == ("US Stock", "efficient")
