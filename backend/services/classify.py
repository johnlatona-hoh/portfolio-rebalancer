"""Heuristic ticker classifier driven by the fund Description / Asset Type text that
brokers include in their position exports. Lets the app classify ANY ticker into a
sub-class without manual tagging or an AI call. Returns (sub_class, tax_efficiency, name).

Keyword order matters: REITs, Crypto, Gold, and Bonds are checked before International
so that e.g. an "International Aggregate Bond" lands in Taxable Bond and a "Global Real
Estate" fund lands in REITs.
"""

from constants import tax_of

_CRYPTO_KW = ["BITCOIN", "ETHEREUM", "CRYPTO", "BLOCKCHAIN", "COIN"]
_GOLD_KW = ["GOLD", "SILVER", "PRECIOUS METAL", "COMMODIT", "MINERS"]
_OTHER_ALT_KW = ["MANAGED FUTURES", "MARKET NEUTRAL", "ANTI-BETA", "LONG/SHORT",
                 "MERGER ARB", "HEDGE", "ALTERNATIVE", "MULTI-STRATEGY"]
_MUNI_KW = ["MUNICIPAL", "MUNI", "TAX-EXEMPT", "TAX EXEMPT"]
_BOND_KW = ["BOND", "TREASURY", "TIPS", "AGGREGATE", " AGG", "FIXED INCOME", "DURATION"]
_INTL_KW = ["INTERNATIONAL", "INTL", "EMERGING", "EAFE", "EX-US", "EX US",
            "WORLD", "GLOBAL", "DEVELOPED", "FOREIGN", "PACIFIC", "EUROPE", "ASIA"]


def _sub_class(description: str, asset_type: str, ticker: str) -> str:
    d = (description or "").upper()
    at = (asset_type or "").upper()

    if ticker.upper() == "CASH" or "MONEY MARKET" in at or "MONEY MARKET" in d or "CASH" in at:
        return "Cash"
    if "REIT" in d or "REAL ESTATE" in d:
        return "REITs"
    if any(k in d for k in _CRYPTO_KW):
        return "Crypto"
    if any(k in d for k in _GOLD_KW):
        return "Gold & Commodities"
    if any(k in d for k in _OTHER_ALT_KW):
        return "Other Alternatives"
    if any(k in d for k in _MUNI_KW):
        return "Muni Bond"
    if any(k in d for k in _BOND_KW):
        return "Taxable Bond"
    if any(k in d for k in _INTL_KW):
        return "International"
    return "US Stock"


def classify(ticker: str, description: str = "", asset_type: str = "") -> tuple[str, str, str]:
    name = description.title() if description and description not in ("--", "N/A") else ticker.upper()
    sub = _sub_class(description, asset_type, ticker)
    return (sub, tax_of(sub), name)
