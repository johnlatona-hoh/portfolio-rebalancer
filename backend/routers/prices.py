from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services import prices as price_svc

router = APIRouter(prefix="/prices", tags=["prices"])


@router.get("")
async def get_prices(
    tickers: str = Query(..., description="comma-separated ticker symbols, e.g. VTI,BND"),
    db: AsyncSession = Depends(get_db),
):
    """Return latest prices (24h-cached) for the requested tickers. Tickers that cannot
    be priced are omitted from the result, so the caller keeps their existing value."""
    result = await price_svc.get_prices(db, tickers.split(","))
    return {"prices": result}
