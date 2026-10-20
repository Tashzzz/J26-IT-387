"""Model, risk scale, two-level SHAP and narrative."""
import json
import math

import jsonschema
import numpy as np
import pytest

from c3_risk.explain import assess, contract_view
from c3_risk.features import build_features
from c3_risk.model import get_model, level_of, risk_index, tier_of
from c3_risk.spec import MONOTONE, SCORE_CUTS
from helpers import REPO, TODAY, athlete, c2_row, steady_log

SCHEMA = json.loads((REPO / "contracts" / "c3_risk.schema.json").read_text(encoding="utf-8"))


def run(c2=None, log=None, ath=None):
    m = get_model()
    feats, notes, summary = build_features(c2 if c2 is not None else [c2_row(scr=33, tlf=41)],
                                           log if log is not None else steady_log(), ath or athlete(), TODAY)
    return assess(m, feats, notes, summary, (ath or athlete())["bowler_id"])


# ---------------------------------------------------------------- risk scale
def test_score_cuts_match_c4_knowledge_base():
    kb = json.loads((REPO / "components" / "c4_recommend" / "src" / "c4_recommend" / "knowledge_base.json").read_text(encoding="utf-8"))
    tiers = kb["risk_tiers"]
    assert (tiers["Moderate"], tiers["High"], tiers["Critical"]) == tuple(SCORE_CUTS.values())


def test_risk_index_anchors_and_monotone():
    thr = {"alert": 0.06, "high": 0.16, "critical": 0.32}
    assert risk_index(0.06, thr) == pytest.approx(0.30) and risk_index(0.16, thr) == pytest.approx(0.55)
    assert risk_index(0.32, thr) == pytest.approx(0.75) and risk_index(1.0, thr) == 1.0
    ps = np.linspace(0, 1, 201)
    assert np.all(np.diff([risk_index(p, thr) for p in ps]) >= 0)


@pytest.mark.parametrize("score,level,tier", [(0.29, "low", "Low"), (0.30, "medium", "Moderate"),
                                              (0.55, "high", "High"), (0.75, "high", "Critical")])
def test_levels_and_tiers(score, level, tier):
    assert level_of(score) == level and tier_of(score) == tier


# ---------------------------------------------------------------- SHAP
def test_shap_adds_up_to_the_prediction():
    m = get_model()
    feats, _, _ = build_features([c2_row(scr=38, tlf=44)], steady_log(), athlete(), TODAY)
    e = m.explain_row(feats)
    assert e["base_logodds"] + sum(e["phi"].values()) == pytest.approx(e["logodds"], abs=1e-4)


def test_score_unit_shap_adds_up_and_stays_in_range():
    r = run()
    total = sum(f["shap"] for f in r["all_factors"])
    assert total == pytest.approx(r["risk_score"] - r["base_score"], abs=2e-3)
    assert all(-1 <= f["shap"] <= 1 for f in r["all_factors"])
    assert sum(m["shap_logodds"] for m in r["modality_attribution"]) == pytest.approx(
        sum(f["shap_logodds"] for f in r["all_factors"]), abs=1e-3)


@pytest.mark.parametrize("feature,direction", sorted(MONOTONE.items()))
def test_monotone_constraints_hold(feature, direction):
    """Raising a feature never moves risk against its agreed direction."""
    m = get_model()
    feats, _, _ = build_features([c2_row(n=i, scr=30, tlf=38, knee_ffc=28, knee_rel=34) for i in (1, 2, 3)],
                                 steady_log(), athlete(), TODAY)
    start = feats[feature] if not math.isnan(feats[feature]) else 0.0
    row = dict(feats)
    probs = []
    for v in np.linspace(start - 50, start + (400 if feature == "days_since_return" else 50), 21):
        row[feature] = float(v)
        probs.append(m.probability([row])[0])
    assert np.all(np.diff(probs) * direction >= -1e-9)


# ---------------------------------------------------------------- output / narrative
def test_output_matches_team_contract_and_c4_model():
    r = run()
    jsonschema.validate(r, SCHEMA)
    jsonschema.validate(contract_view(r), SCHEMA)
    c4 = pytest.importorskip("c4_recommend.models", reason="C4 package not importable")
    c4.C3Risk(**contract_view(r))         # C4 accepts it (shap within +-1, level enum, ...)


def test_top_three_and_explanation():
    r = run(c2=[c2_row(n=i, scr=44, tlf=50) for i in (1, 2, 3)],
            log=steady_log(overs=5, days=(27, 20, 13), spike_overs=12, spike_days=(5, 4, 2, 1)))
    assert len(r["top_factors"]) == 3 and len(r["factor_lines"]) == 3
    assert r["explanation"] and len(r["explanation"]) <= 2000
    if r["alert"]:
        ups = [f for f in r["all_factors"] if f["measured"] and f["direction"] == "increases_risk"]
        assert [f["feature"] for f in r["top_factors"][:len(ups[:3])]] == [f["feature"] for f in ups[:3]]


def test_unmeasured_factors_never_reported_as_reasons():
    r = run(c2=[])
    kin = {"shoulder_counter_rotation_deg", "trunk_lateral_flexion_deg", "front_knee_flexion_ffc_deg",
           "front_knee_flexion_release_deg"}
    assert not kin & {f["feature"] for f in r["top_factors"]}
    assert any("No delivery analysed" in n for n in r["data_quality"])


def test_unreliable_caveat_in_explanation():
    r = run(c2=[c2_row(n=i, scr=48, reliable=False, tlf=38) for i in (1, 2, 3)])
    scr = next(f for f in r["all_factors"] if f["feature"] == "shoulder_counter_rotation_deg")
    assert scr["reliable"] is False
    if any(f["feature"] == "shoulder_counter_rotation_deg" for f in r["top_factors"]):
        assert "unreliable" in r["explanation"]


def test_synthetic_model_is_labelled():
    r = run()
    assert r["synthetic_model"] and any("synthetic" in n for n in r["data_quality"])
