"""Request bodies for the /risk API (pydantic validation -> clear 422 errors).

Shapes mirror the team contracts and C4's models so the same JSON works everywhere:
  * C2 rows       contracts/c2_features.schema.json
  * athlete       C4 AthleteCreate (bowler code, birth year, level, injury history)
  * workloads     C4 WorkloadCreate (date, nets/training/match, overs, rpe, soreness)
Extra fields (e.g. C2 `series`, C4 `dominant_arm`) are accepted and ignored.
"""
from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

BOWLER_ID = r"^[A-Za-z0-9_-]{2,24}$"


class C2Feature(BaseModel):
    model_config = ConfigDict(extra="ignore")
    value: Optional[float] = Field(default=None, ge=-180, le=360)
    threshold: Optional[float] = None
    breach: Optional[bool] = None
    reliable: bool = True
    source: Optional[str] = None


class C2Row(BaseModel):
    model_config = ConfigDict(extra="ignore")
    video_id: str = Field(min_length=1, max_length=80)
    bowler_id: str = Field(pattern=BOWLER_ID)
    events: dict = Field(default_factory=dict)
    features: dict[str, C2Feature]


class InjuryIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    site: Literal["lumbar", "hamstring", "shoulder", "knee", "ankle", "side_strain", "other"]
    injury_date: date
    returned_to_play: bool = True


class AthleteIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    bowler_id: str = Field(pattern=BOWLER_ID, description="Anonymised code, e.g. B03 - never a name")
    birth_year: int
    playing_level: Literal["school", "club", "provincial", "national"] = "club"
    injury_history: list[InjuryIn] = Field(default_factory=list)

    @field_validator("birth_year")
    @classmethod
    def plausible_age(cls, v: int) -> int:
        if not 8 <= date.today().year - v <= 50:
            raise ValueError("birth_year gives an age outside 8-50 years")
        return v


class WorkloadIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    session_date: date
    session_type: Literal["training", "match", "nets"]
    overs: float = Field(ge=0, le=60)
    rpe: Optional[int] = Field(default=None, ge=1, le=10)
    soreness: Optional[int] = Field(default=None, ge=0, le=10)


class PredictRequest(BaseModel):
    """Everything inline - no database (tests, experiments, teammates)."""
    athlete: AthleteIn
    workloads: list[WorkloadIn] = Field(default_factory=list, max_length=1000)
    c2: list[C2Row] = Field(default_factory=list, max_length=60, description="One C2 row per analysed delivery")
    as_of: Optional[date] = Field(default=None, description="Assessment date (default today)")
    session_id: Optional[str] = Field(default=None, max_length=80)
    drop_unreliable: bool = Field(default=False, description="Leave out C2 values marked reliable=false")

    @field_validator("as_of")
    @classmethod
    def not_future(cls, v: Optional[date]) -> Optional[date]:
        if v and v > date.today():
            raise ValueError("as_of cannot be in the future")
        return v


class AssessRequest(BaseModel):
    """Assess a bowler from the shared athlete registry (profile + workload log + latest C2 rows)."""
    c2: Optional[list[C2Row]] = Field(default=None, max_length=60,
                                      description="Use these C2 rows instead of the ones stored with C4")
    as_of: Optional[date] = None
    session_id: Optional[str] = Field(default=None, max_length=80)
    drop_unreliable: bool = False
    send_to_c4: bool = Field(default=True, description="Hand the result to C4 so the prevention plan uses it")
