"""Gemini wrapper for the rebalancer's AI features. Adapted from MusicCollection's
services/claude_ai.py: same google-genai SDK, gemini-2.5-flash model, 429-retry, and
the discipline of no-op'ing (returning None) when GEMINI_API_KEY is absent.
"""

import asyncio
import json
import logging
import re

from config import settings
from constants import ASSET_CLASSES, TAX_EFFICIENCIES, STYLES, SIZES, SECTORS

_MODEL = "gemini-2.5-flash"

logger = logging.getLogger(__name__)


class AIError(RuntimeError):
    """Raised when an AI generation genuinely fails (key present but the call errored,
    rate-limited, or returned an unparseable response). Distinct from the no-key no-op,
    which returns None. Lets the router surface a real error instead of a silent empty."""


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
        raise AIError("Model response did not contain a JSON array.")
    except AIError:
        raise
    except Exception as e:
        logger.exception("portfolio_insights generation failed")
        raise AIError(f"{type(e).__name__}: {e}") from e


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
        raise AIError("Model response did not contain a JSON array.")
    except AIError:
        raise
    except Exception as e:
        logger.exception("berger_tips generation failed")
        raise AIError(f"{type(e).__name__}: {e}") from e


async def advisor_query(summary: dict, question: str,
                        history: list[dict] | None = None) -> str | None:
    """Answer a free-form question as a thoughtful fee-only RIA / fiduciary, grounded ONLY
    in the provided portfolio summary (allocations vs. target, accounts, grade, risk metrics,
    and the current projection). Conversational: prior turns in `history` ([{role, content}])
    are replayed for follow-up context. Returns plain text, or None when no key is set; raises
    AIError on a genuine failure so the router can surface it."""
    if not settings.GEMINI_API_KEY:
        return None

    try:
        client = _client()
        convo = ""
        for turn in (history or []):
            role = "User" if turn.get("role") == "user" else "Advisor"
            content = str(turn.get("content", "")).strip()
            if content:
                convo += f"{role}: {content}\n"

        prompt = (
            "You are a thoughtful, fee-only Registered Investment Advisor (RIA) acting as a "
            "fiduciary for this client. You favor low-cost index funds, tax-efficient asset "
            "location, broad diversification, and disciplined long-term investing. You are given "
            "an anonymized snapshot of the client's portfolio as JSON: asset-class allocations "
            "vs. targets, holdings by account type, a tax-location grade, risk/reward metrics, "
            "and the current Monte Carlo projection. Answer the client's question using ONLY this "
            "data plus sound, mainstream financial-planning principles. Reference their actual "
            "numbers, be specific and concrete, and give clear, prioritized, actionable "
            "recommendations. If the question asks for something the data cannot answer (e.g. "
            "details not present), say so plainly rather than inventing figures. Keep it focused "
            "and readable - short paragraphs or bullet points, plain English, no markdown headers. "
            "End with a single short line reminding the client this is educational information, "
            "not individualized investment, tax, or legal advice.\n\n"
            f"PORTFOLIO SNAPSHOT:\n{json.dumps(summary, indent=2)}\n\n"
            + (f"CONVERSATION SO FAR:\n{convo}\n" if convo else "")
            + f"CLIENT QUESTION:\n{question.strip()}"
        )
        response = await _generate_with_retry(client, prompt)
        text = (response.text or "").strip()
        if not text:
            raise AIError("Model returned an empty response.")
        return text
    except AIError:
        raise
    except Exception as e:
        logger.exception("advisor_query generation failed")
        raise AIError(f"{type(e).__name__}: {e}") from e


async def classify_tilts(items: list[dict]) -> dict | None:
    """Classify each {ticker, name} into style/size/sector for the tilts module. Returns
    {ticker: {"style","size","sector"}} for the ones the model recognizes (omits any it
    marks UNKNOWN). None without a key; raises AIError on a genuine failure."""
    if not settings.GEMINI_API_KEY or not items:
        return None

    try:
        client = _client()
        listing = "\n".join(f"- {i['ticker']}: {i.get('name') or ''}" for i in items)
        prompt = (
            "You classify US-listed equity holdings (funds, ETFs, and individual stocks) by "
            "investment style, market-cap size, and sector for a portfolio tilt analysis.\n\n"
            f"For each ticker choose exactly one style from {STYLES}, one size from {SIZES} "
            "(use 'large' for mega/large-cap and for an individual mega-cap stock), and one "
            f"sector from {SECTORS} (use 'Broad' for a diversified/total-market fund that is "
            "not concentrated in one sector).\n"
            "If a ticker is a bond/cash/commodity fund (not equity) or you do not recognize it, "
            "use the string \"UNKNOWN\" for that ticker instead of an object.\n\n"
            f"TICKERS:\n{listing}\n\n"
            'Respond ONLY with valid JSON: an object keyed by ticker, each value either '
            '{"style":"...","size":"...","sector":"..."} or "UNKNOWN". No markdown, no preamble.'
        )
        response = await _generate_with_retry(client, prompt)
        text = (response.text or "").strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        if start < 0 or end <= start:
            raise AIError("Model response did not contain a JSON object.")
        raw = json.loads(text[start:end])
        out: dict[str, dict] = {}
        for ticker, val in raw.items():
            if not isinstance(val, dict):
                continue  # "UNKNOWN" or malformed -> skip
            entry = {}
            if val.get("style") in STYLES:
                entry["style"] = val["style"]
            if val.get("size") in SIZES:
                entry["size"] = val["size"]
            if val.get("sector") in SECTORS:
                entry["sector"] = val["sector"]
            if entry:
                out[ticker.strip().upper()] = entry
        return out
    except AIError:
        raise
    except Exception as e:
        logger.exception("classify_tilts generation failed")
        raise AIError(f"{type(e).__name__}: {e}") from e


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
