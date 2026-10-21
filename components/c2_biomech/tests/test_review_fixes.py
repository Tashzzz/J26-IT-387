"""Fixes from the 21 Oct 2026 review against Kinovea pilot measurements."""

import numpy as np
import pytest

from c2_biomech.angles import hip_flexion, trunk_lateral_flexion
from c2_biomech.events import FFC_AFTER_MAX_REACH_S, estimate_contacts
from c2_biomech.features import compute_features, shoulder_counter_rotation
from c2_biomech.loader import from_c1_json
from c2_biomech.synthetic import make_delivery

r = np.radians


def P(x, y, z=0.0):
    return np.array([[x, y, z]], float)


# ---------- hip angle uses the trunk line, not one shoulder point ----------

def test_hip_angle_uses_trunk_line():
    """Moving one shoulder point (arm raised) does not change the hip angle when
    the trunk line (mid-hip -> mid-shoulder) is the same."""
    hip, knee, mid_hip = P(0.1, 0, 0), P(0.1, 1, 0), P(0, 0, 0)
    a = hip_flexion(P(0, -1), hip, knee, mid_hip)
    b = hip_flexion(P(0, -1), hip, knee, mid_hip)
    assert a[0] == pytest.approx(b[0])
    assert a[0] == pytest.approx(0.0, abs=1e-6)  # trunk up, thigh down = straight


@pytest.mark.parametrize("deg", [15.0, 40.0])
def test_hip_angle_trunk_lean_known(deg):
    """Trunk leaning back by deg over a vertical thigh = deg of hip flexion change."""
    mid_sh = P(-np.sin(r(deg)), -np.cos(r(deg)))
    assert hip_flexion(mid_sh, P(0, 0), P(0, 1), P(0, 0))[0] == pytest.approx(deg, abs=1e-6)


# ---------- trunk side-bend: Cardan convention ----------

def test_side_bend_not_inflated_by_forward_lean():
    """True 20 deg side-bend with 40 deg forward lean reads 20 deg (the old projection read 25.4)."""
    lat, fwd, up = np.array([1.0, 0, 0]), np.array([0, 0, 1.0]), np.array([0, -1.0, 0])
    # Cardan: flex forward 40, then bend sideways 20
    d = np.cos(r(20)) * np.cos(r(40)) * up + np.sin(r(20)) * lat + np.cos(r(20)) * np.sin(r(40)) * fwd
    lh, rh = -0.15 * lat, 0.15 * lat
    ls, rs = d - 0.18 * lat, d + 0.18 * lat
    assert trunk_lateral_flexion(lh[None], rh[None], ls[None], rs[None])[0] == pytest.approx(20.0, abs=1e-6)


# ---------- shoulder counter-rotation: away direction only ----------

def test_scr_ignores_later_forward_rotation():
    """10 deg away, then 35 deg forward before FFC: SCR is 10, not 35."""
    align = np.array([0, -4, -8, -10, -5, 5, 20, 35], dtype=float)
    assert shoulder_counter_rotation(align, 0, 7) == pytest.approx(10.0)


def test_scr_direction_independent_of_sign():
    """Counter-rotation is found whichever sign the camera gives it."""
    align = np.array([0, 6, 15, 30, 20, 5], dtype=float)
    assert shoulder_counter_rotation(align, 0, 5) == pytest.approx(30.0)
    assert shoulder_counter_rotation(-align, 0, 5) == pytest.approx(30.0)


# ---------- FFC: furthest reach + delay ----------

def test_ffc_is_after_furthest_reach():
    """The leading foot reaches furthest at frame 40; FFC is placed the landing delay later."""
    fps, n, release = 60.0, 80, 52
    pts = np.full((n, 33, 3), np.nan)
    t = np.arange(n)
    pts[:, 23] = [-0.1, 0, 0]
    pts[:, 24] = [0.1, 0, 0]
    reach = np.exp(-((t - 40) / 6.0) ** 2)                 # front ankle peaks forward at frame 40
    pts[:, 27] = np.stack([1.0 + reach, np.full(n, 2.0), np.zeros(n)], 1)
    back_y = 1.8 + 0.2 * np.exp(-((t - 31) / 3.0) ** 2)    # back ankle lowest at frame 31
    pts[:, 28] = np.stack([np.full(n, -0.5), back_y, np.zeros(n)], 1)
    bfc, ffc = estimate_contacts(pts, fps, release)
    assert ffc == 40 + int(round(FFC_AFTER_MAX_REACH_S * fps))
    assert bfc < ffc


# ---------- low frame rate warning ----------

def test_low_fps_warning():
    row, _ = compute_features(from_c1_json(make_delivery(fps=30.0, n_frames=30, bfc=8, ffc=15, release=21)))
    assert any("fps" in w and "60 fps" in w for w in row["warnings"])
    row, _ = compute_features(from_c1_json(make_delivery(fps=60.0)))
    assert not any("60 fps or more" in w for w in row["warnings"])
