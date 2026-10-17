from datetime import date, timedelta

from c4_recommend.models import AthleteCreate, UpstreamInput, WorkloadCreate

TODAY = date.today()

FEATURE = {"scr": "shoulder_counter_rotation_deg", "tlf": "trunk_lateral_flexion_deg",
           "knee": "front_knee_flexion_release_deg"}


def athlete(age=17, injuries=None, code="T01") -> AthleteCreate:
    return AthleteCreate(bowler_id=code, birth_year=TODAY.year - age, dominant_arm="right",
                         playing_level="club", injury_history=injuries or [])


def steady_weeks(overs=5, sessions=(27, 24, 20, 17, 13, 10), recent=(6, 3), recent_overs=None, soreness=1):
    """4 weeks of history; `recent` sessions fall in the last 7 days."""
    w = [WorkloadCreate(session_date=TODAY - timedelta(days=d), session_type="nets", overs=overs, soreness=soreness)
         for d in sessions]
    w += [WorkloadCreate(session_date=TODAY - timedelta(days=d), session_type="nets",
                         overs=overs if recent_overs is None else recent_overs, soreness=soreness) for d in recent]
    return w


def upstream(score=None, flags=(), shap=(), code="T01", reliable=True):
    """flags: iterable of (short_name, degrees_over_threshold)."""
    features = {}
    for short, over in flags:
        thr = 30.0 if short != "tlf" else 40.0
        value = thr - over if short == "knee" else thr + over
        features[FEATURE[short]] = {"value": value, "threshold": thr, "breach": True, "reliable": reliable}
    data = {"c2": [{"video_id": f"{code}_D01_side_10m", "bowler_id": code, "features": features}] if features else []}
    if score is not None:
        level = "high" if score >= 0.55 else "medium" if score >= 0.3 else "low"
        data["c3"] = {"bowler_id": code, "session_id": f"{code}_s1", "risk_score": score, "risk_level": level,
                      "top_factors": [{"feature": f, "shap": s} for f, s in shap]}
    return UpstreamInput(**data)
