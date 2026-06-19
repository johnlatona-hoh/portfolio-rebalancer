from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

AccountType = Literal["taxable", "tax_deferred", "tax_free"]
TaxEfficiency = Literal["efficient", "inefficient", "neutral"]


# ---------- Portfolio input ----------

class Holding(BaseModel):
    account_name: str
    account_type: AccountType
    ticker: str
    quantity: float
    cost_basis: float = 0.0
    current_value: float


class AnalyzeRequest(BaseModel):
    holdings: list[Holding]
    # target percentages keyed by asset class, e.g. {"US Stock": 40, "Bond": 25, ...}
    targets: dict[str, float]
    # 0..1 slider: 0 = best allocation (default), 1 = avoid all taxable realized gains.
    gain_aversion: float = 0.0


# ---------- Allocation + trades output ----------

class ClassAllocation(BaseModel):
    asset_class: str            # sub-class (e.g. "Muni Bond")
    group: str                  # display parent (e.g. "Bond")
    value: float
    pct: float
    target_pct: float
    delta_value: float          # +buy / -sell to reach target (blended)
    post_pct: float = 0.0       # blended pct after applying the trade plan
    drift_pct: float = 0.0      # post_pct - target_pct (residual misalignment)


class AccountAllocation(BaseModel):
    account_name: str
    account_type: AccountType
    value: float
    by_class: dict[str, float]  # asset_class -> value within this account


class Trade(BaseModel):
    account_name: str
    account_type: AccountType
    action: Literal["BUY", "SELL", "HOLD"]
    asset_class: str
    ticker: str | None = None
    amount: float
    tax_note: str
    est_gain: float = 0.0   # estimated realized gain (taxable SELLs only)


class LocationGrade(BaseModel):
    score: int                  # 1-10, 10 = best
    misplaced_count: int
    total_holdings: int
    inefficient_value: float
    misplaced_value: float
    reasons: list[str]
    methodology: str


class AnalyzeResponse(BaseModel):
    total_value: float
    blended: list[ClassAllocation]
    by_account: list[AccountAllocation]
    trades: list[Trade]
    grade: LocationGrade
    realized_gains: float = 0.0       # total estimated gains realized by the trade plan
    max_drift_pct: float = 0.0        # largest post-plan deviation from any target (pct pts)
    unknown_tickers: list[str]  # tickers with no tag - caller should classify


# ---------- Projection ----------

class ProjectRequest(BaseModel):
    # current dollar value per asset class
    value_by_class: dict[str, float]
    horizon_months: int = Field(ge=1, le=1200)
    n_paths: int = Field(default=1000, ge=100, le=10000)
    # optional per-class overrides: {"US Stock": {"mean": 0.05, "stdev": 0.2}}
    assumptions: dict[str, dict[str, float]] | None = None


class ProjectionPoint(BaseModel):
    month: int
    p10: float
    p50: float
    p90: float
    deterministic: float


class ProjectResponse(BaseModel):
    points: list[ProjectionPoint]
    starting_value: float


# ---------- Ticker tags ----------

class TickerTagSchema(BaseModel):
    ticker: str
    asset_class: str
    tax_efficiency: TaxEfficiency
    name: str | None = None


class TickerTagSuggestRequest(BaseModel):
    ticker: str


class AutoTagItem(BaseModel):
    ticker: str
    description: str = ""
    asset_type: str = ""


class AutoTagRequest(BaseModel):
    items: list[AutoTagItem]


# ---------- Snapshots ----------

class SnapshotSaveRequest(BaseModel):
    pin: str = Field(min_length=4)
    payload: dict
    label: str | None = None


class SnapshotSaveResponse(BaseModel):
    id: str
    created_at: datetime


class SnapshotLoadRequest(BaseModel):
    pin: str
    id: str | None = None  # if omitted, returns the most recent snapshot for this PIN


class SnapshotMeta(BaseModel):
    id: str
    label: str | None
    created_at: datetime


class SnapshotLoadResponse(BaseModel):
    id: str
    payload: dict
    label: str | None
    created_at: datetime


# ---------- Advisor ----------

class AdvisorRequest(BaseModel):
    # anonymized portfolio summary - classes, account types, grade. No PII.
    summary: dict


class AdvisorResponse(BaseModel):
    insights: list[str]


class BergerTipsRequest(BaseModel):
    summary: dict   # same anonymized portfolio summary as AdvisorRequest


class BergerTip(BaseModel):
    title: str
    body: str
    advantage: str = ""
    disadvantage: str = ""


class BergerTipsResponse(BaseModel):
    tips: list[BergerTip]
