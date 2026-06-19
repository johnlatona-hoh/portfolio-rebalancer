import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, Snapshot
from schemas import UserRegisterRequest, UserLoginRequest, UserResponse, SnapshotMeta, LoginResponse
from services import crypto

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/register", response_model=LoginResponse, status_code=201)
async def register(req: UserRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Create a new account. Returns 409 if the email is already registered."""
    existing = (
        await db.execute(select(User).where(User.email == req.email.lower()))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "An account with that email already exists.")

    user_id = uuid.uuid4().hex
    user = User(
        id=user_id,
        email=req.email.lower(),
        pin_hash=crypto.hash_pin(req.pin, user_id=user_id),
    )
    db.add(user)
    await db.commit()
    return LoginResponse(
        user=UserResponse(id=user.id, email=user.email, created_at=user.created_at),
        snapshots=[],
    )


@router.post("/login", response_model=LoginResponse)
async def login(req: UserLoginRequest, db: AsyncSession = Depends(get_db)):
    """Verify PIN and return the user record plus all their snapshots (reverse chron)."""
    user = (
        await db.execute(select(User).where(User.email == req.email.lower()))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(401, "Email or PIN is incorrect.")
    if user.pin_hash != crypto.hash_pin(req.pin, user_id=user.id):
        raise HTTPException(401, "Email or PIN is incorrect.")

    rows = (
        await db.execute(
            select(Snapshot)
            .where(Snapshot.user_id == user.id)
            .order_by(Snapshot.created_at.desc())
        )
    ).scalars().all()

    snapshots = [
        SnapshotMeta(id=s.id, label=s.label, description=s.description, created_at=s.created_at)
        for s in rows
    ]
    return LoginResponse(
        user=UserResponse(id=user.id, email=user.email, created_at=user.created_at),
        snapshots=snapshots,
    )
