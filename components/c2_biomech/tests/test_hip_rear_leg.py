"""Rear knee, rear hip and front hip angles (Alway et al. 2021 technique parameters).

Known-answer tests for the hip angle, and checks that the three new features are
computed from the right leg, at the right event, with the view-dependent method.
"""

import numpy as np
import pytest

from c2_biomech import keypoints as kp
from c2_biomech.angles import angle_series, hip_flexion
from c2_biomech.features import compute_features, value_at
from c2_biomech.loader import from_c1_json
from c2_biomech.synthetic import make_delivery

NEW = {
    "rear_knee_flexion_bfc_deg": ("rear_knee_flexion", "bfc_frame", "bfc"),
    "rear_hip_flexion_bfc_deg": ("rear_hip_flexion", "bfc_frame", "bfc"),
    "front_hip_flexion_ffc_deg": ("front_hip_flexion", "ffc_frame", "ffc"),
}


def P(x, y, z=0.0):
    return np.array([[x, y, z]], float)


def test_straight_trunk_and_thigh_is_zero_hip_flexion():
    # shoulder above hip, knee below hip (y points down)
    assert hip_flexion(P(0, -1), P(0, 0), P(0, 1))[0] == pytest.approx(0.0, abs=1e-6)


@pytest.mark.parametrize("deg", [20.0, 45.0, 90.0])
def test_hip_flexion_known_angle(deg):
    r = np.radians(deg)
    thigh = P(np.sin(r), np.cos(r))  # thigh swung forward by deg from straight down
    assert hip_flexion(P(0, -1), P(0, 0), thigh)[0] == pytest.approx(deg, abs=1e-6)


@pytest.mark.parametrize("arm, back, front", [
    ("right", (kp.RIGHT_HIP, kp.RIGHT_KNEE, kp.RIGHT_ANKLE), (kp.LEFT_HIP, kp.LEFT_KNEE)),
    ("left", (kp.LEFT_HIP, kp.LEFT_KNEE, kp.LEFT_ANKLE), (kp.RIGHT_HIP, kp.RIGHT_KNEE)),
])
def test_rear_and_front_legs_follow_bowling_arm(arm, back, front):
    s = kp.sides(arm)
    assert (s["back_hip"], s["back_knee"], s["back_ankle"]) == back
    assert (s["front_hip"], s["front_knee"]) == front


def test_rear_knee_uses_back_leg_only():
    """Bending only the back knee changes rear knee flexion, not front knee flexion."""
    pts = np.zeros((1, 33, 3))
    s = kp.sides("right")
    for side in ("front", "back"):
        pts[0, s[f"{side}_hip"]] = [0, 0, 0]
        pts[0, s[f"{side}_knee"]] = [0, 1, 0]
        pts[0, s[f"{side}_ankle"]] = [0, 2, 0]
    pts[0, s["back_ankle"]] = [np.sin(np.radians(40)), 1 + np.cos(np.radians(40)), 0]
    pts[0, kp.LEFT_SHOULDER] = [0, -1, 0]
    pts[0, kp.RIGHT_SHOULDER] = [0, -1, 0]
    ang = angle_series(pts, "right")
    assert ang["rear_knee_flexion_2d_deg"][0] == pytest.approx(40.0, abs=1e-6)
    assert ang["front_knee_flexion_2d_deg"][0] == pytest.approx(0.0, abs=1e-6)


@pytest.mark.parametrize("view, method, suitability", [
    ("side", "2d", "good"), ("front", "3d", "poor"), ("rear", "3d", "poor"),
])
def test_new_features_present_with_view_method(view, method, suitability):
    data = make_delivery(view=view)
    row, series = compute_features(from_c1_json(data), filter_mode="off")
    for name, (series_name, event_key, event) in NEW.items():
        f = row["features"][name]
        assert f["method"] == method and f["view_suitability"] == suitability, name
        assert f["event"] == event, name
        assert f["threshold"] is None and f["level"] == "none" and f["breach"] is False, name
        frame = row["events"][event_key]
        expected = value_at(series[f"{series_name}_{method}_deg"].to_numpy(), frame)
        assert f["value"] == pytest.approx(round(expected, 1), abs=0.05), name
        if suitability == "poor":
            assert f["reliable"] is False, name
