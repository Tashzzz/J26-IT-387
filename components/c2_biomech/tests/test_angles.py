"""Unit tests: angle maths with hand-checked answers."""

import numpy as np
import pytest

from c2_biomech.angles import (angle_between, joint_angle, knee_flexion, line_alignment,
                               trunk_lateral_flexion, wrap180)


def v(*xyz):
    return np.array([xyz], dtype=float)  # one frame


def test_right_angle():
    assert angle_between(v(1, 0, 0), v(0, 1, 0))[0] == pytest.approx(90.0)


def test_parallel_and_opposite():
    assert angle_between(v(2, 0, 0), v(5, 0, 0))[0] == pytest.approx(0.0, abs=1e-6)
    assert angle_between(v(1, 0, 0), v(-3, 0, 0))[0] == pytest.approx(180.0)


def test_zero_length_vector_gives_nan_not_crash():
    assert np.isnan(angle_between(v(0, 0, 0), v(1, 0, 0))[0])


def test_missing_point_gives_nan():
    assert np.isnan(joint_angle(v(np.nan, 0, 0), v(0, 0, 0), v(0, 1, 0))[0])


def test_straight_leg_has_zero_flexion():
    hip, knee, ankle = v(0, 0, 0), v(0, 1, 0), v(0, 2, 0)  # y down
    assert knee_flexion(hip, knee, ankle)[0] == pytest.approx(0.0, abs=1e-6)


def test_bent_leg_90_degrees():
    hip, knee, ankle = v(0, 0, 0), v(0, 1, 0), v(1, 1, 0)
    assert knee_flexion(hip, knee, ankle)[0] == pytest.approx(90.0)


def test_line_alignment_and_wrap():
    a = line_alignment(v(0, 0, 0), v(1, 0, 1))[0]
    assert a == pytest.approx(45.0)
    # Same line drawn the other way round is the same alignment once wrapped.
    b = line_alignment(v(1, 0, 1), v(0, 0, 0))[0]
    assert wrap180(a - b) == pytest.approx(0.0)
    assert wrap180(170.0) == pytest.approx(-10.0)


def test_upright_trunk_has_zero_side_bend():
    lh, rh = v(0.3, 0, 0), v(-0.3, 0, 0)
    ls, rs = v(0.5, -1.7, 0), v(-0.5, -1.7, 0)
    assert trunk_lateral_flexion(lh, rh, ls, rs)[0] == pytest.approx(0.0, abs=1e-6)


@pytest.mark.parametrize("tilt", [10.0, 25.0, 40.0])
def test_trunk_side_bend_known_tilt(tilt):
    r = np.radians(tilt)
    mid = np.array([np.sin(r), -np.cos(r), 0.0]) * 1.7
    lh, rh = v(0.3, 0, 0), v(-0.3, 0, 0)
    ls, rs = (mid + [0.5, 0, 0])[None], (mid - [0.5, 0, 0])[None]
    assert trunk_lateral_flexion(lh, rh, ls, rs)[0] == pytest.approx(tilt, abs=1e-6)


def test_forward_lean_is_not_side_bend():
    """Bending forward (towards the camera axis) must not count as lateral flexion."""
    r = np.radians(30)
    mid = np.array([0.0, -np.cos(r), np.sin(r)]) * 1.7
    lh, rh = v(0.3, 0, 0), v(-0.3, 0, 0)
    ls, rs = (mid + [0.5, 0, 0])[None], (mid - [0.5, 0, 0])[None]
    assert trunk_lateral_flexion(lh, rh, ls, rs)[0] == pytest.approx(0.0, abs=1e-6)
