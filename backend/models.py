from datetime import datetime

from sqlalchemy import String, DateTime, Text, Index, Float
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class User(Base):
    """Email + PIN account for multi-user snapshot storage.
    PIN is never stored plaintext - only a per-user salted HMAC-SHA256 hash."""

    __tablename__ = "rebalancer_users"

    id: Mapped[str] = mapped_column(String, primary_key=True)       # uuid4 hex
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    pin_hash: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TickerTag(Base):
    """Maps a ticker symbol to its asset class and tax-efficiency profile so the
    rebalancing engine knows how to treat it. Seeded with common index tickers;
    unknown tickers get classified by the user (optionally Gemini-suggested) and
    persisted here for next time."""

    __tablename__ = "rebalancer_ticker_tags"

    ticker: Mapped[str] = mapped_column(String, primary_key=True)
    asset_class: Mapped[str] = mapped_column(String, index=True)      # one of ASSET_CLASSES
    tax_efficiency: Mapped[str] = mapped_column(String)              # efficient | inefficient | neutral
    name: Mapped[str | None] = mapped_column(String, nullable=True)  # human label, e.g. "Vanguard Total Stock"
    expense_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)  # annual decimal, e.g. 0.0003 = 0.03%; None -> class fallback
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Snapshot(Base):
    """A user-owned, encrypted point-in-time portfolio capture. The payload is an
    encrypted JSON blob (holdings + targets + computed trades). It is PII-light:
    tickers, quantities, and account *types* only - no names or account numbers.

    user_id and description are added via run_migrations() ALTER TABLE on existing
    deployments (may be NULL on old rows)."""

    __tablename__ = "rebalancer_snapshots"

    id: Mapped[str] = mapped_column(String, primary_key=True)           # uuid4 hex
    pin_hash: Mapped[str] = mapped_column(String, index=True)           # legacy: old PIN-keyed rows
    payload: Mapped[str] = mapped_column(Text)                          # Fernet-encrypted JSON
    label: Mapped[str | None] = mapped_column(String, nullable=True)    # user-chosen title
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user_id: Mapped[str | None] = mapped_column(String, nullable=True)  # FK -> users.id
    description: Mapped[str | None] = mapped_column(String, nullable=True, default="")
