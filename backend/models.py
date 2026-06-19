from datetime import datetime

from sqlalchemy import String, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class TickerTag(Base):
    """Maps a ticker symbol to its asset class and tax-efficiency profile so the
    rebalancing engine knows how to treat it. Seeded with common index tickers;
    unknown tickers get classified by the user (optionally Gemini-suggested) and
    persisted here for next time."""

    __tablename__ = "ticker_tags"

    ticker: Mapped[str] = mapped_column(String, primary_key=True)
    asset_class: Mapped[str] = mapped_column(String, index=True)      # one of ASSET_CLASSES
    tax_efficiency: Mapped[str] = mapped_column(String)              # efficient | inefficient | neutral
    name: Mapped[str | None] = mapped_column(String, nullable=True)  # human label, e.g. "Vanguard Total Stock"
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Snapshot(Base):
    """A PIN-keyed, encrypted point-in-time portfolio capture. The payload is an
    encrypted JSON blob (holdings + targets + computed trades). It is PII-light:
    tickers, quantities, and account *types* only - no names or account numbers."""

    __tablename__ = "snapshots"

    id: Mapped[str] = mapped_column(String, primary_key=True)        # uuid4 hex
    pin_hash: Mapped[str] = mapped_column(String, index=True)        # salted hash of the user PIN
    payload: Mapped[str] = mapped_column(Text)                       # Fernet-encrypted JSON
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
