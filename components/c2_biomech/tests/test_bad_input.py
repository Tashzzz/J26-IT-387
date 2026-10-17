"""Failure-path tests: missing, broken and garbage input (Lecture 9 checklist).

Each test documents what C2 does with that input, so the answer to
"what happens if...?" at PP1 is known in advance.
"""

import numpy as np
import pytest

from c2_biomech.features import compute_features
from c2_biomech.loader import from_c1_json
from c2_biomech.synthetic import make_delivery


def test_empty_frames_rejected_with_clear_message():
    data = make_delivery()
    data["frames"] = []
    with pytest.raises(ValueError, match="no frames"):
        from_c1_json(data)


def test_wrong_number_of_landmarks_rejected():
    data = make_delivery()
    data["frames"][3]["landmarks"] = data["frames"][3]["landmarks"][:17]  # e.g. a COCO-17 model
    with pytest.raises(ValueError, match="expected 33 landmarks"):
        from_c1_json(data)


def test_all_null_keypoints_rejected():
    """No person in the video (e.g. an empty pitch): every keypoint is null."""
    data = make_delivery()
    for fr in data["frames"]:
        fr["landmarks"] = [None] * 33
    with pytest.raises(ValueError, match="no measured keypoints"):
        from_c1_json(data)


@pytest.mark.parametrize("bad", [{"fps": 0}, {"fps": -30}, {"bowling_arm": "both"}])
def test_bad_header_values_rejected(bad):
    data = make_delivery()
    data.update(bad)
    with pytest.raises(ValueError):
        from_c1_json(data)


def test_missing_field_rejected():
    data = make_delivery()
    del data["bowling_arm"]
    with pytest.raises(ValueError, match="bowling_arm"):
        from_c1_json(data)


def test_single_missing_keypoint_at_event_uses_neighbour():
    """A keypoint dropped for one frame at FFC: value comes from the next frame."""
    data = make_delivery(missing=[(30, 25)])  # left knee missing at FFC
    row, _ = compute_features(from_c1_json(data))
    assert row["features"]["front_knee_flexion_ffc_deg"]["value"] == pytest.approx(25.0, abs=1.5)


def test_long_occlusion_gives_null_and_warning_not_wrong_number():
    """Front knee hidden for the whole stride: feature is null + warning."""
    data = make_delivery(missing=[(f, 25) for f in range(0, 60)])
    row, _ = compute_features(from_c1_json(data))
    f = row["features"]["front_knee_flexion_ffc_deg"]
    assert f["value"] is None and f["reliable"] is False and f["breach"] is False
    assert any("front_knee_flexion_ffc_deg" in w for w in row["warnings"])
    # Features that do not use the knee are still produced.
    assert row["features"]["shoulder_counter_rotation_deg"]["value"] is not None


def test_random_noise_input_does_not_crash():
    """Pure garbage coordinates: C2 returns a row (numbers are meaningless) and does not crash."""
    rng = np.random.default_rng(3)
    data = make_delivery()
    for fr in data["frames"]:
        fr["landmarks"] = [list(rng.normal(0, 1, 3)) + [0.9] for _ in range(33)]
    row, series = compute_features(from_c1_json(data))
    assert set(row["events"]) <= {"bfc_frame", "ffc_frame", "release_frame"}
    assert len(series) == 60


def test_frozen_video_all_frames_identical():
    """A still image instead of a video: no motion, so events are unreliable - must not crash."""
    data = make_delivery()
    first = data["frames"][0]["landmarks"]
    for fr in data["frames"]:
        fr["landmarks"] = first
    row, _ = compute_features(from_c1_json(data))
    assert "features" in row


def test_events_out_of_order_are_warned():
    data = make_delivery()
    row, _ = compute_features(from_c1_json(data),
                              overrides={"bfc_frame": 40, "ffc_frame": 20, "release_frame": 30})
    assert any("order looks wrong" in w for w in row["warnings"])
    assert row["features"]["shoulder_counter_rotation_deg"]["value"] is None


def test_event_outside_clip_is_dropped():
    data = make_delivery()
    row, _ = compute_features(from_c1_json(data), overrides={"release_frame": 500})
    assert "release_frame" not in row["events"]
    assert any("outside the clip" in w for w in row["warnings"])
