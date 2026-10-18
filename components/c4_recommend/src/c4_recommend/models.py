"""
Data contracts for C4 (personalised prevention recommendations).

Inputs follow the team contracts in `contracts/`:
  * C3 -> C4 : contracts/c3_risk.schema.json      (risk score + top SHAP factors)
  * C2 -> C4 : contracts/c2_features.schema.json  (feature row with threshold breaches)
Output (C4 -> app): contracts/c4_plan.schema.json

Pydantic validation rejects garbage input (risk score of 5, negative overs,
future dates, unknown session types) with a clear 422 error instead of
producing a nonsense recommendation.

Bowlers are identified by anonymised codes only (repo rule: never names).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator

BOWLER_ID = r"^[A-Za-z0-9_-]{2,24}$"


# ---------------------------------------------------------------------------
# Athlete profile (FR2) - anonymised
# ---------------------------------------------------------------------------
class InjuryRecord(BaseModel):
    site: Literal["lumbar", "hamstring", "shoulder", "knee", "ankle", "side_strain", "other"]
    injury_date: date
    returned_to_play: bool = True
    notes: Optional[str] = Field(default=None, max_length=300)


class AthleteBase(BaseModel):
    bowler_id: str = Field(pattern=BOWLER_ID, description="Anonymised code, e.g. B03")
    birth_year: int
    dominant_arm: Literal["right", "left"]
    playing_level: Literal["school", "club", "provincial", "national"]
    injury_history: list[InjuryRecord] = Field(default_factory=list)

    @field_validator("birth_year")
    @classmethod
    def plausible_age(cls, v: int) -> int:
        age = date.today().year - v
        if not 8 <= age <= 50:
            raise ValueError("birth_year gives an age outside 8-50 years")
        return v


class AthleteCreate(AthleteBase):
    pass


class Athlete(AthleteBase):
    id: int


# ---------------------------------------------------------------------------
# Workload log (FR2 - historical workload)
# ---------------------------------------------------------------------------
class WorkloadCreate(BaseModel):
    session_date: date
    session_type: Literal["training", "match", "nets"]
    overs: float = Field(ge=0, le=60, description="Overs bowled in the session")
    spells: int = Field(default=1, ge=0, le=10)
    longest_spell_overs: Optional[float] = Field(default=None, ge=0, le=30)
    rpe: Optional[int] = Field(default=None, ge=1, le=10, description="Session effort 1-10")
    soreness: Optional[int] = Field(default=None, ge=0, le=10, description="Self-reported soreness 0-10")

    @field_validator("session_date")
    @classmethod
    def not_in_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("session_date cannot be in the future")
        return v


class Workload(WorkloadCreate):
    id: int
    athlete_id: int


# ---------------------------------------------------------------------------
# C3 -> C4   (contracts/c3_risk.schema.json)
# ---------------------------------------------------------------------------
class C3Factor(BaseModel):
    feature: str = Field(min_length=1, max_length=80)
    modality: Optional[Literal["kinematics", "workload", "metadata"]] = None
    value: Union[float, str, None] = None
    shap: float = Field(ge=-1, le=1)


class C3Risk(BaseModel):
    bowler_id: str = Field(pattern=BOWLER_ID)
    session_id: str = Field(min_length=1, max_length=80)
    model: str = "unknown"
    risk_score: float = Field(ge=0, le=1)
    risk_level: Literal["low", "medium", "high"]
    top_factors: list[C3Factor] = Field(default_factory=list, max_length=50)
    explanation: Optional[str] = Field(default=None, max_length=2000)


# ---------------------------------------------------------------------------
# C2 -> C4   (contracts/c2_features.schema.json)
# ---------------------------------------------------------------------------
class C2Feature(BaseModel):
    value: Optional[float] = None
    threshold: Optional[float] = None
    breach: bool = False
    reliable: bool = True
    source: Optional[str] = None


class C2Row(BaseModel):
    video_id: str = Field(min_length=1, max_length=80)
    bowler_id: str = Field(pattern=BOWLER_ID)
    events: dict = Field(default_factory=dict)
    features: dict[str, C2Feature]

    model_config = {"extra": "allow"}  # C2 may add series, quality info etc.


class UpstreamInput(BaseModel):
    """Latest C3 risk output + C2 feature rows (one per analysed delivery)."""
    c3: Optional[C3Risk] = None
    c2: list[C2Row] = Field(default_factory=list, max_length=50)


# ---------------------------------------------------------------------------
# Output: the prevention plan
# ---------------------------------------------------------------------------
Category = Literal["training", "workload", "recovery", "rehabilitation", "preventive_exercise"]
Tier = Literal["Low", "Moderate", "High", "Critical"]


class Exercise(BaseModel):
    name: str
    dose: str
    targets: str


class Recommendation(BaseModel):
    rule_id: str
    category: Category
    contract_type: str
    title: str
    action: str
    priority: int
    explanation: str
    reason: str
    contributing_factors: list[str]
    evidence: list[str]
    exercises: list[Exercise] = Field(default_factory=list)


class PlanLimits(BaseModel):
    daily_limit_overs: float
    spell_cap_overs: float
    rest_window: str
    max_bowling_days_per_week: int


class Referral(BaseModel):
    required: bool
    reasons: list[str] = Field(default_factory=list)
    to: Optional[str] = None


class PreventionPlan(BaseModel):
    id: Optional[int] = None
    bowler_id: str
    session_id: Optional[str]
    generated_at: datetime
    risk_tier: Tier
    risk_level: Literal["low", "medium", "high"]
    risk_score: Optional[float]
    risk_source: Literal["c3", "fallback_guidelines"]
    summary: str
    limits: PlanLimits
    referral: Referral
    recommendations: list[Recommendation]
    plan: list[dict] = Field(description="Compact list in the c4_sample.json shape (type/action/reason)")
    metrics: dict
    data_quality: list[str]
    engine_version: str
    latency_ms: float


class FeedbackCreate(BaseModel):
    """FR11 - coach / physiotherapist feedback or override."""
    reviewer: str = Field(min_length=2, max_length=60)
    role: Literal["physiotherapist", "coach", "sports_scientist"]
    decision: Literal["accept", "modify", "reject"]
    usefulness: Optional[int] = Field(default=None, ge=1, le=5, description="Coach feedback score 1-5")
    rule_id: Optional[str] = None
    comment: str = Field(default="", max_length=500)
    modified_action: Optional[str] = Field(default=None, max_length=300)


class Feedback(FeedbackCreate):
    id: int
    plan_id: int
    created_at: datetime


class StatelessRequest(BaseModel):
    """Everything inline - used by tests, experiments and teammates."""
    athlete: AthleteCreate
    workloads: list[WorkloadCreate] = Field(default_factory=list, max_length=500)
    upstream: UpstreamInput = Field(default_factory=UpstreamInput)
