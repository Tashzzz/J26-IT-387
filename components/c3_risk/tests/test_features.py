"""Feature pipeline: known-answer tests on contract-shaped inputs."""
import math
from datetime import timedelta

import pytest

from c3_risk.features import athlete_features, build_features, kinematic_features, workload_features
from c3_risk.spec import FEATURE_NAMES, TYPICAL_TIME_LOSS_DAYS
from helpers import TODAY, athlete, c2_row, steady_log

nan = math.isnan


# ---------------------------------------------------------------- kinematics
def test_kinematic_mean_peak_slope_and_breach_share():
    rows = [c2_row(n=i + 1, scr=v, tlf=40 + i) for i, v in enumerate([26, 30, 34, 38])]
    f, notes, s = kinematic_features(rows)
    assert f["scr_mean"] == pytest.approx(32) and f["scr_peak"] == 38
    assert f["scr_slope"] == pytest.approx(4.0)            # +4 degrees per delivery
    assert f["scr_breach_share"] == pytest.approx(0.5)      # 34 and 38 are past 30
    assert f["tlf_breach_share"] == pytest.approx(0.75)     # 41, 42, 43 > 40; 40 is not
    assert s["deliveries"] == 4 and not notes


def test_deliveries_are_ordered_by_clip_number_not_list_order():
    rows = [c2_row(n=3, scr=40), c2_row(n=1, scr=20), c2_row(n=2, scr=30)]
    assert kinematic_features(rows)[0]["scr_slope"] == pytest.approx(10.0)


def test_slope_needs_three_deliveries():
    f, notes, _ = kinematic_features([c2_row(n=1, scr=30), c2_row(n=2, scr=35)])
    assert nan(f["scr_slope"]) and "Only 2 delivery" in notes[0]


def test_breach_computed_from_limit_when_flag_missing():
    row = c2_row(scr=35)
    del row["features"]["shoulder_counter_rotation_deg"]["breach"]
    assert kinematic_features([row])[0]["scr_breach_share"] == 1.0


def test_unreliable_values_used_but_reported_or_dropped():
    rows = [c2_row(n=1, scr=40, reliable=False), c2_row(n=2, scr=20)]
    f, notes, s = kinematic_features(rows)
    assert f["scr_mean"] == 30 and s["per_feature"]["shoulder_counter_rotation_deg"]["unreliable"] == 1
    assert any("checked on video" in n for n in notes)
    f2, notes2, _ = kinematic_features(rows, drop_unreliable=True)
    assert f2["scr_mean"] == 20 and any("left out" in n for n in notes2)


def test_no_c2_rows_gives_missing_technique_and_a_note():
    f, notes, _ = kinematic_features([])
    assert all(nan(v) for v in f.values()) and "No delivery analysed" in notes[0]


# ---------------------------------------------------------------- workload
def test_workload_known_answer():
    log = steady_log(overs=6, days=(27, 20, 13, 6, 5, 1))     # 4 weeks; days 6, 5 and 1 fall in the last 7
    f, notes, s = workload_features(log, TODAY)
    assert f["deliveries_7d"] == 3 * 36                     # 3 sessions x 6 overs x 6 balls
    assert f["deliveries_28d_weekly"] == pytest.approx(6 * 36 / 4)
    assert f["acwr_7_28"] == pytest.approx(108 / 54)
    assert f["bowling_days_7d"] == 3 and f["rest_days_7d"] == 4
    assert f["max_daily_deliveries_7d"] == 36 and s["history_days"] == 28 and not notes


def test_short_history_leaves_ratios_out():
    f, notes, _ = workload_features(steady_log(days=(3, 1)), TODAY)
    assert nan(f["acwr_7_28"]) and nan(f["ewma_ratio"]) and nan(f["differential_load_7d"])
    assert "load ratios" in notes[0]


def test_future_sessions_ignored_and_consecutive_days():
    log = steady_log(days=(3, 2, 1, 0)) + [{"session_date": (TODAY + timedelta(days=2)).isoformat(),
                                            "session_type": "nets", "overs": 30}]
    f, _, s = workload_features(log, TODAY)
    assert f["consecutive_bowling_days"] == 4 and s["sessions"] == 4


def test_matches_counted_over_14_days():
    f, _, _ = workload_features(steady_log(days=(20, 10), spike_overs=8, spike_days=(12, 2, 30)), TODAY)
    assert f["matches_14d"] == 2


def test_no_workload_logged():
    f, notes, _ = workload_features([], TODAY)
    assert all(nan(v) for v in f.values()) and "No workload" in notes[0]


# ---------------------------------------------------------------- athlete
def test_athlete_profile_features():
    inj = [{"site": "lumbar", "injury_date": (TODAY - timedelta(days=100)).isoformat(), "returned_to_play": True},
           {"site": "hamstring", "injury_date": (TODAY - timedelta(days=400)).isoformat(), "returned_to_play": True}]
    f, notes, _ = athlete_features(athlete(age=16, level="school", injuries=inj), TODAY)
    assert f["age"] == 16 and f["level_school"] == 1 and f["level_higher"] == 0
    assert f["lumbar_12m"] == 1 and f["hamstring_12m"] == 0 and f["injuries_12m"] == 1 and f["injuries_6m"] == 1
    assert f["days_since_return"] == 100 - TYPICAL_TIME_LOSS_DAYS["lumbar"]
    assert f["months_since_last_injury"] == pytest.approx(100 / 30.44, abs=0.01) and not notes


def test_not_returned_to_play_is_flagged():
    inj = [{"site": "side_strain", "injury_date": (TODAY - timedelta(days=10)).isoformat(), "returned_to_play": False}]
    f, notes, _ = athlete_features(athlete(injuries=inj), TODAY)
    assert f["days_since_return"] == 0 and "should not bowl" in notes[0]


def test_no_injuries_rule_based_fill():
    f, _, _ = athlete_features(athlete(level="national"), TODAY)
    assert f["months_since_last_injury"] == 24 and f["days_since_return"] == 365 and f["level_higher"] == 1


def test_build_features_returns_every_model_feature():
    feats, notes, summary = build_features([c2_row(scr=33)], steady_log(), athlete(), TODAY)
    assert list(feats) == FEATURE_NAMES and summary["as_of"] == TODAY.isoformat()
