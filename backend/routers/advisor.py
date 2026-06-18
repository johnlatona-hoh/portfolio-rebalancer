from fastapi import APIRouter

from schemas import AdvisorRequest, AdvisorResponse
from services import ai as ai_svc

router = APIRouter(prefix="/advisor", tags=["advisor"])


@router.post("/insights", response_model=AdvisorResponse)
async def insights(req: AdvisorRequest):
    """Generate tax-location insights from an anonymized portfolio summary. Returns an
    empty list when GEMINI_API_KEY is unset (AI no-ops cleanly)."""
    result = await ai_svc.portfolio_insights(req.summary)
    return AdvisorResponse(insights=result or [])
