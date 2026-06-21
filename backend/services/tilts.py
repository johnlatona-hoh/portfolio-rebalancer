"""Portfolio "tilts" analysis: how the equity sleeve leans across style (growth/value),
size (large/mid/small), geography (US/international, developed/emerging), and sector,
plus the macro stock/bond/alt mix - each measured against a neutral market baseline.

Pure functions on plain dicts (like services/rebalance.py), so trivially unit-testable.
Style/size/sector are resolved per holding by, in order: a persisted tag value (from the
seed or a Gemini classification pass), then a best-effort fund-name heuristic, else None
(surfaced honestly as "Unclassified" rather than a fabricated label).
"""

from constants import (
    EQUITY_CLASSES, MACRO_GROUP, TILT_BASELINES, SECTORS,
    TILT_NEUTRAL_PTS, TILT_MODEST_PTS, SECTOR_CONCENTRATION_PTS,
    parent_of,
)

# Size sentinel for all-cap / total-market funds: a KNOWN, neutral size (not a tilt).
SIZE_TOTAL = "total"

_SECTOR_KEYWORDS = {
    "Technology": ["TECHNOLOGY", "INFO TECH", "INFORMATION TECH", "SEMICONDUCTOR"],
    "Health Care": ["HEALTH", "BIOTECH", "PHARMA", "MEDICAL"],
    "Financials": ["FINANCIAL", "BANK", "INSURANCE"],
    "Consumer Discretionary": ["CONSUMER DISCRETIONARY", "CONSUMER CYCLICAL"],
    "Consumer Staples": ["CONSUMER STAPLES", "CONSUMER DEFENSIVE"],
    "Energy": ["ENERGY", "OIL", "GAS"],
    "Industrials": ["INDUSTRIAL"],
    "Materials": ["MATERIALS"],
    "Utilities": ["UTILIT"],
    "Communication Services": ["COMMUNICATION", "TELECOM", "MEDIA"],
    # Real Estate funds land in the REITs asset_class, so not an equity-sleeve sector here.
}

_BROAD_KW = ["TOTAL", "BROAD", "ALL-CAP", "ALL CAP", "3000", "ENTIRE MARKET",
             "WHOLE MARKET", "TOTAL MARKET", "TOTAL STOCK"]


def _verdict(deviation_pts: float) -> str:
    if deviation_pts < TILT_NEUTRAL_PTS:
        return "Neutral"
    if deviation_pts <= TILT_MODEST_PTS:
        return "Modest tilt"
    return "Strong tilt"


def classify_market_region(name: str):
    """developed | emerging | None, inferred from a fund name (no persistence)."""
    u = (name or "").upper()
    if any(k in u for k in ["EMERGING", "EM MARKET", " EM ", "FRONTIER"]):
        return "emerging"
    if any(k in u for k in ["DEVELOPED", "EAFE", "EX-US", "EX US", "EX-U.S", "EUROPE",
                            "PACIFIC", "JAPAN", "WORLD EX", "FTSE DEVELOPED"]):
        return "developed"
    return None


def _heur_size(u: str):
    if "SMALL" in u or "RUSSELL 2000" in u or " 2000" in u:
        return "small"
    if "MID" in u:
        return "mid"
    if any(k in u for k in _BROAD_KW):
        return SIZE_TOTAL
    if any(k in u for k in ["LARGE", "MEGA", "S&P 500", "S&P500", " 500", " 100",
                            " 1000", "DOW", "NASDAQ-100", "NASDAQ 100"]):
        return "large"
    return None


def _heur_style(u: str):
    if "GROWTH" in u:
        return "growth"
    if "VALUE" in u or "DIVIDEND" in u or "HIGH DIV" in u:
        return "value"
    if any(k in u for k in _BROAD_KW) or "BLEND" in u or any(
        k in u for k in ["S&P 500", "S&P500", " 500", " 1000", "DOW"]
    ):
        return "blend"
    return None


def _heur_sector(u: str):
    if any(k in u for k in _BROAD_KW) or any(k in u for k in ["S&P 500", "S&P500", " 500", " 1000"]):
        return "Broad"
    for sector, kws in _SECTOR_KEYWORDS.items():
        if any(k in u for k in kws):
            return sector
    if "NASDAQ" in u or "QQQ" in u:  # tech-heavy index
        return "Technology"
    return None


def classify_style_size_sector(name: str, ticker: str, persisted: dict | None):
    """Resolve (style, size, sector) for a holding: persisted tag values win, else a
    name heuristic, else None for each missing piece."""
    persisted = persisted or {}
    u = f"{name or ''} {ticker or ''}".upper()
    style = persisted.get("style") or _heur_style(u)
    size = persisted.get("size") or _heur_size(u)
    sector = persisted.get("sector") or _heur_sector(u)
    return (style or None, size or None, sector or None)


def _pct_map(values: dict, denom: float) -> dict:
    if denom <= 0:
        return {k: 0.0 for k in values}
    return {k: round(v / denom * 100, 1) for k, v in values.items()}


def _dimension(key, label, breakdown, baseline, verdict, note, coverage_pct):
    return {
        "key": key, "label": label, "breakdown": breakdown, "baseline": baseline,
        "verdict": verdict, "note": note, "coverage_pct": round(coverage_pct, 1),
    }


def compute_tilts(holdings: list, tags: dict, total: float) -> dict:
    """Return {"dimensions": [TiltDimension...], "unclassified_tickers": [...]}.

    Equity sleeve = US Stock + International holdings. Style/size/sector tilts are measured
    only over the equities we can classify (coverage_pct reports how much that is)."""
    dims = []
    if total <= 0:
        return {"dimensions": [], "unclassified_tickers": []}

    def cls_of(t):
        return tags.get(t, {}).get("asset_class")

    # ---- 1. Macro stock / bond / alt mix (whole portfolio, informational) ----
    macro = {"Stocks": 0.0, "Bonds": 0.0, "Alternatives": 0.0, "Cash": 0.0}
    for h in holdings:
        c = cls_of(h["ticker"])
        if not c:
            continue
        grp = MACRO_GROUP.get(c) or MACRO_GROUP.get(parent_of(c)) or "Stocks"
        macro[grp] += h["current_value"]
    macro_pct = _pct_map(macro, total)
    eq_pct = macro_pct["Stocks"]
    macro_verdict = "Aggressive" if eq_pct > 85 else "Conservative" if eq_pct < 50 else "Balanced"
    dims.append(_dimension(
        "macro", "Stocks vs Bonds vs Alternatives", macro_pct,
        {"Stocks": 60.0, "Bonds": 40.0}, macro_verdict,
        f"{eq_pct:.0f}% equities, {macro_pct['Bonds']:.0f}% bonds. "
        f"{'A growth-oriented, more volatile mix' if eq_pct > 85 else 'A income/stability-oriented mix' if eq_pct < 50 else 'A balanced mix'} "
        "- the right level depends on your horizon and risk tolerance.",
        100.0,
    ))

    # Equity sleeve holdings (US Stock + International).
    eq = [h for h in holdings if cls_of(h["ticker"]) in EQUITY_CLASSES]
    eq_total = sum(h["current_value"] for h in eq)

    # Resolve per-equity-holding classification once.
    resolved = {}  # ticker -> (style, size, sector)
    for h in eq:
        t = h["ticker"]
        if t not in resolved:
            tag = tags.get(t, {})
            resolved[t] = classify_style_size_sector(tag.get("name"), t, tag)

    if eq_total > 0:
        # ---- 2. US vs International (of the equity sleeve) ----
        us_val = sum(h["current_value"] for h in eq if cls_of(h["ticker"]) == "US Stock")
        intl_val = eq_total - us_val
        geo_pct = _pct_map({"US": us_val, "International": intl_val}, eq_total)
        geo_dev = abs(geo_pct["US"] - TILT_BASELINES["us_intl"]["US"])
        dims.append(_dimension(
            "us_intl", "US vs International", geo_pct, TILT_BASELINES["us_intl"],
            _verdict(geo_dev),
            f"{geo_pct['US']:.0f}% US / {geo_pct['International']:.0f}% international "
            f"(global-cap neutral ~60/40). "
            + ("Heavy home-country bias." if geo_pct["US"] - 60 > TILT_MODEST_PTS
               else "Tilted toward foreign equity." if geo_pct["US"] - 60 < -TILT_MODEST_PTS
               else "Close to the global market."),
            100.0,
        ))

        # ---- 3. Developed vs Emerging (of international) ----
        if intl_val > 0:
            dev = em = 0.0
            for h in eq:
                if cls_of(h["ticker"]) != "International":
                    continue
                region = classify_market_region(tags.get(h["ticker"], {}).get("name"))
                if region == "emerging":
                    em += h["current_value"]
                elif region == "developed":
                    dev += h["current_value"]
            classified = dev + em
            de_pct = _pct_map({"developed": dev, "emerging": em}, classified) if classified else {"developed": 0.0, "emerging": 0.0}
            de_dev = abs(de_pct["emerging"] - TILT_BASELINES["dev_em"]["emerging"]) if classified else 0.0
            dims.append(_dimension(
                "dev_em", "Developed vs Emerging", de_pct, TILT_BASELINES["dev_em"],
                _verdict(de_dev) if classified else "Neutral",
                (f"{de_pct['emerging']:.0f}% of international is emerging markets "
                 f"(neutral ~25%)." if classified
                 else "Couldn't infer developed vs emerging from fund names."),
                (classified / intl_val * 100) if intl_val else 0.0,
            ))

        # ---- 4. Style: growth / value / blend (of classifiable equity) ----
        style_vals = {"growth": 0.0, "value": 0.0, "blend": 0.0}
        style_known = 0.0
        for h in eq:
            st = resolved[h["ticker"]][0]
            if st in style_vals:
                style_vals[st] += h["current_value"]
                style_known += h["current_value"]
        style_pct = _pct_map(style_vals, style_known) if style_known else {k: 0.0 for k in style_vals}
        spread = abs(style_pct["growth"] - style_pct["value"])
        lean = "growth" if style_pct["growth"] > style_pct["value"] else "value"
        dims.append(_dimension(
            "style", "Growth vs Value", style_pct, TILT_BASELINES["style"],
            _verdict(spread) if style_known else "Neutral",
            (f"Leans {lean} ({style_pct['growth']:.0f}% growth / {style_pct['value']:.0f}% value / "
             f"{style_pct['blend']:.0f}% blend); blend is market-neutral." if style_known
             else "Style unknown for these holdings - classify to assess."),
            (style_known / eq_total * 100),
        ))

        # ---- 5. Size: large / mid / small (of classifiable equity) ----
        size_vals = {"large": 0.0, "mid": 0.0, "small": 0.0, SIZE_TOTAL: 0.0}
        size_known = 0.0
        for h in eq:
            sz = resolved[h["ticker"]][1]
            if sz in size_vals:
                size_vals[sz] += h["current_value"]
                size_known += h["current_value"]
        size_pct = _pct_map(size_vals, size_known) if size_known else {k: 0.0 for k in size_vals}
        base = TILT_BASELINES["size"]
        # All-cap/total funds are neutral: distribute them at the baseline before measuring.
        tot = size_pct.get(SIZE_TOTAL, 0.0)
        eff = {
            "large": size_pct["large"] + tot * base["large"] / 100,
            "mid": size_pct["mid"] + tot * base["mid"] / 100,
            "small": size_pct["small"] + tot * base["small"] / 100,
        }
        size_dev = max(abs(eff[k] - base[k]) for k in base) if size_known else 0.0
        small_mid = size_pct["small"] + size_pct["mid"]
        dims.append(_dimension(
            "size", "Large vs Mid vs Small cap", size_pct, base,
            _verdict(size_dev) if size_known else "Neutral",
            (f"{size_pct['large']:.0f}% large / {size_pct['mid']:.0f}% mid / "
             f"{size_pct['small']:.0f}% small"
             + (f" / {tot:.0f}% all-cap" if tot else "")
             + (f". A small/mid-cap tilt (neutral ~25% combined)." if small_mid > 35
                else ". Close to total-market weighting.") if size_known else ""
             ) if size_known else "Size unknown for these holdings - classify to assess.",
            (size_known / eq_total * 100),
        ))

        # ---- 6. Sector concentration (of the equity sleeve) ----
        sector_vals = {}
        sector_known = 0.0
        for h in eq:
            sec = resolved[h["ticker"]][2]
            if not sec:
                continue
            sector_known += h["current_value"]
            if sec == "Broad":
                continue  # diversified - never a concentration
            sector_vals[sec] = sector_vals.get(sec, 0.0) + h["current_value"]
        sector_pct = _pct_map(sector_vals, eq_total)
        top_sector = max(sector_pct, key=sector_pct.get) if sector_pct else None
        top_share = sector_pct.get(top_sector, 0.0) if top_sector else 0.0
        sec_verdict = ("Strong tilt" if top_share > SECTOR_CONCENTRATION_PTS
                       else "Modest tilt" if top_share > TILT_MODEST_PTS else "Neutral")
        dims.append(_dimension(
            "sector", "Sector concentration", sector_pct, {},
            sec_verdict,
            (f"{top_share:.0f}% in {top_sector} (broad-market max is ~30%)."
             if top_sector else "No single-sector concentration detected."),
            (sector_known / eq_total * 100),
        ))

    # Equity tickers missing any of style/size/sector are AI-classification candidates.
    unclassified = sorted({
        h["ticker"] for h in eq
        if None in resolved.get(h["ticker"], (None, None, None))
    })
    return {"dimensions": dims, "unclassified_tickers": unclassified}
