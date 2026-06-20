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
    tax-aware trade plan plus an asset-location grade. When glide_path=True the
    targets are adjusted via interpolate_glide_path() before the engine runs."""
    tags = await load_tags(db)
    holdings = [h.model_dump() for h in req.holdings]

    if req.glide_path and req.current_age is not None and req.equity_pct_now is not None:
        targets = rebalance.interpolate_glide_path(
            req.current_age,
            req.retirement_age if req.retirement_age is not None else req.current_age + 30,
            req.equity_pct_now,
            req.equity_pct_retirement if req.equity_pct_retirement is not None else req.equity_pct_now,
            req.targets,
        )
    else:
        targets = req.targets

    result = rebalance.analyze(holdings, targets, tags, gain_aversion=req.gain_aversion,
                               drift_band_pct=req.drift_band_pct)
    result["effective_targets"] = targets if req.glide_path else None
    return result


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
