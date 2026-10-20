"""Unit and rule-coverage tests for the C4 engine (proposal 4.3.3)."""
import itertools
from datetime import timedelta

import pytest

from c4_recommend.engine import generate_plan, load_kb, tier_from_score
from c4_recommend.fusion import workload_metrics
from c4_recommend.models import InjuryRecord, UpstreamInput, WorkloadCreate
from helpers import TODAY, athlete, steady_weeks, upstream

KB = load_kb()


def ids(plan):
    return {r.rule_id for r in plan.recommendations}


def cats(plan):
    return {r.category for r in plan.recommendations}


# ------------------------------------------------------------- fusion
def test_acwr_calculation():
    # 6 x 5 overs on days 10-27, 2 x 5 in the last 7 days -> acute 10, chronic 40/4 = 10
    m = workload_metrics(steady_weeks(), TODAY)
    assert (m["acute_overs"], m["chronic_weekly_overs"], m["acwr"]) == (10, 10, 1.0)


def test_acwr_needs_21_days_history():
    w = [WorkloadCreate(session_date=TODAY - timedelta(days=d), session_type="nets", overs=6) for d in (1, 3, 5)]
    assert workload_metrics(w, TODAY)["acwr"] is None


def test_consecutive_days():
    w = [WorkloadCreate(session_date=TODAY - timedelta(days=d), session_type="nets", overs=4) for d in (1, 2, 3, 5)]
    assert workload_metrics(w, TODAY)["consecutive_days"] == 3


# ------------------------------------------------------------- tiers (FR3)
@pytest.mark.parametrize("score,tier", [
    (0.0, "Low"), (0.29, "Low"), (0.30, "Moderate"), (0.549, "Moderate"),
    (0.55, "High"), (0.749, "High"), (0.75, "Critical"), (1.0, "Critical")])
def test_tier_boundaries(score, tier):
    assert tier_from_score(score, KB) == tier


def test_acwr_over_2_escalates_low_score_to_high():
    plan = generate_plan(athlete(), steady_weeks(recent_overs=20), upstream(score=0.1))
    assert plan.metrics["acwr"] > 2.0 and plan.risk_tier == "High"
    assert "WL-SPIKE-200" in ids(plan)


def test_tier_maps_to_contract_level():
    assert generate_plan(athlete(), steady_weeks(), upstream(score=0.4)).risk_level == "medium"
    assert generate_plan(athlete(), steady_weeks(), upstream(score=0.9)).risk_level == "high"


# ------------------------------------------------------------- referral (FR7)
def test_referral_boundary():
    assert not generate_plan(athlete(), steady_weeks(), upstream(score=0.749)).referral.required
    assert generate_plan(athlete(), steady_weeks(), upstream(score=0.75)).referral.required


def test_referral_on_high_soreness_even_with_low_score():
    plan = generate_plan(athlete(), steady_weeks(soreness=8), upstream(score=0.1))
    assert plan.referral.required
    assert plan.plan[0]["type"] == "referral"


# ------------------------------------------------------------- recommendations (FR4-FR6)
def test_c2_breach_triggers_technique_and_exercise():
    plan = generate_plan(athlete(), steady_weeks(), upstream(score=0.4, flags=[("scr", 8)]))
    assert {"BM-SCR", "PX-LUMBAR"} <= ids(plan)
    assert len(next(r for r in plan.recommendations if r.rule_id == "PX-LUMBAR").exercises) >= 3


def test_unreliable_breach_is_caveated_and_does_not_escalate():
    rel = generate_plan(athlete(), steady_weeks(), upstream(score=None, flags=[("scr", 15), ("tlf", 15)]))
    unrel = generate_plan(athlete(), steady_weeks(), upstream(score=None, flags=[("scr", 15), ("tlf", 15)], reliable=False))
    assert rel.referral.required and not unrel.referral.required  # two severe flags only count when reliable
    assert "unreliable" in next(r for r in unrel.recommendations if r.rule_id == "BM-SCR").explanation


def test_flags_from_c3_when_no_c2_row():
    up = UpstreamInput(c3={"bowler_id": "T01", "session_id": "s", "risk_score": 0.6, "risk_level": "high",
                           "top_factors": [{"feature": "shoulder_counter_rotation_deg", "value": 36.0, "shap": 0.2}]})
    plan = generate_plan(athlete(), steady_weeks(), up)
    assert "BM-SCR" in ids(plan)
    assert any("no C2 row" in n for n in plan.data_quality)


def test_recent_lumbar_injury_gives_rehab_and_safety_floor():
    inj = [InjuryRecord(site="lumbar", injury_date=TODAY - timedelta(days=30))]
    plan = generate_plan(athlete(injuries=inj), steady_weeks(), upstream(score=0.2))
    assert "RH-LUMBAR" in ids(plan) and plan.risk_tier in ("High", "Critical")


def test_junior_limits_follow_ecb():
    plan = generate_plan(athlete(age=14), steady_weeks(), upstream(score=0.1))
    assert (plan.limits.daily_limit_overs, plan.limits.spell_cap_overs) == (12, 6)


def test_critical_suppresses_volume_advice():
    plan = generate_plan(athlete(), steady_weeks(recent_overs=20), upstream(score=0.9))
    assert plan.risk_tier == "Critical" and "workload" not in cats(plan)
    assert plan.limits.daily_limit_overs == 0


def test_every_recommendation_is_explained_and_sourced():
    plan = generate_plan(athlete(), steady_weeks(recent_overs=12), upstream(score=0.6, flags=[("tlf", 12)]))
    for r in plan.recommendations:
        assert len(r.explanation) > 30 and r.evidence and r.reason, r.rule_id
        assert "n/a" not in r.action  # no unfilled placeholders


def test_shap_factor_boosts_priority_and_is_mentioned():
    plain = generate_plan(athlete(), steady_weeks(), upstream(score=0.4, flags=[("knee", 6)]))
    boosted = generate_plan(athlete(), steady_weeks(), upstream(score=0.4, flags=[("knee", 6)],
                                                               shap=[("front_knee_flexion_release_deg", 0.2)]))
    p1 = next(r for r in plain.recommendations if r.rule_id == "BM-KNEE")
    p2 = next(r for r in boosted.recommendations if r.rule_id == "BM-KNEE")
    assert p2.priority > p1.priority and "risk model also ranked" in p2.explanation
    assert p2.reason == "front_knee_flexion_release_deg"


# ------------------------------------------------------------- fallback (NFR reliability)
def test_fallback_when_c3_missing():
    plan = generate_plan(athlete(), steady_weeks(), upstream(score=None))
    assert plan.risk_source == "fallback_guidelines" and plan.risk_score is None
    assert plan.recommendations and any("C3" in n for n in plan.data_quality)


def test_no_workload_still_gives_plan():
    plan = generate_plan(athlete(), [], upstream(score=0.4))
    assert plan.recommendations and any("No workload" in n for n in plan.data_quality)


def test_mismatched_bowler_is_reported():
    plan = generate_plan(athlete(code="T01"), [], upstream(score=0.4, code="T99"))
    assert any("T99" in n for n in plan.data_quality)


# ------------------------------------------------------------- performance (NFR < 3 s)
def test_latency_under_3_seconds():
    assert generate_plan(athlete(), steady_weeks(), upstream(score=0.6, flags=[("scr", 12)])).latency_ms < 3000


# ------------------------------------------------------------- rule coverage
SCORES = [None, 0.1, 0.4, 0.6, 0.9]
FLAG_SETS = [(), (("scr", 8),), (("knee", 3),), (("tlf", 12), ("scr", 14))]
WORKLOADS = ["none", "steady", "spike", "underload"]
AGES = [12, 14, 17, 25]


def _wl(kind):
    return {"none": [], "steady": steady_weeks(), "spike": steady_weeks(recent_overs=20),
            "underload": steady_weeks(recent=(5,), recent_overs=2)}[kind]


@pytest.mark.parametrize("score,flags,wl,age", list(itertools.product(SCORES, FLAG_SETS, WORKLOADS, AGES)))
def test_rule_coverage(score, flags, wl, age):
    """Every risk x flag x workload x age combination maps to a valid plan (320 cases)."""
    plan = generate_plan(athlete(age=age), _wl(wl), upstream(score=score, flags=flags))
    assert plan.recommendations
    assert "training" in cats(plan), "every plan needs a training instruction"
    if flags:
        assert "preventive_exercise" in cats(plan)
    if plan.risk_tier == "Critical":
        assert plan.referral.required
    assert plan.limits.spell_cap_overs <= plan.limits.daily_limit_overs
    assert all(p["type"] in {"training", "technique", "workload", "recovery", "rehabilitation", "exercise", "referral"}
               for p in plan.plan)
