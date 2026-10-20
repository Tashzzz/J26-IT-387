"""Tests for reliability_lookup.py: picking the ICC tags for a clip's camera setup.

A small made-up c1_reliability.json is used, so the tests do not change when the
pilot study is re-run.
"""

import json

import pytest

from reliability_lookup import NO_MATCH_NOTE, SOURCE, keypoint_tags, lookup, summary


def tag(icc, usable):
    return {"icc": icc, "band": "good" if usable else "poor", "usable": usable}


@pytest.fixture
def study(tmp_path):
    path = tmp_path / "c1_reliability.json"
    path.write_text(json.dumps({"icc_type": "ICC(2,1)", "gate": 0.75, "groups": {
        "B03_side_4m": {"left_wrist": tag(0.84, True), "left_elbow": tag(0.82, True),
                        "left_hip": tag(0.82, True), "left_knee": tag(0.47, False),
                        "left_ankle": tag(0.49, False)},
        "B02_side_10m": {"left_wrist": tag(0.86, True), "left_knee": tag(0.45, False)},
        "B01_semi_side_5m": {"left_wrist": tag(0.90, True), "left_knee": tag(0.89, True)},
    }}))
    return path


def test_exact_match(study):
    r = lookup("side", 4, study)
    assert r["setup_matched"] == "side 4 m"
    assert r["gate"] == 0.75 and r["source"] == SOURCE
    assert r["left_knee"] == tag(0.47, False)
    assert len(keypoint_tags(r)) == 5


def test_nearest_distance_within_2_m(study):
    assert lookup("side", 5, study)["setup_matched"] == "side 4 m"       # 1 m from 4 m
    assert lookup("side", "6", study)["setup_matched"] == "side 4 m"     # 2 m, still inside
    assert lookup("side", 8.5, study)["setup_matched"] == "side 10 m"
    assert lookup("semi-side", 6, study)["setup_matched"] == "semi-side 5 m"


@pytest.mark.parametrize("angle, distance", [
    ("side", 7),        # 3 m from both 4 m and 10 m
    ("front", 5),       # angle never studied
    ("side", None),     # no distance
    ("side", "far"),
])
def test_no_match(study, angle, distance):
    assert lookup(angle, distance, study) == {"setup_matched": None, "note": NO_MATCH_NOTE}


@pytest.mark.parametrize("angle", [None, ""])
def test_no_angle(study, angle):
    assert lookup(angle, 4, study) == {"setup_matched": None, "note": NO_MATCH_NOTE}


def test_missing_study_file_is_no_match(tmp_path):
    assert lookup("side", 4, tmp_path / "none.json")["setup_matched"] is None


def test_two_bowlers_same_setup_keep_lowest_icc(study):
    data = json.loads(study.read_text())
    data["groups"]["B05_side_4m"] = {"left_wrist": tag(0.70, False), "left_knee": tag(0.80, True)}
    study.write_text(json.dumps(data))
    r = lookup("side", 4, study)
    assert r["left_wrist"] == tag(0.70, False)
    assert r["left_knee"] == tag(0.47, False)


def test_summary_lists_body_regions(study):
    s = summary(lookup("side", 4, study))
    assert s["setup_matched"] == "side 4 m"
    assert (s["usable"], s["total"]) == (3, 5)
    assert s["reliable_regions"] == ["elbows", "wrists", "hips"]
    assert s["less_reliable_regions"] == ["knees", "ankles"]


def test_summary_without_match():
    s = summary({"setup_matched": None, "note": NO_MATCH_NOTE})
    assert s["setup_matched"] is None and s["note"] == NO_MATCH_NOTE
    assert (s["usable"], s["total"], s["reliable_regions"]) == (0, 0, [])


def test_real_study_file_has_side_4m():
    """The committed pilot results can be looked up (side 4 m was studied)."""
    r = lookup("side", 4)
    assert r["setup_matched"] == "side 4 m"
    assert all({"icc", "band", "usable"} <= set(t) for t in keypoint_tags(r).values())
