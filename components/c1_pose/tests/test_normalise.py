"""Tests for normalise.py, using small made-up skeletons (no bowler data)."""

import numpy as np
import pytest

from normalise import (LEFT_HIP, LEFT_SHOULDER, RIGHT_HIP, RIGHT_SHOULDER,
                       normalise_frames, to_pixels)


def skeleton(frames=3, hip_x=100.0, shoulder_width=40.0, torso=60.0):
    """Pixel skeleton: hips 20 px apart at y=200, shoulders above them.
    Other keypoints are put at the hip centre + (5, -10)."""
    px = np.zeros((frames, 33, 3))
    px[:, :, 0] = hip_x + 5
    px[:, :, 1] = 200 - 10
    px[:, LEFT_HIP] = [hip_x - 10, 200, 0]
    px[:, RIGHT_HIP] = [hip_x + 10, 200, 0]
    px[:, LEFT_SHOULDER] = [hip_x - shoulder_width / 2, 200 - torso, 0]
    px[:, RIGHT_SHOULDER] = [hip_x + shoulder_width / 2, 200 - torso, 0]
    return px


def test_hip_centre_becomes_origin():
    normed, _ = normalise_frames(skeleton())
    hip_centre = (normed[:, LEFT_HIP] + normed[:, RIGHT_HIP]) / 2
    assert np.allclose(hip_centre, 0)


def test_shoulder_width_becomes_one():
    normed, info = normalise_frames(skeleton(shoulder_width=40))
    width = np.linalg.norm(normed[:, LEFT_SHOULDER, :2] - normed[:, RIGHT_SHOULDER, :2], axis=1)
    assert np.allclose(width, 1.0)
    assert info["scale_px"] == 40


def test_same_pose_different_distance_and_position_gives_same_result():
    near = skeleton(hip_x=100, shoulder_width=40, torso=60)
    # Same body filmed from further away (half size) and further right in the frame.
    far = skeleton(hip_x=300, shoulder_width=20, torso=30)
    far[:, :, :2] = (near[:, :, :2] - [100, 200]) / 2 + [300, 200]
    a, _ = normalise_frames(near)
    b, _ = normalise_frames(far)
    assert np.allclose(a, b)


def test_torso_length_option():
    normed, info = normalise_frames(skeleton(torso=60), scale_method="torso_length")
    assert info["scale_px"] == 60
    assert info["median_px"]["shoulder_width"] == 40  # both lengths are always reported
    shoulder_mid = (normed[:, LEFT_SHOULDER, :2] + normed[:, RIGHT_SHOULDER, :2]) / 2
    assert np.allclose(np.linalg.norm(shoulder_mid, axis=1), 1.0)


def test_frame_with_missing_hip_is_left_empty():
    px = skeleton(frames=3)
    px[1, LEFT_HIP] = np.nan
    normed, info = normalise_frames(px)
    assert np.isnan(normed[1]).all()
    assert not np.isnan(normed[0]).any() and not np.isnan(normed[2]).any()
    assert info["frames_without_origin"] == 1


def test_scale_is_median_so_one_bad_frame_does_not_change_it():
    px = skeleton(frames=5, shoulder_width=40)
    px[2, RIGHT_SHOULDER, 0] += 200  # one frame with a wild shoulder estimate
    _, info = normalise_frames(px)
    assert info["scale_px"] == 40


def test_no_shoulders_anywhere_raises():
    px = skeleton()
    px[:, LEFT_SHOULDER] = np.nan
    with pytest.raises(ValueError):
        normalise_frames(px)


def test_unknown_scale_method_raises():
    with pytest.raises(ValueError):
        normalise_frames(skeleton(), scale_method="arm_length")


def test_to_pixels_uses_width_for_x_and_z_height_for_y():
    coords = np.array([[[0.5, 0.5, 0.1]]])
    assert np.allclose(to_pixels(coords, 1920, 1080), [[[960, 540, 192]]])
