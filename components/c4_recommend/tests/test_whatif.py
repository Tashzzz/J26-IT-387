"""What-if (counterfactual) module - tested with a transparent fake risk model, so the logic is
checked without needing C3's trained model. A separate test runs against C3 when it is available."""
import copy
from datetime import date, timedelta

import pytest

from c4_recommend.engine import load_kb
from c4_recommend.whatif import MIN_EFFECT, candidate_actions, simulate, tier_of

TODAY = date.today()
KB = load_kb()


def wl(days_overs):
    return [{"session_date": (TODAY - timedelta(days=d)).isoformat(), "session_type": "nets", "overs": o}
            for d, o in days_overs]


STEADY = [(27, 5), (24, 5), (20, 5), (17, 5), (13, 5), (10, 5)]
SPIKE = STEADY + [(3, 12), (2, 12), (1, 12)]           # 36 overs in 3 days in a row, ACWR > 2


def c2(scr=None, tlf=None, knee=None):
    feats = {}
    if scr is not None:
        feats["shoulder_counter_rotation_deg"] = {"value": scr, "threshold": 30.0, "breach": scr > 30, "reliable": True}
    if tlf is not None:
        feats["trunk_lateral_flexion_deg"] = {"value": tlf, "threshold": 40.0, "breach": tlf > 40, "reliable": True}
    if knee is not None:
        feats["front_knee_flexion_release_deg"] = {"value": knee, "threshold": 30.0, "breach": knee < 30, "reliable": True}
    return [{"video_id": "T01_D01", "bowler_id": "T01", "features": feats}]


ATHLETE = {"bowler_id": "T01", "birth_year": TODAY.year - 17, "dominant_arm": "right",
           "playing_level": "club", "injury_history": [{"site": "lumbar", "injury_date": "2026-01-01"}]}


def fake_scorer(athlete, workloads, c2_rows):
    """Transparent 'model': risk rises with this week's overs, angle breaches and injury history."""
    acute = sum(w["overs"] for w in workloads if (TODAY - date.fromisoformat(w["session_date"])).days < 7)
    risk = 0.10 + 0.008 * acute
    for r in c2_rows:
        f = r["features"]
        if "trunk_lateral_flexion_deg" in f:
            risk += max(0, f["trunk_lateral_flexion_deg"]["value"] - 40) * 0.02
        if "shoulder_counter_rotation_deg" in f:
            risk += max(0, f["shoulder_counter_rotation_deg"]["value"] - 30) * 0.004
    risk += 0.05 * len(athlete.get("injury_history", []))
    return min(risk, 0.99)


# ------------------------------------------------------------- candidate actions
def test_no_actions_for_a_bowler_with_nothing_to_change():
    assert candidate_actions(wl(STEADY + [(3, 5)]), c2(scr=25, tlf=35), None, TODAY) == []


def test_actions_only_for_real_problems():
    ids = {a.id for a in candidate_actions(wl(SPIKE), c2(scr=38, tlf=35), None, TODAY)}
    assert {"load_safe_band", "rest_day", "tech_shoulder_counter_rotation_deg"} <= ids
    assert "tech_trunk_lateral_flexion_deg" not in ids          # 35 deg is inside the limit


def test_targets_are_realistic_not_ideal():
    acts = {a.id: a for a in candidate_actions(wl(STEADY), c2(tlf=52, knee=22), None, TODAY)}
    _, _, rows = acts["tech_trunk_lateral_flexion_deg"].apply(ATHLETE, wl(STEADY), c2(tlf=52, knee=22))
    assert rows[0]["features"]["trunk_lateral_flexion_deg"]["value"] == 35.0     # just inside 40, not 0
    _, _, rows = acts["tech_front_knee_flexion_release_deg"].apply(ATHLETE, wl(STEADY), c2(tlf=52, knee=22))
    assert rows[0]["features"]["front_knee_flexion_release_deg"]["value"] == 32.0  # "below" rule -> above 30


def test_safe_band_brings_acwr_to_target():
    act = next(a for a in candidate_actions(wl(SPIKE), [], None, TODAY) if a.id == "load_safe_band")
    _, w, _ = act.apply(ATHLETE, wl(SPIKE), [])
    acute = sum(s["overs"] for s in w if (TODAY - date.fromisoformat(s["session_date"])).days < 7)
    chronic = sum(s["overs"] for s in w) / 4
    assert acute / chronic == pytest.approx(1.1, abs=0.15)


def test_daily_cap_uses_plan_limit():
    plan = {"limits": {"daily_limit_overs": 7}}
    act = next(a for a in candidate_actions(wl(SPIKE), [], plan, TODAY) if a.id == "load_daily_cap")
    _, w, _ = act.apply(ATHLETE, wl(SPIKE), [])
    assert max(s["overs"] for s in w) == 7


# ------------------------------------------------------------- simulation
def test_simulation_ranks_by_effect_and_finds_best_combination():
    r = simulate(ATHLETE, wl(SPIKE), c2(scr=38, tlf=52), fake_scorer, kb=KB, today=TODAY)
    effects = [s["effect"] for s in r["scenarios"]]
    assert effects == sorted(effects, reverse=True)
    assert r["scenarios"][0]["id"] == "tech_trunk_lateral_flexion_deg"        # 12 deg over x 0.02 = 0.24, the biggest single effect
    assert r["best_plan"]["risk"] < min(s["risk"] for s in r["scenarios"])     # combination beats any single action
    assert r["best_plan"]["effect"] == pytest.approx(r["base_risk"] - r["best_plan"]["risk"], abs=1e-3)


def test_inputs_are_never_modified():
    w, rows, a = wl(SPIKE), c2(scr=38, tlf=52), copy.deepcopy(ATHLETE)
    before = copy.deepcopy((a, w, rows))
    simulate(a, w, rows, fake_scorer, kb=KB, today=TODAY)
    assert (a, w, rows) == before


def test_non_actionable_factors_are_never_changed():
    seen = []

    def spy(athlete, workloads, rows):
        seen.append(copy.deepcopy(athlete))
        return fake_scorer(athlete, workloads, rows)
    simulate(ATHLETE, wl(SPIKE), c2(scr=38, tlf=52), spy, kb=KB, today=TODAY)
    assert all(a == ATHLETE for a in seen)          # age, level and injury history untouched in every scenario


def test_small_effects_are_flagged_and_not_chosen():
    def flat(a, w, c):
        return 0.40 - 0.005 * len([1 for r in c for f in r["features"].values() if not f["breach"]])
    r = simulate(ATHLETE, wl(STEADY), c2(scr=33), flat, kb=KB, today=TODAY)
    assert r["scenarios"] and not any(s["meaningful"] for s in r["scenarios"])
    assert r["best_plan"]["steps"] == [] and r["best_plan"]["effect"] == 0


def test_rule_effect_links_actions_to_plan_rules():
    r = simulate(ATHLETE, wl(SPIKE), c2(tlf=52), fake_scorer, kb=KB, today=TODAY)
    assert r["rule_effect"]["BM-TLF"] > MIN_EFFECT
    assert "WL-SPIKE-200" in r["rule_effect"]


def test_tiers_use_c4_cutoffs():
    assert [tier_of(x, KB["risk_tiers"]) for x in (0.1, 0.3, 0.55, 0.75)] == ["Low", "Moderate", "High", "Critical"]


def test_nothing_to_change_gives_clear_note():
    r = simulate(ATHLETE, wl(STEADY + [(3, 5)]), [], fake_scorer, kb=KB, today=TODAY)
    assert r["scenarios"] == [] and "No changeable risk factor" in r["notes"][0]


def test_synthetic_model_is_disclosed():
    r = simulate(ATHLETE, wl(SPIKE), c2(tlf=52), fake_scorer, kb=KB, today=TODAY, model_name="xgb_synthetic")
    assert any("synthetic" in n for n in r["notes"])


def test_fast_enough_for_the_app():
    r = simulate(ATHLETE, wl(SPIKE), c2(scr=38, tlf=52, knee=22), fake_scorer, kb=KB, today=TODAY)
    assert r["latency_ms"] < 3000 and r["model_calls"] <= 1 + 5 + 15


# ------------------------------------------------------------- with C3's real model (if installed)
def test_with_real_c3_model_fixing_a_breach_never_raises_risk():
    pytest.importorskip("xgboost")
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "c3_risk" / "src"))
    try:
        from c3_risk.model import ModelNotReady, get_model
        from c3_risk.service import run
        get_model()
    except (ImportError, ModelNotReady) as e:  # pragma: no cover
        pytest.skip(f"C3 model not available: {e}")
    scorer = lambda a, w, c: run(a, w, c)["risk_score"]  # noqa: E731
    r = simulate(ATHLETE, wl(SPIKE), c2(scr=41, tlf=52), scorer, kb=KB, today=TODAY)
    tech = [s for s in r["scenarios"] if s["category"] == "technique"]
    assert tech and all(s["effect"] >= -1e-6 for s in tech)     # C3 is monotone: a fix must not add risk
    assert r["best_plan"]["risk"] <= r["base_risk"]
