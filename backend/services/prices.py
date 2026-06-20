"""Live-ish price lookup with a 24h cache.

Source: Yahoo Finance's public v8 chart endpoint (no API key). One request per ticker,
but the 24h PriceCache means a portfolio is priced at most once a day. Every lookup is
best-effort: a ticker that fails to fetch is simply omitted, and the caller keeps its
existing CSV value. Source is unofficial, so failures are expected and handled gracefully.
"""

from datetime import datetime, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import PriceCache

_TTL = timedelta(hours=24)
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"


async def _fetch_one(client: httpx.AsyncClient, ticker: str) -> float | None:
    try:
        r = await client.get(
            _URL.format(ticker=ticker),
            params={"interval": "1d", "range": "1d"},
            headers={"User-Agent": _UA},
            timeout=8.0,
        )
        r.raise_for_status()
        meta = r.json()["chart"]["result"][0]["meta"]
        price = meta.get("regularMarketPrice")
        return float(price) if price else None
    except Exception:
        return None


async def get_prices(db: AsyncSession, tickers: list[str]) -> dict[str, dict]:
    """Return {ticker: {"price": float, "as_of": iso8601}} for every ticker that has a
    fresh cache entry or could be fetched. Tickers that can't be priced are omitted."""
    wanted = sorted({t.strip().upper() for t in tickers if t.strip()})
    if not wanted:
        return {}

    rows = (await db.execute(select(PriceCache).where(PriceCache.ticker.in_(wanted)))).scalars().all()
    cache = {r.ticker: r for r in rows}
    now = datetime.utcnow()

    out: dict[str, dict] = {}
    stale: list[str] = []
    for t in wanted:
        row = cache.get(t)
        if row and (now - row.as_of) < _TTL:
            out[t] = {"price": row.price, "as_of": row.as_of.isoformat()}
        else:
            stale.append(t)

    if stale:
        async with httpx.AsyncClient() as client:
            for t in stale:
                price = await _fetch_one(client, t)
                if price is None:
                    continue
                row = cache.get(t)
                if row:
                    row.price, row.as_of = price, now
                else:
                    db.add(PriceCache(ticker=t, price=price, as_of=now))
                out[t] = {"price": price, "as_of": now.isoformat()}
        await db.commit()

    return out
