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
    return rebalance.analyze(holdings, req.targets, tags, gain_aversion=req.gain_aversion,
                             drift_band_pct=req.drift_band_pct)


@router.post("/project", response_model=ProjectResponse)
async def project(req: ProjectRequest):
    """Monte Carlo + deterministic projection of the portfolio forward. Pure math -
    no DB access needed. Optionally overlays a benchmark allocation projected with the
    same starting dollars (apples-to-apples)."""
    result = projections.project(
        req.value_by_class,
        horizon_months=req.horizon_months,
        n_paths=req.n_paths,
        assumptions=req.assumptions,
        fee_drag=req.fee_drag,
        monthly_contribution=req.monthly_contribution,
    )

    if req.benchmark:
        starting_value = sum(req.value_by_class.values())
        total_weight = sum(req.benchmark.values()) or 1.0
        bench_value_by_class = {
            cls: (w / total_weight) * starting_value for cls, w in req.benchmark.items()
        }
        bench = projections.project(
            bench_value_by_class,
            horizon_months=req.horizon_months,
            # only the benchmark median line is drawn, so fewer paths is plenty
            n_paths=min(req.n_paths, 400),
            assumptions=req.assumptions,
            # Benchmarks represent low-cost index funds: do NOT subtract the portfolio's
            # own expense ratio from the benchmark, or a fee'd portfolio would unfairly
            # drag the index line down too (breaks the apples-to-apples comparison).
            fee_drag=0.0,
            monthly_contribution=req.monthly_contribution,
        )
        result["benchmark_points"] = bench["points"]

    return result
