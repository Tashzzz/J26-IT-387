"""
Rule-based recommendation engine (Specific Objective 3).

Pipeline:  fuse inputs -> classify risk tier -> compute limits ->
           fire knowledge-base rules -> SHAP-guided prioritisation ->
           explanations -> referral check -> PreventionPlan
"""
from __future__ import annotations

import json
import math
import time
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from . import explain
from .fusion import fuse
from .models import (AthleteCreate, Exercise, PlanLimits, PreventionPlan,
                     Recommendation, Referral, UpstreamInput, WorkloadCreate)

# 4-tier FR3 scale -> 3-level scale used in the team contracts (c3/c4)
TIER_TO_LEVEL = {"Low": "low", "Moderate": "medium", "High": "high", "Critical": "high"}
UNRELIABLE_NOTE = (" Note: this angle was marked unreliable from this camera view, "
                   "so confirm it with your coach on video before changing technique.")

KB_PATH = Path(__file__).with_name("knowledge_base.json")
TIER_ORDER = ["Low", "Moderate", "High", "Critical"]
SHAP_BOOST = 10  # priority points added when a rule matches a top SHAP factor


def load_kb(path: Path = KB_PATH) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# Condition evaluator for the JSON rules
# ---------------------------------------------------------------------------
def _resolve(value, facts):
    if isinstance(value, str) and value.startswith("{") and value.endswith("}"):
        return facts.get(value[1:-1])
    return value


def check(cond: dict, facts: dict) -> bool:
    fact = facts.get(cond["fact"])
    op = cond["op"]
    if op == "exists":
        return fact is not None
    value = _resolve(cond.get("value"), facts)
    if fact is None or value is None:
        return False
    try:
        return {
            "eq": lambda: fact == value,
            "gt": lambda: fact > value,
            "gte": lambda: fact >= value,
            "lt": lambda: fact < value,
            "lte": lambda: fact <= value,
            "in": lambda: fact in value,
            "contains": lambda: value in fact,
        }[op]()
    except (TypeError, KeyError):
        return False


def matches(when: dict, facts: dict) -> bool:
    if "all" in when:
        return all(check(c, facts) for c in when["all"])
    if "any" in when:
        return any(check(c, facts) for c in when["any"])
    return False


# ---------------------------------------------------------------------------
# Risk tier (FR3)
# ---------------------------------------------------------------------------
def tier_from_score(score: float, kb: dict) -> str:
    tier = "Low"
    for name in TIER_ORDER:
        if score >= kb["risk_tiers"][name]:
            tier = name
    return tier


def fallback_points(facts: dict) -> float:
    """Guideline-based risk estimate used when Component 3 is unavailable (NFR reliability)."""
    p = 0.0
    acwr = facts.get("acwr")
    if acwr is not None:
        p += 3 if acwr > 2.0 else 2 if acwr > 1.5 else 0
    p += 1 if facts["consecutive_days"] >= 3 else 0
    p += 1 if facts["days_bowled_7"] > 4 else 0
    p += facts["severe_flag_count"] * 1.0 + facts["moderate_flag_count"] * 0.5
    p += 2 if facts["recent_injury"] else 0
    s = facts["soreness_max_7"]
    p += 3 if s >= 7 else 1 if s >= 4 else 0
    return p


def classify_tier(facts: dict, kb: dict) -> tuple[str, list[str]]:
    reasons: list[str] = []
    if facts["risk_available"]:
        tier = tier_from_score(facts["risk_score"], kb)
    else:
        p = fallback_points(facts)
        tier = "Critical" if p >= 5 else "High" if p >= 3 else "Moderate" if p >= 1.5 else "Low"
        reasons.append(f"fallback score {p:g}")

    # Safety escalations: never let the tier be lower than the evidence demands.
    floor = "Low"
    if facts.get("acwr") is not None and facts["acwr"] > 2.0:
        floor = "High"; reasons.append("ACWR > 2.0 escalates to High")
    if facts["soreness_max_7"] >= 7:
        floor = "High"; reasons.append("soreness >= 7 escalates to High")
    if "lumbar" in facts["recent_injury_sites"]:
        floor = "High"; reasons.append("recent lumbar injury escalates to High")
    if TIER_ORDER.index(floor) > TIER_ORDER.index(tier):
        tier = floor
    return tier, reasons


# ---------------------------------------------------------------------------
# Limits (daily limit / spell cap / rest window)
# ---------------------------------------------------------------------------
def compute_limits(facts: dict, tier: str, kb: dict) -> PlanLimits:
    L = kb["limits"]
    base = L["age_groups"][facts["age_group"]]
    m = L["tier_multiplier"][tier]
    daily = math.floor(base["daily_limit"] * m)
    spell = math.floor(base["spell_cap"] * m)
    if tier != "Critical":
        daily, spell = max(daily, 2), max(spell, 1)
    return PlanLimits(
        daily_limit_overs=daily,
        spell_cap_overs=min(spell, daily),
        rest_window=L["rest_window"][tier],
        max_bowling_days_per_week=L["max_bowling_days_per_week"][tier],
    )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
def generate_plan(athlete: AthleteCreate, workloads: list[WorkloadCreate],
                  upstream: UpstreamInput, kb: Optional[dict] = None,
                  today: Optional[date] = None) -> PreventionPlan:
    t0 = time.perf_counter()
    kb = kb or load_kb()
    facts, notes = fuse(athlete, workloads, upstream, kb, today)

    tier, tier_reasons = classify_tier(facts, kb)
    limits = compute_limits(facts, tier, kb)
    base = kb["limits"]["age_groups"][facts["age_group"]]

    # derived facts used inside rule text
    chronic = facts["chronic_weekly_overs"]
    facts.update({
        "tier": tier,
        "daily_limit": limits.daily_limit_overs,
        "spell_cap": limits.spell_cap_overs,
        "rest_window": limits.rest_window,
        "max_days": limits.max_bowling_days_per_week,
        "base_daily_limit": base["daily_limit"],
        "target_weekly_overs": round(chronic * 1.3, 1) if chronic else None,
        "build_up_overs": round(min(chronic, facts["acute_overs"] * 1.3 + 2), 1) if chronic else None,
        "risk_phrase": f" ({facts['risk_score'] * 100:.0f}% predicted)" if facts["risk_available"] else " (model score unavailable)",
        "hamstring_reason": ("You have a previous hamstring injury" if facts["hamstring_history"] else "Your workload is rising quickly"),
    })

    shap_features = {s["feature"] for s in facts["shap_top"]}
    shap_rank = {s["feature"]: s["shap"] for s in facts["shap_top"]}
    crit = kb.get("critical_tier_policy", {}) if tier == "Critical" else {}
    recs: list[Recommendation] = []
    for rule in kb["rules"]:
        if not matches(rule["when"], facts):
            continue
        if crit and rule["id"] not in crit.get("exempt_rules", []) and (
                rule["category"] in crit.get("suppress_categories", []) or rule["id"] in crit.get("suppress_rules", [])):
            continue
        prefix = "" if not crit or rule["id"] in crit.get("exempt_rules", []) else crit.get("action_prefix", {}).get(rule["category"], "")
        priority = rule["priority"]
        related = rule.get("related_features", [])
        if shap_features.intersection(related):
            priority += SHAP_BOOST
        text = explain.render(rule["explanation"], facts)
        shap_txt = explain.shap_sentence(facts, related)
        if shap_txt:
            text += " " + shap_txt
        short = {"BM-SCR": "scr", "BM-TLF": "tlf", "BM-KNEE": "knee"}.get(rule["id"])
        if short and facts.get(f"{short}_reliable") is False:
            text += UNRELIABLE_NOTE
        # contract "reason": the strongest C3 factor behind this rule, else the rule's first fact
        hits = sorted(shap_features.intersection(related), key=lambda f: -shap_rank[f])
        reason = hits[0] if hits else (related[0] if related else f"risk_tier={tier}")
        exercises = [Exercise(**kb["exercises"][e]) for e in rule.get("exercises", [])]
        recs.append(Recommendation(
            rule_id=rule["id"],
            category=rule["category"],
            contract_type=rule["contract_type"],
            title=rule["title"],
            action=prefix + explain.render(rule["action"], facts),
            priority=priority,
            explanation=text,
            reason=reason,
            contributing_factors=[f"{f} = {explain.fmt(facts.get(f))}" for f in rule["factors"]],
            evidence=[kb["sources"][s]["citation"] for s in rule["evidence"]],
            exercises=exercises,
        ))
    recs.sort(key=lambda r: -r.priority)

    reasons = [r["reason"] for r in kb["referral_rules"] if matches(r["when"], facts)]
    referral = Referral(required=bool(reasons), reasons=reasons,
                        to="Team physiotherapist / sports physician" if reasons else None)

    metrics = {k: facts[k] for k in (
        "age", "age_group", "acute_overs", "chronic_weekly_overs", "acwr", "days_bowled_7",
        "consecutive_days", "avg_rest_days", "max_daily_overs_7", "soreness_max_7",
        "recent_injury_sites", "shap_top", "c3_risk_level")}
    metrics["flags"] = {k: {"value": facts[f"{k}_value"], "threshold": facts[f"{k}_threshold"],
                            "reliable": facts[f"{k}_reliable"]}
                        for k in ("scr", "tlf", "knee") if facts[f"flag_{k}"]}

    # compact list in the shape of contracts/samples/c4_sample.json
    compact = [{"type": r.contract_type, "action": r.action, "reason": r.reason} for r in recs]
    if referral.required:
        compact.insert(0, {"type": "referral", "action": f"Refer to {referral.to}",
                           "reason": "; ".join(referral.reasons)})
    metrics["tier_reasons"] = tier_reasons

    return PreventionPlan(
        bowler_id=athlete.bowler_id,
        session_id=facts["session_id"],
        risk_level=TIER_TO_LEVEL[tier],
        generated_at=datetime.now(),
        risk_tier=tier,
        risk_score=facts["risk_score"],
        risk_source="c3" if facts["risk_available"] else "fallback_guidelines",
        summary=explain.plan_summary(facts, tier, recs, referral.required),
        limits=limits,
        referral=referral,
        recommendations=recs,
        plan=compact,
        metrics=metrics,
        data_quality=notes,
        engine_version=kb["version"],
        latency_ms=round((time.perf_counter() - t0) * 1000, 2),
    )
