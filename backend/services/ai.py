"""Gemini wrapper for the rebalancer's AI features. Adapted from MusicCollection's
services/claude_ai.py: same google-genai SDK, gemini-2.5-flash model, 429-retry, and
the discipline of no-op'ing (returning None) when GEMINI_API_KEY is absent.
"""

import asyncio
import json
import re

from config import settings
from constants import ASSET_CLASSES, TAX_EFFICIENCIES

_MODEL = "gemini-2.5-flash"


def _client():
    from google import genai
    return genai.Client(api_key=settings.GEMINI_API_KEY)


async def _generate_with_retry(client, prompt: str, retries: int = 2):
    """Call Gemini, retrying on 429 rate-limit with short backoff (free tier throttles
    per-minute and recovers quickly). Waits are capped to avoid upstream timeouts."""
    for attempt in range(retries + 1):
        try:
            return await client.aio.models.generate_content(model=_MODEL, contents=prompt)
        except Exception as e:
            msg = str(e)
            is_rate_limit = "RESOURCE_EXHAUSTED" in msg or "429" in msg
            if not is_rate_limit or attempt == retries:
                raise
            m = re.search(r"retry in (\d+(?:\.\d+)?)s", msg) or re.search(r"retryDelay'?:?\s*'?(\d+)", msg)
            delay = min(float(m.group(1)) + 1, 22) if m else 12
            await asyncio.sleep(delay)
    return None


async def portfolio_insights(summary: dict) -> list[str] | None:
    """Generate 3-4 actionable, tax-location-focused insights from an anonymized
    portfolio summary (asset-class allocations, account types, location grade, and
    any misplaced-holding notes). Returns a list of short strings, or None on
    failure / no key."""
    if not settings.GEMINI_API_KEY:
        return None

    try:
        client = _client()
        prompt = (
            "You are a pragmatic, low-cost index-investing financial advisor focused on "
            "tax-efficient asset location. You are given an anonymized portfolio summary "
            "as JSON (asset-class allocations vs. targets, holdings by account type, and a "
            "tax-location grade). Write 3-4 short, concrete, actionable insights. Prioritize: "
            "moving tax-inefficient holdings (bonds, REITs) into tax-deferred accounts; placing "
            "high-growth equity in Roth; keeping tax-efficient equity and munis in taxable; and "
            "rebalancing inside tax-advantaged accounts to avoid realizing gains. Be specific and "
            "reference the actual numbers/holdings in the summary. Do not give generic boilerplate.\n\n"
            f"PORTFOLIO SUMMARY:\n{json.dumps(summary, indent=2)}\n\n"
            'Respond ONLY with valid JSON: an array of strings, e.g. ["insight one", "insight two"]. '
            "No markdown, no preamble."
        )
        response = await _generate_with_retry(client, prompt)
        text = (response.text or "").strip()
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            insights = json.loads(text[start:end])
            return [str(i).strip() for i in insights if str(i).strip()]
    except Exception:
        pass
    return None


async def berger_tips(summary: dict) -> list[dict] | None:
    """Generate 3-4 practical index-investing tips tailored to this portfolio.
    Each tip has a title, body, and optional advantage/disadvantage note. Returns None when
    GEMINI_API_KEY is absent."""
    if not settings.GEMINI_API_KEY:
        return None

    try:
        client = _client()
        prompt = (
            "You are a pragmatic, plain-English personal finance educator who champions "
            "low-cost index funds, simplicity, the 3-fund portfolio, a high savings rate, "
            "and avoiding market timing. You are given an anonymized portfolio summary as "
            "JSON. Write 3-4 actionable, specific tips tailored to this portfolio.\n\n"
            "Each tip must include:\n"
            "  - title: short phrase (5-10 words)\n"
            "  - body: 1-3 sentences, concrete and portfolio-specific, plain English\n"
            "  - advantage: one-line upside\n"
            "  - disadvantage: one-line trade-off or caveat\n\n"
            f"PORTFOLIO SUMMARY:\n{json.dumps(summary, indent=2)}\n\n"
            "Respond ONLY with valid JSON: an array of objects with keys title, body, advantage, "
            "disadvantage. No markdown, no preamble."
        )
        response = await _generate_with_retry(client, prompt)
        text = (response.text or "").strip()
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            tips = json.loads(text[start:end])
            return [t for t in tips if isinstance(t, dict) and "title" in t and "body" in t]
    except Exception:
        pass
    return None


async def suggest_ticker_tag(ticker: str) -> dict | None:
    """Best-guess asset_class + tax_efficiency for an unknown ticker. Guarded by an
    UNKNOWN sentinel so the model returns None rather than hallucinating for tickers
    it doesn't recognize. Returns {"asset_class", "tax_efficiency", "name"} or None."""
    if not settings.GEMINI_API_KEY:
        return None

    try:
        client = _client()
        prompt = (
            f"Classify the investment fund/security with ticker symbol \"{ticker}\".\n\n"
            f"Choose exactly one asset_class from: {ASSET_CLASSES}.\n"
            f"Choose exactly one tax_efficiency from: {TAX_EFFICIENCIES} "
            "(efficient = broad equity index/ETF, low turnover; inefficient = taxable bonds, "
            "REITs, high-turnover funds; neutral = cash/money-market).\n\n"
            'Respond ONLY with valid JSON: {"asset_class": "...", "tax_efficiency": "...", "name": "..."} '
            "where name is the fund's common name. If you do not recognize this ticker, respond with "
            "exactly the single word UNKNOWN and nothing else."
        )
        response = await _generate_with_retry(client, prompt)
        text = (response.text or "").strip()
        if text.upper().startswith("UNKNOWN"):
            return None
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(text[start:end])
            if data.get("asset_class") in ASSET_CLASSES and data.get("tax_efficiency") in TAX_EFFICIENCIES:
                return data
    except Exception:
        pass
    return None
