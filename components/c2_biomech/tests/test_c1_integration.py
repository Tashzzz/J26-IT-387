"""Integration test C1 -> C2: C1's real stabilise -> normalise -> export chain
produces a JSON that C2 loads and processes.

Uses C1's own test helpers (a small made-up raw keypoints CSV), so if either
side changes the handoff format, this test fails on the dev branch.
"""

import sys
from pathlib import Path

import pytest

C1 = Path(__file__).resolve().parents[2] / "c1_pose"
pytest.importorskip("scipy")
if not (C1 / "src" / "c1_pose" / "export.py").exists():
    pytest.skip("C1 export.py not on this branch", allow_module_level=True)
sys.path[:0] = [str(C1 / "src" / "c1_pose"), str(C1 / "tests")]

from export import export_clip  # noqa: E402
from normalise import normalise  # noqa: E402
from stabilise import stabilise  # noqa: E402
from test_export import CLIP, write_metadata, write_raw_csv  # noqa: E402

from c2_biomech.features import compute_features  # noqa: E402
from c2_biomech.loader import load_delivery  # noqa: E402


def test_c1_export_runs_through_c2(tmp_path):
    raw = write_raw_csv(tmp_path)
    stabilise(raw, out_dir=tmp_path, fps=30.0)
    normalise(tmp_path / f"{CLIP}_stable.csv", 1920, 1080)
    path, _ = export_clip(CLIP, tmp_path, write_metadata(tmp_path), tmp_path / "handoff")

    d = load_delivery(path)
    assert d.video_id == CLIP and d.fps == 30 and d.bowling_arm == "right"
    assert d.view == "side"
    assert d.prefiltered is False          # C1 sends unsmoothed keypoints; C2 filters

    row, series = compute_features(d)       # 6 frames: too short for a delivery, must not crash
    assert row["video_id"] == CLIP
    assert len(series) == 6
    assert set(row["features"]) >= {"shoulder_counter_rotation_deg", "trunk_lateral_flexion_deg"}
