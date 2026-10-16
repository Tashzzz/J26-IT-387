"""Pipeline tests on synthetic deliveries with known answers, plus contract checks."""

import json
from pathlib import Path

import pytest

from c2_biomech.features import compute_features
from c2_biomech.loader import from_c1_json
from c2_biomech.synthetic import make_delivery
from c2_biomech.thresholds import classify

REPO = Path(__file__).resolve().parents[3]
FEATURES = ["shoulder_counter_rotation_deg", "front_knee_flexion_ffc_deg",
            "front_knee_flexion_release_deg", "trunk_lateral_flexion_deg",
            "hip_shoulder_separation_bfc_deg"]


def run(**kw):
    data = make_delivery(**kw)
    row, series = compute_features(from_c1_json(data))
    return row, series, data["_truth"]


def test_events_detected_exactly_on_clean_delivery():
    row, _, truth = run()
    for ev in ("bfc_frame", "ffc_frame", "release_frame"):
        assert row["events"][ev] == truth[ev], ev
    assert row["event_method"] == {"release_frame": "auto", "bfc_frame": "auto", "ffc_frame": "auto"}


def test_features_match_known_values():
    row, _, truth = run()
    for name in FEATURES:
        assert row["features"][name]["value"] == pytest.approx(truth[name], abs=0.5), name


@pytest.mark.parametrize("scr,expect_breach", [(20.0, False), (35.0, True)])
def test_scr_threshold_mapping(scr, expect_breach):
    row, _, _ = run(scr_deg=scr)
    assert row["features"]["shoulder_counter_rotation_deg"]["breach"] is expect_breach


def test_left_arm_bowler():
    row, _, truth = run(bowling_arm="left")
    assert row["events"]["ffc_frame"] == truth["ffc_frame"]
    assert row["features"]["front_knee_flexion_ffc_deg"]["value"] == pytest.approx(25.0, abs=0.5)


def test_noisy_delivery_stays_close():
    """With small coordinate noise (what remains after C1's filter) values stay within 3 deg."""
    row, _, truth = run(noise=0.005, seed=1)
    for name in FEATURES:
        assert row["features"][name]["value"] == pytest.approx(truth[name], abs=3.0), name
    for ev in ("bfc_frame", "ffc_frame", "release_frame"):
        assert abs(row["events"][ev] - truth[ev]) <= 2, ev


def test_manual_override_wins():
    data = make_delivery()
    row, _ = compute_features(from_c1_json(data), overrides={"release_frame": 40})
    assert row["events"]["release_frame"] == 40
    assert row["event_method"]["release_frame"] == "manual"


def test_c1_window_is_used_when_given():
    data = make_delivery()
    data["window"] = {"bfc_frame": 16, "release_frame": 41}
    row, _ = compute_features(from_c1_json(data))
    assert row["events"]["bfc_frame"] == 16
    assert row["event_method"]["bfc_frame"] == "c1_window"


def test_unreliable_keypoint_from_c1_is_flagged():
    data = make_delivery()
    data["reliability"] = {"left_knee": {"icc": 0.61, "band": "moderate", "usable": False}}
    row, _ = compute_features(from_c1_json(data))
    knee = row["features"]["front_knee_flexion_ffc_deg"]
    assert knee["reliable"] is False
    assert knee["unusable_keypoints"] == ["left_knee"]
    assert row["features"]["shoulder_counter_rotation_deg"]["reliable"] is True


def test_classify_levels():
    assert classify("shoulder_counter_rotation_deg", 31.0) == (True, "red")
    assert classify("shoulder_counter_rotation_deg", 27.0) == (False, "amber")
    assert classify("shoulder_counter_rotation_deg", 10.0) == (False, "green")
    assert classify("front_knee_flexion_release_deg", 10.0) == (True, "red")
    assert classify("front_knee_flexion_release_deg", 45.0) == (False, "green")
    assert classify("front_knee_flexion_ffc_deg", 25.0) == (False, "none")
    assert classify("trunk_lateral_flexion_deg", None) == (False, "none")


def test_output_matches_c2_contract():
    jsonschema = pytest.importorskip("jsonschema")
    schema = json.loads((REPO / "contracts" / "c2_features.schema.json").read_text())
    row, _, _ = run()
    jsonschema.validate(json.loads(json.dumps(row)), schema)


def test_reads_c1_contract_sample_without_crashing():
    """The C1 sample has only one frame: C2 must report warnings, not crash."""
    data = json.loads((REPO / "contracts" / "samples" / "c1_sample.json").read_text())
    row, _ = compute_features(from_c1_json(data))
    assert row["warnings"]
    assert all(f["value"] is None for f in row["features"].values())
