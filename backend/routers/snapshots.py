import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Snapshot
from schemas import (
    SnapshotSaveRequest, SnapshotSaveResponse,
    SnapshotLoadRequest, SnapshotLoadResponse,
)
from services import crypto

router = APIRouter(prefix="/snapshots", tags=["snapshots"])


@router.post("", response_model=SnapshotSaveResponse)
async def save_snapshot(req: SnapshotSaveRequest, db: AsyncSession = Depends(get_db)):
    """Encrypt and store a portfolio snapshot keyed by a salted PIN hash."""
    try:
        token = crypto.encrypt_payload(req.payload)
    except RuntimeError as e:
        raise HTTPException(503, str(e))

    snap = Snapshot(
        id=uuid.uuid4().hex,
        pin_hash=crypto.hash_pin(req.pin),
        payload=token,
        label=req.label,
    )
    db.add(snap)
    await db.commit()
    return SnapshotSaveResponse(id=snap.id, created_at=snap.created_at)


@router.post("/load", response_model=SnapshotLoadResponse)
async def load_snapshot(req: SnapshotLoadRequest, db: AsyncSession = Depends(get_db)):
    """Return a decrypted snapshot for the given PIN. Without an id, returns the most
    recent snapshot saved under that PIN."""
    pin_hash = crypto.hash_pin(req.pin)
    stmt = select(Snapshot).where(Snapshot.pin_hash == pin_hash)
    if req.id:
        stmt = stmt.where(Snapshot.id == req.id)
    stmt = stmt.order_by(Snapshot.created_at.desc()).limit(1)

    snap = (await db.execute(stmt)).scalar_one_or_none()
    if not snap:
        raise HTTPException(404, "No snapshot found for that PIN.")

    try:
        payload = crypto.decrypt_payload(snap.payload)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception:
        raise HTTPException(500, "Snapshot could not be decrypted (wrong encryption key?).")

    return SnapshotLoadResponse(
        id=snap.id, payload=payload, label=snap.label, created_at=snap.created_at
    )
