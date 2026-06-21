from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from constants import ASSET_CLASSES, TAX_EFFICIENCIES
from database import get_db
from models import TickerTag
from schemas import (
    TickerTagSchema, TickerTagSuggestRequest, AutoTagRequest,
    ClassifyTiltsRequest, ClassifyTiltsResponse,
)
from services import ai as ai_svc
from services import classify as classify_svc
from services.ai import AIError

router = APIRouter(prefix="/tags", tags=["tags"])


async def load_tags(db: AsyncSession) -> dict[str, dict]:
    """Fetch all ticker tags as {ticker: {asset_class, tax_efficiency, name, expense_ratio}}."""
    result = await db.execute(select(TickerTag))
    return {
        t.ticker: {
            "asset_class": t.asset_class,
            "tax_efficiency": t.tax_efficiency,
            "name": t.name,
            "expense_ratio": t.expense_ratio,
            "style": t.style,
            "size": t.size,
            "sector": t.sector,
        }
        for t in result.scalars().all()
    }


@router.get("", response_model=list[TickerTagSchema])
async def list_tags(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TickerTag).order_by(TickerTag.ticker))
    return [
        TickerTagSchema(ticker=t.ticker, asset_class=t.asset_class,
                        tax_efficiency=t.tax_efficiency, name=t.name,
                        expense_ratio=t.expense_ratio)
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
        existing.expense_ratio = tag.expense_ratio
    else:
        db.add(TickerTag(ticker=ticker, asset_class=tag.asset_class,
                         tax_efficiency=tag.tax_efficiency, name=tag.name,
                         expense_ratio=tag.expense_ratio))
    await db.commit()
    return TickerTagSchema(ticker=ticker, asset_class=tag.asset_class,
                           tax_efficiency=tag.tax_efficiency, name=tag.name,
                           expense_ratio=tag.expense_ratio)


@router.post("/auto", response_model=list[TickerTagSchema])
async def auto_tag(req: AutoTagRequest, db: AsyncSession = Depends(get_db)):
    """Classify any tickers that aren't yet known, using their broker Description /
    Asset Type text (no AI). Existing tags are left untouched so manual overrides
    survive. Returns the resulting tag for every requested ticker."""
    out: list[TickerTagSchema] = []
    for item in req.items:
        ticker = item.ticker.strip().upper()
        if not ticker:
            continue
        existing = await db.get(TickerTag, ticker)
        if existing:
            out.append(TickerTagSchema(ticker=existing.ticker, asset_class=existing.asset_class,
                                       tax_efficiency=existing.tax_efficiency, name=existing.name,
                                       expense_ratio=existing.expense_ratio))
            continue
        asset_class, tax_eff, name = classify_svc.classify(ticker, item.description, item.asset_type)
        db.add(TickerTag(ticker=ticker, asset_class=asset_class, tax_efficiency=tax_eff, name=name))
        out.append(TickerTagSchema(ticker=ticker, asset_class=asset_class,
                                   tax_efficiency=tax_eff, name=name))
    await db.commit()
    return out


@router.post("/classify-tilts", response_model=ClassifyTiltsResponse)
async def classify_tilts(req: ClassifyTiltsRequest, db: AsyncSession = Depends(get_db)):
    """Fill style/size/sector for the given tickers using Gemini, persisting the results
    onto each TickerTag (creating a minimal row if one doesn't exist yet). Returns the
    tickers that were updated. No-ops (empty) without a key; 502 on a genuine AI failure."""
    items = [{"ticker": i.ticker.strip().upper(), "name": i.name or ""}
             for i in req.items if i.ticker.strip()]
    if not items:
        return ClassifyTiltsResponse(updated=[])
    try:
        results = await ai_svc.classify_tilts(items)
    except AIError as e:
        raise HTTPException(status_code=502, detail=str(e))
    if not results:
        return ClassifyTiltsResponse(updated=[])

    updated: list[str] = []
    for ticker, vals in results.items():
        row = await db.get(TickerTag, ticker)
        if row is None:
            # Minimal stub so the classification persists even for an untagged ticker.
            row = TickerTag(ticker=ticker, asset_class="US Stock", tax_efficiency="efficient",
                            name=next((i["name"] for i in items if i["ticker"] == ticker), None))
            db.add(row)
        if vals.get("style"):
            row.style = vals["style"]
        if vals.get("size"):
            row.size = vals["size"]
        if vals.get("sector"):
            row.sector = vals["sector"]
        updated.append(ticker)
    await db.commit()
    return ClassifyTiltsResponse(updated=sorted(updated))


@router.post("/suggest")
async def suggest_tag(req: TickerTagSuggestRequest):
    """Ask Gemini to classify an unknown ticker. Returns {asset_class, tax_efficiency,
    name} or {suggestion: None} when no key / not recognized."""
    suggestion = await ai_svc.suggest_ticker_tag(req.ticker.strip().upper())
    return {"ticker": req.ticker.strip().upper(), "suggestion": suggestion}
