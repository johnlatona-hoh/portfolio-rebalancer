from fastapi import APIRouter

from schemas import AdvisorRequest, AdvisorResponse, BergerTipsRequest, BergerTipsResponse, BergerTip
from services import ai as ai_svc

router = APIRouter(prefix="/advisor", tags=["advisor"])


@router.post("/insights", response_model=AdvisorResponse)
async def insights(req: AdvisorRequest):
    """Generate tax-location insights from an anonymized portfolio summary. Returns an
    empty list when GEMINI_API_KEY is unset (AI no-ops cleanly)."""
    result = await ai_svc.portfolio_insights(req.summary)
    return AdvisorResponse(insights=result or [])


@router.post("/tips", response_model=BergerTipsResponse)
async def tips(req: BergerTipsRequest):
    """Generate Rob Berger-style practical tips tailored to this portfolio. Returns an
    empty list when GEMINI_API_KEY is unset."""
    result = await ai_svc.berger_tips(req.summary)
    tip_objs = [BergerTip(**t) for t in (result or [])]
    return BergerTipsResponse(tips=tip_objs)
