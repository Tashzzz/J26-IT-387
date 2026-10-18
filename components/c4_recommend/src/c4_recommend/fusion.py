"""
Input fusion (Specific Objective 1).

Brings together
  * C3 risk score + top SHAP factors
  * C2 biomechanical threshold breaches
  * workload history (logged sessions)
  * athlete profile (age, injury history)
into ONE flat dictionary of "facts" that the rule engine reasons over.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Optional

from .models import AthleteCreate, UpstreamInput, WorkloadCreate

RECENT_INJURY_DAYS = 84  # 12 weeks

# C2 feature name -> short name used by the rules
C2_FLAG_MAP = {
    "shoulder_counter_rotation_deg": "scr",
    "trunk_lateral_flexion_deg": "tlf",
    "front_knee_flexion_release_deg": "knee",
}


def _age_group(age: float, kb: dict) -> str:
    for name, g in kb["limits"]["age_groups"].items():
        if age <= g["max_age"]:
            return name
    return "Senior"


def severity(value: Optional[float], threshold: Optional[float]) -> str:
    """How far past the C2 threshold the value is (degrees)."""
    if value is None or threshold is None:
        return "mild"
    over = abs(value - threshold)
    return "severe" if over > 10 else "moderate" if over > 5 else "mild"


def workload_metrics(workloads: list[WorkloadCreate], today: date) -> dict:
    """Acute/chronic load, ACWR and rest pattern from logged sessions."""
    per_day: dict[date, float] = defaultdict(float)
    soreness_7: list[int] = []
    for w in workloads:
        per_day[w.session_date] += w.overs
        if (today - w.session_date).days < 7 and w.soreness is not None:
            soreness_7.append(w.soreness)

    def overs_in_last(days: int) -> float:
        return sum(o for d, o in per_day.items() if 0 <= (today - d).days < days)

    acute = overs_in_last(7)
    chronic_weekly = overs_in_last(28) / 4.0
    history_days = (today - min(per_day)).days + 1 if per_day else 0
    has_history = history_days >= 21

    acwr: Optional[float] = None
    if has_history and chronic_weekly > 0:
        acwr = round(acute / chronic_weekly, 2)

    bowling_days_7 = sorted(d for d, o in per_day.items() if o > 0 and (today - d).days < 7)
    bowling_days_28 = sorted(d for d, o in per_day.items() if o > 0 and (today - d).days < 28)

    consecutive, run, prev = 0, 0, None
    for d in bowling_days_7:
        run = run + 1 if prev and (d - prev).days == 1 else 1
        consecutive = max(consecutive, run)
        prev = d

    avg_rest: Optional[float] = None
    if len(bowling_days_28) >= 2:
        gaps = [(b - a).days - 1 for a, b in zip(bowling_days_28, bowling_days_28[1:])]
        avg_rest = round(sum(gaps) / len(gaps), 1)

    return {
        "acute_overs": round(acute, 1),
        "chronic_weekly_overs": round(chronic_weekly, 1),
        "acwr": acwr,
        "has_history": has_history,
        "history_days": history_days,
        "days_bowled_7": len(bowling_days_7),
        "consecutive_days": consecutive,
        "avg_rest_days": avg_rest,
        "max_daily_overs_7": round(max((o for d, o in per_day.items() if (today - d).days < 7), default=0.0), 1),
        "soreness_max_7": max(soreness_7) if soreness_7 else 0,
        "sessions_logged": len(workloads),
    }


def _flags_from_c3(facts: dict, upstream: UpstreamInput, kb: dict, notes: list[str]) -> None:
    """No C2 row: derive breaches from C3's kinematic factor values with C2's published limits."""
    if not upstream.c3:
        return
    limits = kb.get("c2_threshold_fallback", {})
    for f in upstream.c3.top_factors:
        short = C2_FLAG_MAP.get(f.feature)
        lim = limits.get(f.feature)
        if not short or not lim or not isinstance(f.value, (int, float)):
            continue
        breach = f.value > lim["threshold"] if lim["rule"] == "above" else f.value < lim["threshold"]
        if breach:
            facts[f"flag_{short}"] = True
            facts[f"{short}_value"], facts[f"{short}_threshold"], facts[f"{short}_reliable"] = f.value, lim["threshold"], True
            facts["any_flag"] = True
            sev = severity(f.value, lim["threshold"])
            facts[f"{short}_severity"] = sev
            facts["severe_flag_count"] += sev == "severe"
            facts["moderate_flag_count"] += sev == "moderate"
            notes.append(f"{f.feature} breach taken from C3 factor value (no C2 row).")


def fuse(athlete: AthleteCreate, workloads: list[WorkloadCreate], upstream: UpstreamInput,
         kb: dict, today: Optional[date] = None) -> tuple[dict, list[str]]:
    """Return (facts, data_quality_notes)."""
    today = today or date.today()
    notes: list[str] = []

    age = today.year - athlete.birth_year
    age_group = _age_group(age, kb)
    facts: dict = {
        "bowler_id": athlete.bowler_id,
        "age": age,
        "age_group": age_group,
        "is_junior": age_group != "Senior",
        "playing_level": athlete.playing_level,
    }

    # --- injury history ------------------------------------------------------
    recent = [i for i in athlete.injury_history if 0 <= (today - i.injury_date).days <= RECENT_INJURY_DAYS]
    facts["recent_injury"] = bool(recent)
    facts["recent_injury_sites"] = sorted({i.site for i in recent})
    facts["hamstring_history"] = any(i.site == "hamstring" for i in athlete.injury_history)
    lumbar = [i for i in recent if i.site == "lumbar"]
    facts["lumbar_weeks_ago"] = (today - max(i.injury_date for i in lumbar)).days // 7 if lumbar else None

    # --- workload ------------------------------------------------------------
    wm = workload_metrics(workloads, today)
    facts.update(wm)
    if wm["sessions_logged"] == 0:
        notes.append("No workload sessions logged - workload rules skipped.")
    elif not wm["has_history"]:
        notes.append(f"Only {wm['history_days']} days of workload history (21+ needed) - ACWR not calculated.")

    # --- C2: biomechanical breaches (worst value across deliveries) ----------
    facts["severe_flag_count"] = 0
    facts["moderate_flag_count"] = 0
    facts["any_flag"] = False
    for feat, short in C2_FLAG_MAP.items():
        breaches = [r.features[feat] for r in upstream.c2 if feat in r.features and r.features[feat].breach]
        worst = max(breaches, key=lambda f: abs((f.value or 0) - (f.threshold or 0)), default=None)
        facts[f"flag_{short}"] = worst is not None
        facts[f"{short}_value"] = worst.value if worst else None
        facts[f"{short}_threshold"] = worst.threshold if worst else None
        facts[f"{short}_reliable"] = worst.reliable if worst else None
        if worst:
            facts["any_flag"] = True
            sev = severity(worst.value, worst.threshold)
            facts[f"{short}_severity"] = sev
            if worst.reliable:  # unreliable measurements never escalate risk on their own
                facts["severe_flag_count"] += sev == "severe"
                facts["moderate_flag_count"] += sev == "moderate"
            else:
                notes.append(f"{feat} breach is marked unreliable by C1/C2 - confirm with coach video review.")
    if not upstream.c2:
        notes.append("No C2 feature rows received (delivery not analysed yet).")
        _flags_from_c3(facts, upstream, kb, notes)

    # --- C3: risk score + top factors -----------------------------------------
    c3 = upstream.c3
    facts["risk_available"] = c3 is not None
    facts["risk_score"] = c3.risk_score if c3 else None
    facts["c3_risk_level"] = c3.risk_level if c3 else None
    facts["session_id"] = c3.session_id if c3 else None
    if c3:
        positive = sorted((f for f in c3.top_factors if f.shap > 0), key=lambda f: -f.shap)
        facts["shap_top"] = [{"feature": f.feature, "shap": f.shap, "value": f.value, "modality": f.modality}
                             for f in positive[:5]]
        if c3.bowler_id != athlete.bowler_id:
            notes.append(f"C3 output is for {c3.bowler_id}, profile is {athlete.bowler_id} - check the link.")
    else:
        facts["shap_top"] = []
        notes.append("C3 risk score unavailable - using guideline-based fallback tier.")

    return facts, notes
