"""Real-clip problems seen in the first C1 handoff (B01, 16 Oct), rebuilt synthetically.

The real files are not in git (ethics), so these tests recreate their problems:
run-up frames with no bowler, upside-down / tiny false detections, and two
detected stretches in one clip.
"""

import numpy as np

from c2_biomech.features import compute_features
from c2_biomech.loader import from_c1_json
from c2_biomech.quality import plausible_frames
from c2_biomech.synthetic import make_delivery


def _pad_with(data, before, after, fill):
    frames = data["frames"]
    data["frames"] = ([fill(i) for i in range(before)] + frames
                      + [fill(i) for i in range(after)])
    return data


def test_empty_run_up_frames_are_skipped():
    data = _pad_with(make_delivery(), 40, 10, lambda i: {"t": 0, "landmarks": [None] * 33})
    row, _ = compute_features(from_c1_json(data))
    assert row["events"]["release_frame"] == 42 + 40
    assert row["quality"]["frames_kept"] == 60


def test_upside_down_false_detection_is_rejected():
    """Shoulders below the hips (seen in B01 front clips during the run-up)."""
    good = make_delivery()["frames"][0]["landmarks"]
    flipped = [[p[0], -p[1], p[2], p[3]] for p in good]
    data = _pad_with(make_delivery(), 30, 0, lambda i: {"t": 0, "landmarks": flipped})
    P = from_c1_json(data).points
    keep = plausible_frames(P)
    assert not keep[:30].any() and keep[30:].all()


def test_tiny_static_detection_is_rejected():
    """A small motionless 'person' far away (seen in B01 side clip, frames 264-394)."""
    good = make_delivery()["frames"][0]["landmarks"]
    tiny = [[0.1 * p[0], 0.1 * p[1], 0.1 * p[2], p[3]] for p in good]
    data = _pad_with(make_delivery(), 0, 40, lambda i: {"t": 0, "landmarks": tiny})
    keep = plausible_frames(from_c1_json(data).points)
    assert keep[:60].all() and not keep[60:].any()


def test_release_picks_strongest_arm_peak_and_reports_alternative():
    a, b = make_delivery(), make_delivery()
    gap = [{"t": 0, "landmarks": [None] * 33}] * 20
    a["frames"] = a["frames"] + gap + b["frames"]
    row, _ = compute_features(from_c1_json(a))
    cands = row["delivery"]["release_candidates"]
    assert len(cands) == 2
    assert row["events"]["release_frame"] in (42, 42 + 80)
    assert any("two similar arm peaks" in w for w in row["warnings"])


def test_30fps_clip_filters_below_nyquist():
    data = make_delivery(fps=30.0, n_frames=30, bfc=8, ffc=15, release=21)
    row, _ = compute_features(from_c1_json(data), cutoff=20.0)  # proposal's 20 Hz
    assert row["filter"]["cutoff_hz"] < 15.0
    assert any("too high" in w for w in row["warnings"])
    assert np.isfinite(row["features"]["trunk_lateral_flexion_deg"]["value"])


def test_arm_lifted_after_follow_through_is_not_taken_as_release():
    """Seen in B02_D01, B02_D02, B03_D04: the arm goes up again after the delivery, higher than at release."""
    import copy
    data = make_delivery()
    late = copy.deepcopy(data["frames"][42])
    late["landmarks"][16][1] -= 0.4  # right wrist even higher than at release
    for i in range(15):
        f = copy.deepcopy(late)
        data["frames"].append(f)
    row, _ = compute_features(from_c1_json(data))
    assert row["events"]["release_frame"] == 42
    assert any("two similar arm peaks" in w for w in row["warnings"])
