"""Idempotent seeding of common index/ETF ticker tags.

Run once after the DB is up (locally or as a one-off on Render):
    python seed_tickers.py
Safe to re-run — it upserts and leaves any user-edited tags' newer values in place
only insofar as it overwrites with the canonical seed values for seeded tickers.
"""

import asyncio

from sqlalchemy import select

from database import AsyncSessionLocal, create_tables
from models import TickerTag
from seed_data import SEED_TICKERS


async def seed():
    await create_tables()
    async with AsyncSessionLocal() as db:
        existing_rows = (await db.execute(select(TickerTag))).scalars().all()
        by_ticker = {t.ticker: t for t in existing_rows}

        added = updated = 0
        for ticker, (asset_class, tax_eff, name) in SEED_TICKERS.items():
            row = by_ticker.get(ticker)
            if row:
                row.asset_class, row.tax_efficiency, row.name = asset_class, tax_eff, name
                updated += 1
            else:
                db.add(TickerTag(ticker=ticker, asset_class=asset_class,
                                 tax_efficiency=tax_eff, name=name))
                added += 1
        await db.commit()
        print(f"Seed complete: {added} added, {updated} updated, {len(SEED_TICKERS)} total.")


if __name__ == "__main__":
    asyncio.run(seed())
