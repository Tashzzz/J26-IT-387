"""
Explainability layer (Specific Objective 4).

Turns facts + SHAP attributions into plain-language sentences a coach or a
16-year-old bowler can read - not a raw SHAP bar chart.
"""
from __future__ import annotations

FEATURE_LABELS = {
    "acute_chronic_workload_ratio": "workload spike (acute:chronic ratio)",
    "acute_overs": "overs bowled this week",
    "weekly_overs": "weekly overs",
    "workload_spike": "sudden workload increase",
    "daily_overs": "overs per day",
    "days_bowled_7": "bowling days per week",
    "avg_rest_days": "rest between sessions",
    "consecutive_days": "consecutive bowling days",
    "shoulder_counter_rotation_deg": "shoulder counter-rotation",
    "trunk_lateral_flexion_deg": "trunk side-bend",
    "front_knee_flexion_ffc_deg": "front-knee bend at landing",
    "front_knee_flexion_release_deg": "front-knee angle at release",
    "hip_shoulder_separation_bfc_deg": "hip-shoulder separation",
    "injury_history": "previous injury",
    "age": "age",
    "soreness": "reported soreness",
}


def label(feature: str) -> str:
    return FEATURE_LABELS.get(feature, feature.replace("_", " "))


def fmt(v):
    if isinstance(v, float):
        return f"{v:.1f}".rstrip("0").rstrip(".") if v != int(v) else str(int(v))
    return "n/a" if v is None else str(v)


class SafeDict(dict):
    """format_map helper: unknown placeholders render as 'n/a' instead of crashing."""
    def __missing__(self, key):
        return "n/a"


def render(template: str, facts: dict) -> str:
    return template.format_map(SafeDict({k: fmt(v) for k, v in facts.items()}))


def shap_sentence(facts: dict, related: list[str]) -> str | None:
    """If Component 3's SHAP top factors overlap this rule, say so."""
    hits = [s for s in facts.get("shap_top", []) if s["feature"] in related]
    if not hits:
        return None
    parts = [f"{label(s['feature'])} (+{s['shap']:.2f})" for s in hits[:2]]
    return "The risk model also ranked " + " and ".join(parts) + " among the top reasons for your risk score."


def plan_summary(facts: dict, tier: str, top_recs: list, referral_required: bool) -> str:
    if facts["risk_available"]:
        lead = f"{tier} risk ({facts['risk_score'] * 100:.0f}% predicted)."
    else:
        lead = f"{tier} risk (estimated from workload and technique - model score not available)."

    drivers = []
    if facts.get("shap_top"):
        drivers = [label(s["feature"]) for s in facts["shap_top"][:3]]
    else:
        if facts.get("acwr") and facts["acwr"] > 1.5:
            drivers.append(label("acute_chronic_workload_ratio"))
        for short, feat in (("scr", "shoulder_counter_rotation_deg"), ("tlf", "trunk_lateral_flexion_deg"),
                            ("knee", "front_knee_flexion_release_deg")):
            if facts.get(f"flag_{short}"):
                drivers.append(label(feat))
        if facts.get("recent_injury"):
            drivers.append("recent injury")
    text = lead
    if drivers:
        text += " Main drivers: " + ", ".join(drivers[:3]) + "."
    if top_recs:
        text += " Priority action: " + top_recs[0].title + "."
    if referral_required:
        text += " Physiotherapist review required."
    return text
