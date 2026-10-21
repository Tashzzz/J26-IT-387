"""Tests for robustness.py, using made-up frames and tracks only (no bowler data)."""

import numpy as np
import pytest

from reliability import ICC_KEYPOINTS, N_POINTS
from robustness import agreement, applies, low_light, make_transform, shrink


def grey(value, shape=(40, 60, 3)):
    return np.full(shape, value, dtype=np.uint8)


def test_low_light_without_gain_darkens():
    out = low_light(grey(180), -2, False)
    assert out.dtype == np.uint8 and out.shape == (40, 60, 3)
    assert out.mean() < 180 * 0.7             # 1/4 of the light is much darker in sRGB too


def test_more_stops_is_darker():
    assert low_light(grey(180), -4, False).mean() < low_light(grey(180), -2, False).mean()


def test_gain_keeps_brightness_but_adds_noise():
    out = low_light(grey(120), -4, True)
    assert out.mean() == pytest.approx(120, abs=8)
    assert out.std() > low_light(grey(120), -2, True).std() > 0


def test_shrink_sets_long_side_and_never_enlarges():
    assert shrink(np.zeros((3840, 2160, 3), np.uint8), 1920).shape == (1920, 1080, 3)
    assert shrink(np.zeros((1920, 1080, 3), np.uint8), 1920).shape == (1920, 1080, 3)


def test_transform_is_repeatable_per_clip():
    frame = grey(150)
    a = make_transform("dark_4ev_gain", "B02_D01_side_10m")(frame)
    b = make_transform("dark_4ev_gain", "B02_D01_side_10m")(frame)
    assert np.array_equal(a, b)
    assert make_transform("phone_proxy", "x")(np.zeros((100, 50, 3), np.uint8)).shape == (100, 50, 3)


def test_phone_proxy_only_for_60_fps():
    assert applies("phone_proxy", 59.2)
    assert not applies("phone_proxy", 30.0)
    assert applies("dark_4ev", 30.0)


def aligned(seed):
    rng = np.random.default_rng(seed)
    a = np.full((33, 2, N_POINTS), np.nan)
    a[ICC_KEYPOINTS] = np.sin(np.linspace(0, 3, N_POINTS)) + rng.normal(0, 0.3, (len(ICC_KEYPOINTS), 2, 1))
    return a


def test_agreement_identical_deliveries():
    base = [(f"c{i}", aligned(i)) for i in range(3)]
    rows = {r["keypoint"]: r for r in agreement(base, base)}
    assert rows["nose"]["icc_vs_baseline"] == pytest.approx(1.0, abs=1e-6)
    assert rows["nose"]["mean_abs_diff"] == 0
    assert rows["nose"]["n_deliveries"] == 3


def test_agreement_skips_missing_keypoint_and_unmatched_clip():
    base = [(f"c{i}", aligned(i)) for i in range(3)]
    cond = [(c, a.copy()) for c, a in base] + [("extra", aligned(9))]
    cond[0][1][0] = np.nan                    # nose missing in one delivery
    rows = {r["keypoint"]: r for r in agreement(base, cond)}
    assert rows["nose"]["n_deliveries"] == 2
    assert rows["left_wrist"]["n_deliveries"] == 3


def test_lost_uses_the_app_detection_gate():
    from robustness import lost
    assert lost({"detection_rate": 0.0})
    assert lost({"detection_rate": 0.10})
    assert not lost({"detection_rate": 0.45})
