"""Tests for reliability.py, using made-up tracks only (no bowler data)."""

import numpy as np
import pandas as pd
import pytest

from reliability import (LEFT_WRIST, N_POINTS, RIGHT_WRIST, band, bowling_wrist, find_release,
                         icc2, icc_groups, resample)


def motion(t):
    """A smooth made-up keypoint path: lowest y (highest point) at t = 1.0 s."""
    return 0.5 * (t - 1.0) ** 2 - 1.0


def test_identical_tracks_give_icc_one():
    curve = np.sin(np.linspace(0, 3, N_POINTS))
    icc, _, _ = icc2(np.column_stack([curve, curve, curve]))
    assert icc == pytest.approx(1.0, abs=1e-6)


def test_pure_noise_gives_low_icc():
    rng = np.random.default_rng(0)
    icc, _, _ = icc2(rng.normal(size=(N_POINTS, 3)))
    assert icc < 0.2


def test_release_is_frame_with_highest_wrist():
    wrist_y = np.array([0.4, 0.1, -0.3, -0.9, -0.6, np.nan, 0.2])   # y points down
    assert find_release(wrist_y) == 3


def test_release_ignores_missing_frames():
    assert find_release([np.nan, 0.5, np.nan, -0.2, np.nan]) == 3
    with pytest.raises(ValueError):
        find_release([np.nan, np.nan])


def test_30_and_60_fps_give_same_resampled_track():
    tracks = {}
    for fps in (30, 60):
        t = np.arange(0, 2.0, 1 / fps)
        y = motion(t)
        tracks[fps] = resample(y, find_release(y), fps)
    assert find_release(motion(np.arange(0, 2.0, 1 / 30))) == 30   # t = 1.0 s
    assert np.allclose(tracks[30], tracks[60], atol=2e-3)


def test_too_many_missing_frames_marks_keypoint_missing():
    fps = 30
    y = motion(np.arange(0, 2.0, 1 / fps))
    release = 30
    gappy = y.copy()
    gappy[release - 12:release - 4] = np.nan       # 8 of 22 window frames missing (36 %)
    assert resample(gappy, release, fps) is None
    small_gap = y.copy()
    small_gap[release - 3:release - 1] = np.nan    # 2 of 22 (9 %): bridged by interpolation
    assert resample(small_gap, release, fps) == pytest.approx(resample(y, release, fps), abs=1e-2)


def test_groups_use_metadata_columns_not_clip_id():
    meta = pd.DataFrame({
        "clip_id": ["X_front", "X_side", "X_other", "Y_a", "Y_b"],
        "bowler_id": ["B09"] * 3 + ["B08"] * 2,
        "delivery_no": [1, 2, 3, 1, 2],
        "angle": ["side"] * 5,
        "distance_m": [4, 4, 4, 4, 4],
        "use": ["icc"] * 5,
    })
    groups = icc_groups(meta)
    assert list(groups) == ["B09_side_4m"]          # B08 has only 2 deliveries
    assert len(groups["B09_side_4m"]) == 3


def test_bowling_arm_and_bands():
    assert bowling_wrist("left-arm; added for ICC group") == LEFT_WRIST
    assert bowling_wrist("right-arm") == RIGHT_WRIST
    assert [band(v) for v in (0.3, 0.5, 0.8, 0.95, np.nan)] == [
        "poor", "moderate", "good", "excellent", "not_enough_data"]
