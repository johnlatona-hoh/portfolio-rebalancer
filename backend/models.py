from datetime import datetime

from sqlalchemy import String, DateTime, Text, Float, Integer
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


class PriceCache(Base):
    """Last-known price per ticker, refreshed at most once per 24h. Lets users refresh
    stale CSV values without re-uploading. New table - created by create_tables()."""

    __tablename__ = "rebalancer_price_cache"

    ticker: Mapped[str] = mapped_column(String, primary_key=True)
    price: Mapped[float] = mapped_column(Float)
    as_of: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AICache(Base):
    """Caches Gemini advisor output keyed by a hash of (kind + portfolio summary), so an
    unchanged portfolio viewed repeatedly does not re-query the API. TTL enforced in the
    router. New table - created by create_tables(), no migration needed."""

    __tablename__ = "rebalancer_ai_cache"

    key: Mapped[str] = mapped_column(String, primary_key=True)  # sha256(kind + canonical-JSON summary)
    response: Mapped[str] = mapped_column(Text)                 # JSON-encoded generator result
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
    # Equity-tilt classification (seed or Gemini-filled; None -> inferred from name or "Unclassified").
    style: Mapped[str | None] = mapped_column(String, nullable=True)   # growth | value | blend
    size: Mapped[str | None] = mapped_column(String, nullable=True)    # large | mid | small | total
    sector: Mapped[str | None] = mapped_column(String, nullable=True)  # GICS sector | "Broad"
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class RebalanceEvent(Base):
    """A saved rebalance snapshot - recorded explicitly by the user (not auto-generated).
    Captures the portfolio state + grade at the time of saving for drift tracking."""

    __tablename__ = "rebalancer_rebalance_events"

    id: Mapped[str] = mapped_column(String, primary_key=True)         # uuid4 hex
    user_id: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    total_value: Mapped[float] = mapped_column(Float)
    max_drift_pct: Mapped[float] = mapped_column(Float, default=0.0)   # largest |drift| pct-point
    allocation_json: Mapped[str] = mapped_column(Text)                  # JSON {class: pct}
    targets_json: Mapped[str] = mapped_column(Text)                     # JSON {class: target_pct}
    grade_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    trade_count: Mapped[int] = mapped_column(Integer, default=0)
    realized_gains_total: Mapped[float] = mapped_column(Float, default=0.0)


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
