import hashlib
import json
from datetime import datetime, timedelta
from typing import Awaitable, Callable

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import AICache
from schemas import (
    AdvisorRequest, AdvisorResponse, BergerTipsRequest, BergerTipsResponse, BergerTip,
    AdvisorQueryRequest, AdvisorQueryResponse,
)
from services import ai as ai_svc
from services.ai import AIError

router = APIRouter(prefix="/advisor", tags=["advisor"])

_TTL = timedelta(days=7)


def _friendly_ai_error(e: AIError) -> str:
    """Concise, non-leaky message for the client. The full exception is already logged
    server-side (services.ai logs via logger.exception); don't echo raw SDK text here."""
    msg = str(e)
    if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
        return "AI is rate-limited right now - try again in a moment."
    return "AI request failed - please try again."


async def _cached(db: AsyncSession, kind: str, summary: dict,
                  generator: Callable[[dict], Awaitable]):
    """Return a cached generator result for this (kind, summary) if present and fresh;
    otherwise generate, store, and return. Never caches a falsy result, so failures /
    no-key no-ops retry next time."""
    key = hashlib.sha256((kind + json.dumps(summary, sort_keys=True)).encode()).hexdigest()
    row = await db.get(AICache, key)
    if row and (datetime.utcnow() - row.created_at) < _TTL:
        return json.loads(row.response)

    result = await generator(summary)
    if result:
        if row:
            row.response = json.dumps(result)
            row.created_at = datetime.utcnow()
        else:
            db.add(AICache(key=key, response=json.dumps(result), created_at=datetime.utcnow()))
        await db.commit()
    return result


@router.post("/insights", response_model=AdvisorResponse)
async def insights(req: AdvisorRequest, db: AsyncSession = Depends(get_db)):
    """Generate tax-location insights from an anonymized portfolio summary (cached by
    portfolio hash). Returns an empty list when GEMINI_API_KEY is unset; raises 502 with
    a detail message when the AI call genuinely fails (so the UI can show why)."""
    try:
        result = await _cached(db, "insights", req.summary, ai_svc.portfolio_insights)
    except AIError as e:
        raise HTTPException(status_code=502, detail=_friendly_ai_error(e))
    return AdvisorResponse(insights=result or [])


@router.post("/tips", response_model=BergerTipsResponse)
async def tips(req: BergerTipsRequest, db: AsyncSession = Depends(get_db)):
    """Generate practical index-investing tips tailored to this portfolio (cached by
    portfolio hash). Returns an empty list when GEMINI_API_KEY is unset; raises 502 with
    a detail message when the AI call genuinely fails (so the UI can show why)."""
    try:
        result = await _cached(db, "tips", req.summary, ai_svc.berger_tips)
    except AIError as e:
        raise HTTPException(status_code=502, detail=_friendly_ai_error(e))
    tip_objs = [BergerTip(**t) for t in (result or [])]
    return BergerTipsResponse(tips=tip_objs)


@router.post("/ask", response_model=AdvisorQueryResponse)
async def ask(req: AdvisorQueryRequest):
    """Free-form, conversational Q&A answered as a fee-only RIA / fiduciary, grounded in the
    portfolio snapshot. Not cached (answers vary per question and carry conversation context).
    Returns an empty answer when GEMINI_API_KEY is unset; raises 502 with a detail message when
    the AI call genuinely fails."""
    try:
        answer = await ai_svc.advisor_query(req.summary, req.question, req.history)
    except AIError as e:
        raise HTTPException(status_code=502, detail=_friendly_ai_error(e))
    return AdvisorQueryResponse(answer=answer or "")
