import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import RebalanceEvent
from schemas import SaveRebalanceRequest, RebalanceEventOut

router = APIRouter(prefix="/history", tags=["history"])

MAX_EVENTS = 50  # per user; oldest are dropped when exceeded


def _to_out(ev: RebalanceEvent) -> RebalanceEventOut:
    return RebalanceEventOut(
        id=ev.id,
        user_id=ev.user_id,
        created_at=ev.created_at,
        label=ev.label,
        total_value=ev.total_value,
        max_drift_pct=ev.max_drift_pct,
        allocation_json=json.loads(ev.allocation_json),
        targets_json=json.loads(ev.targets_json),
        grade_score=ev.grade_score,
        trade_count=ev.trade_count,
        realized_gains_total=ev.realized_gains_total,
    )


@router.post("", response_model=RebalanceEventOut, status_code=201)
async def save_event(req: SaveRebalanceRequest, db: AsyncSession = Depends(get_db)):
    """Record an explicit rebalance snapshot for the authenticated user."""
    if not req.user_id:
        raise HTTPException(401, "user_id is required.")

    ev = RebalanceEvent(
        id=uuid.uuid4().hex,
        user_id=req.user_id,
        label=req.label,
        total_value=req.total_value,
        max_drift_pct=req.max_drift_pct,
        allocation_json=json.dumps(req.allocation_json),
        targets_json=json.dumps(req.targets_json),
        grade_score=req.grade_score,
        trade_count=req.trade_count,
        realized_gains_total=req.realized_gains_total,
    )
    db.add(ev)

    # Drop oldest events if the user exceeds MAX_EVENTS.
    rows = (
        await db.execute(
            select(RebalanceEvent)
            .where(RebalanceEvent.user_id == req.user_id)
            .order_by(RebalanceEvent.created_at.asc())
        )
    ).scalars().all()
    if len(rows) >= MAX_EVENTS:
        for old in rows[: len(rows) - MAX_EVENTS + 1]:
            await db.delete(old)

    await db.commit()
    await db.refresh(ev)
    return _to_out(ev)


@router.get("", response_model=list[RebalanceEventOut])
async def list_events(user_id: str, db: AsyncSession = Depends(get_db)):
    """Return saved rebalance events for the user, most recent first."""
    if not user_id:
        raise HTTPException(401, "user_id is required.")
    rows = (
        await db.execute(
            select(RebalanceEvent)
            .where(RebalanceEvent.user_id == user_id)
            .order_by(RebalanceEvent.created_at.desc())
            .limit(MAX_EVENTS)
        )
    ).scalars().all()
    return [_to_out(ev) for ev in rows]


@router.delete("/{event_id}", status_code=204)
async def delete_event(event_id: str, user_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a rebalance event. Returns 404 if not found or owned by a different user."""
    ev = (
        await db.execute(
            select(RebalanceEvent).where(
                RebalanceEvent.id == event_id,
                RebalanceEvent.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "Event not found.")
    await db.delete(ev)
    await db.commit()
