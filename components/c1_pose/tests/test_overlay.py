"""Tests for overlay.py: drawing must cope with the gaps stabilise.py leaves."""

import numpy as np
import pandas as pd

from overlay import draw, load_keypoints


def test_empty_keypoints_from_stabilised_csv_are_skipped(tmp_path):
    # Frame 0: no pose. Frame 1: keypoint 0 tracked, keypoint 1 masked (empty x/y).
    rows = [
        {"frame": 0, "kp_id": 0, "detected": 0, "x": None, "y": None, "visibility": None},
        {"frame": 1, "kp_id": 0, "detected": 1, "x": 0.5, "y": 0.5, "visibility": 0.9},
        {"frame": 1, "kp_id": 1, "detected": 1, "x": None, "y": None, "visibility": 0.2},
    ]
    csv_path = tmp_path / "clip_stable.csv"
    pd.DataFrame(rows).to_csv(csv_path, index=False)

    frames = load_keypoints(csv_path)
    assert list(frames) == [1]
    assert list(frames[1]) == [0]

    image = np.zeros((100, 100, 3), dtype=np.uint8)
    draw(image, frames[1])   # used to crash: "cannot convert float NaN to integer"
    assert image.any()
