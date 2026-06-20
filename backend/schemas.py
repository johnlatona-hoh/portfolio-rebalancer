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
    # rebalance band: classes within +/- this many pct points of target are left alone.
    drift_band_pct: float = 0.0


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
    within_band: bool = False   # true when left untouched by the rebalance band


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


class HoldingRisk(BaseModel):
    ticker: str
    account_name: str
    asset_class: str
    current_value: float
    portfolio_pct: float
    account_pct: float
    expected_return_pct: float   # e.g. 7.0 for US Stock (annual)
    volatility_pct: float        # e.g. 16.0 (annual std dev)
    max_drawdown_pct: float      # e.g. -50.0 (negative, historical worst case)
    fee_pct: float               # annual expense ratio %, e.g. 0.03
    annual_fee_cost: float       # value * expense ratio ($/yr)


class AccountRisk(BaseModel):
    account_name: str
    account_type: AccountType
    value: float
    expected_return_pct: float
    volatility_pct: float
    max_drawdown_pct: float      # negative
    fee_pct: float               # value-weighted expense ratio %
    annual_fee_cost: float       # total $/yr for this account


class PortfolioRisk(BaseModel):
    expected_return_pct: float
    volatility_pct: float
    max_drawdown_pct: float              # negative
    diversification_benefit_pct: float  # % of vol removed by diversification
    largest_position_pct: float
    top5_concentration_pct: float
    weighted_fee_pct: float             # value-weighted expense ratio % across everything
    annual_fee_cost: float              # total $/yr across all holdings
    by_account: list[AccountRisk]
    by_holding: list[HoldingRisk]        # sorted by value desc


class HarvestLot(BaseModel):
    ticker: str
    account_name: str
    asset_class: str | None = None
    current_value: float
    cost_basis: float
    unrealized_loss: float   # negative (current_value - cost_basis)
    loss_pct: float          # negative %, loss relative to cost basis


class AnalyzeResponse(BaseModel):
    total_value: float
    blended: list[ClassAllocation]
    by_account: list[AccountAllocation]
    trades: list[Trade]
    grade: LocationGrade
    realized_gains: float = 0.0       # total estimated gains realized by the trade plan
    max_drift_pct: float = 0.0        # largest post-plan deviation from any target (pct pts)
    unknown_tickers: list[str]  # tickers with no tag - caller should classify
    risk: PortfolioRisk | None = None
    tax_loss_harvest: list[HarvestLot] = []  # taxable lots at an unrealized loss


# ---------- Projection ----------

class ProjectRequest(BaseModel):
    # current dollar value per asset class
    value_by_class: dict[str, float]
    horizon_months: int = Field(ge=1, le=1200)
    n_paths: int = Field(default=1000, ge=100, le=10000)
    # optional per-class overrides: {"US Stock": {"mean": 0.05, "stdev": 0.2}}
    assumptions: dict[str, dict[str, float]] | None = None
    # annual expense-ratio decimal subtracted from returns (net-of-fees view)
    fee_drag: float = 0.0
    # dollars added at month-end (negative = withdrawal), spread pro-rata by weight
    monthly_contribution: float = 0.0
    # optional benchmark allocation as class-weight percentages, e.g. {"US Stock": 60,
    # "International": 40}; projected with the same starting dollars for an overlay line
    benchmark: dict[str, float] | None = None


class ProjectionPoint(BaseModel):
    month: int
    p10: float
    p50: float
    p90: float
    deterministic: float


class ProjectResponse(BaseModel):
    points: list[ProjectionPoint]
    starting_value: float
    benchmark_points: list[ProjectionPoint] | None = None  # overlay, same starting value


# ---------- Ticker tags ----------

class TickerTagSchema(BaseModel):
    ticker: str
    asset_class: str
    tax_efficiency: TaxEfficiency
    name: str | None = None
    expense_ratio: float | None = None   # annual decimal, e.g. 0.0003 = 0.03%; None -> class fallback


class TickerTagSuggestRequest(BaseModel):
    ticker: str


class AutoTagItem(BaseModel):
    ticker: str
    description: str = ""
    asset_type: str = ""


class AutoTagRequest(BaseModel):
    items: list[AutoTagItem]


# ---------- Users ----------

class UserRegisterRequest(BaseModel):
    email: str
    pin: str = Field(min_length=4)


class UserLoginRequest(BaseModel):
    email: str
    pin: str


class UserResponse(BaseModel):
    id: str
    email: str
    created_at: datetime


class SnapshotMeta(BaseModel):
    id: str
    label: str | None
    description: str | None = None
    created_at: datetime


class LoginResponse(BaseModel):
    user: UserResponse
    snapshots: list[SnapshotMeta]


# ---------- Snapshots ----------

class SnapshotSaveRequest(BaseModel):
    email: str
    pin: str
    payload: dict
    label: str
    description: str = ""


class SnapshotSaveResponse(BaseModel):
    id: str
    created_at: datetime


class SnapshotLoadRequest(BaseModel):
    email: str
    pin: str
    id: str


class SnapshotLoadResponse(BaseModel):
    id: str
    payload: dict
    label: str | None
    description: str | None = None
    created_at: datetime


class SnapshotDeleteRequest(BaseModel):
    email: str
    pin: str


# ---------- Rebalance history ----------

class SaveRebalanceRequest(BaseModel):
    user_id: str
    label: str | None = None
    total_value: float
    max_drift_pct: float = 0.0
    allocation_json: dict[str, float]   # {class: blended_pct}
    targets_json: dict[str, float]      # {class: target_pct}
    grade_score: int | None = None
    trade_count: int = 0
    realized_gains_total: float = 0.0


class RebalanceEventOut(BaseModel):
    id: str
    user_id: str
    created_at: datetime
    label: str | None
    total_value: float
    max_drift_pct: float
    allocation_json: dict[str, float]
    targets_json: dict[str, float]
    grade_score: int | None
    trade_count: int
    realized_gains_total: float


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
