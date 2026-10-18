"""Tests for stabilise.py (masking + gap fill), using made-up tracks (no bowler data)."""

import numpy as np

from stabilise import fill_short_gaps, mask_low_visibility, stabilise_tracks

NAN = np.nan


def test_short_gap_is_filled_in_a_straight_line():
    track = np.array([0.0, NAN, NAN, 3.0])
    filled, was_filled = fill_short_gaps(track, max_gap=5)
    assert np.allclose(filled, [0, 1, 2, 3])
    assert was_filled.tolist() == [False, True, True, False]


def test_long_gap_is_left_missing():
    track = np.array([0.0, NAN, NAN, NAN, 4.0])
    filled, was_filled = fill_short_gaps(track, max_gap=2)
    assert np.isnan(filled[1:4]).all()
    assert not was_filled.any()


def test_gap_at_the_start_or_end_is_not_invented():
    track = np.array([NAN, 1.0, 2.0, NAN])
    filled, was_filled = fill_short_gaps(track, max_gap=5)
    assert np.isnan(filled[0]) and np.isnan(filled[3])
    assert not was_filled.any()


def test_low_visibility_keypoints_are_masked():
    coords = np.ones((2, 33, 6))
    visibility = np.full((2, 33), 0.9)
    visibility[1, 13] = 0.2  # left elbow barely visible in frame 1
    masked = mask_low_visibility(coords, visibility, min_visibility=0.5)
    assert np.isnan(masked[1, 13]).all()
    assert not np.isnan(masked[0]).any()


def test_masked_frame_is_filled_back_and_flagged():
    frames = 5
    coords = np.tile(np.arange(frames, dtype=float)[:, None, None], (1, 33, 6))
    visibility = np.full((frames, 33), 0.9)
    visibility[2, 0] = 0.1  # nose hidden in the middle frame
    _, stable, filled = stabilise_tracks(coords, visibility, min_visibility=0.5, max_gap=5)
    assert np.isclose(stable[2, 0, 0], 2.0)
    assert filled[2, 0] and filled.sum() == 1


def test_no_smoothing_is_applied():
    # A zig-zag that a low-pass filter would flatten must come back unchanged.
    frames = 20
    zigzag = np.where(np.arange(frames) % 2 == 0, 0.0, 1.0)
    coords = np.tile(zigzag[:, None, None], (1, 33, 6))
    visibility = np.ones((frames, 33))
    _, stable, _ = stabilise_tracks(coords, visibility)
    assert np.allclose(stable, coords)
