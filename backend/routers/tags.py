from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from constants import ASSET_CLASSES, TAX_EFFICIENCIES
from database import get_db
from models import TickerTag
from schemas import TickerTagSchema, TickerTagSuggestRequest
from services import ai as ai_svc

router = APIRouter(prefix="/tags", tags=["tags"])


async def load_tags(db: AsyncSession) -> dict[str, dict]:
    """Fetch all ticker tags as {ticker: {asset_class, tax_efficiency, name}}."""
    result = await db.execute(select(TickerTag))
    return {
        t.ticker: {"asset_class": t.asset_class, "tax_efficiency": t.tax_efficiency, "name": t.name}
        for t in result.scalars().all()
    }


@router.get("", response_model=list[TickerTagSchema])
async def list_tags(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TickerTag).order_by(TickerTag.ticker))
    return [
        TickerTagSchema(ticker=t.ticker, asset_class=t.asset_class,
                        tax_efficiency=t.tax_efficiency, name=t.name)
        for t in result.scalars().all()
    ]


@router.post("", response_model=TickerTagSchema)
async def upsert_tag(tag: TickerTagSchema, db: AsyncSession = Depends(get_db)):
    if tag.asset_class not in ASSET_CLASSES:
        raise HTTPException(400, f"asset_class must be one of {ASSET_CLASSES}")
    if tag.tax_efficiency not in TAX_EFFICIENCIES:
        raise HTTPException(400, f"tax_efficiency must be one of {TAX_EFFICIENCIES}")

    ticker = tag.ticker.strip().upper()
    existing = await db.get(TickerTag, ticker)
    if existing:
        existing.asset_class = tag.asset_class
        existing.tax_efficiency = tag.tax_efficiency
        existing.name = tag.name
    else:
        db.add(TickerTag(ticker=ticker, asset_class=tag.asset_class,
                         tax_efficiency=tag.tax_efficiency, name=tag.name))
    await db.commit()
    return TickerTagSchema(ticker=ticker, asset_class=tag.asset_class,
                           tax_efficiency=tag.tax_efficiency, name=tag.name)


@router.post("/suggest")
async def suggest_tag(req: TickerTagSuggestRequest):
    """Ask Gemini to classify an unknown ticker. Returns {asset_class, tax_efficiency,
    name} or {suggestion: None} when no key / not recognized."""
    suggestion = await ai_svc.suggest_ticker_tag(req.ticker.strip().upper())
    return {"ticker": req.ticker.strip().upper(), "suggestion": suggestion}
