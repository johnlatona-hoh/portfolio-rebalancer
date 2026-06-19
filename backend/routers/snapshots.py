import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, Snapshot
from schemas import (
    SnapshotSaveRequest, SnapshotSaveResponse,
    SnapshotLoadRequest, SnapshotLoadResponse,
    SnapshotDeleteRequest, SnapshotMeta,
)
from services import crypto

router = APIRouter(prefix="/snapshots", tags=["snapshots"])


async def _require_user(email: str, pin: str, db: AsyncSession) -> User:
    """Look up user by email, verify PIN. Raises 401 on any mismatch (no user enumeration)."""
    user = (
        await db.execute(select(User).where(User.email == email.lower()))
    ).scalar_one_or_none()
    if not user or user.pin_hash != crypto.hash_pin(pin, user_id=user.id):
        raise HTTPException(401, "Email or PIN is incorrect.")
    return user


@router.post("", response_model=SnapshotSaveResponse)
async def save_snapshot(req: SnapshotSaveRequest, db: AsyncSession = Depends(get_db)):
    """Encrypt and store a portfolio snapshot for the authenticated user."""
    user = await _require_user(req.email, req.pin, db)
    try:
        token = crypto.encrypt_payload(req.payload)
    except RuntimeError as e:
        raise HTTPException(503, str(e))

    snap = Snapshot(
        id=uuid.uuid4().hex,
        pin_hash="",  # no longer used for user-owned snapshots
        payload=token,
        label=req.label,
        description=req.description,
        user_id=user.id,
    )
    db.add(snap)
    await db.commit()
    return SnapshotSaveResponse(id=snap.id, created_at=snap.created_at)


@router.post("/load", response_model=SnapshotLoadResponse)
async def load_snapshot(req: SnapshotLoadRequest, db: AsyncSession = Depends(get_db)):
    """Return a decrypted snapshot owned by the authenticated user."""
    user = await _require_user(req.email, req.pin, db)
    snap = (
        await db.execute(
            select(Snapshot).where(
                Snapshot.id == req.id,
                Snapshot.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if not snap:
        raise HTTPException(404, "Snapshot not found.")

    try:
        payload = crypto.decrypt_payload(snap.payload)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception:
        raise HTTPException(500, "Snapshot could not be decrypted.")

    return SnapshotLoadResponse(
        id=snap.id,
        payload=payload,
        label=snap.label,
        description=snap.description,
        created_at=snap.created_at,
    )


@router.delete("/{snapshot_id}")
async def delete_snapshot(
    snapshot_id: str,
    req: SnapshotDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete a snapshot. Verifies ownership before deletion."""
    user = await _require_user(req.email, req.pin, db)
    snap = (
        await db.execute(
            select(Snapshot).where(
                Snapshot.id == snapshot_id,
                Snapshot.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if not snap:
        raise HTTPException(404, "Snapshot not found.")
    await db.delete(snap)
    await db.commit()
    return {"deleted": snapshot_id}
