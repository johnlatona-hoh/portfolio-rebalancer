from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from schemas import AnalyzeRequest, AnalyzeResponse, ProjectRequest, ProjectResponse
from services import rebalance, projections
from routers.tags import load_tags

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest, db: AsyncSession = Depends(get_db)):
    """Roll holdings into asset classes, compute deltas vs. target, and produce a
    tax-aware trade plan plus an asset-location grade."""
    tags = await load_tags(db)
    holdings = [h.model_dump() for h in req.holdings]
    return rebalance.analyze(holdings, req.targets, tags)


@router.post("/project", response_model=ProjectResponse)
async def project(req: ProjectRequest):
    """Monte Carlo + deterministic projection of the portfolio forward. Pure math -
    no DB access needed."""
    return projections.project(
        req.value_by_class,
        horizon_months=req.horizon_months,
        n_paths=req.n_paths,
        assumptions=req.assumptions,
    )
