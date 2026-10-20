"""Tests for export.py: the JSON for C2 must match contracts/c1_keypoints.schema.json.

A small made-up raw keypoints CSV is run through the real stabilise -> normalise
-> export chain, so the test also checks that the three steps fit together.
"""

import json
from pathlib import Path

import jsonschema
import pandas as pd
import pytest

from export import export_clip
from keypoints import KEYPOINT_NAMES
from normalise import normalise
from stabilise import stabilise

SCHEMA = Path(__file__).resolve().parents[3] / "contracts" / "c1_keypoints.schema.json"
CLIP = "B09_D01_side_5m"
N_FRAMES = 6


def write_raw_csv(folder):
    """6 frames at 30 fps. Frame 0: no pose. Left wrist (15) hidden in frame 3
    (short gap -> filled). Right wrist (16) never visible (-> null)."""
    rows = []
    for f in range(N_FRAMES):
        for k in range(33):
            detected = f > 0
            x, y, vis = 0.5 + 0.01 * k, 0.4 + 0.01 * k, 0.9
            if k == 23: x, y = 0.48, 0.6            # left hip
            if k == 24: x, y = 0.52, 0.6            # right hip
            if k == 11: x, y = 0.45, 0.4            # left shoulder
            if k == 12: x, y = 0.55, 0.4            # right shoulder
            if k == 15 and f == 3: vis = 0.1
            if k == 16: vis = 0.1
            values = [x, y, 0.0, vis, 0.99, 0.0, 0.0, 0.0] if detected else [None] * 8
            rows.append([CLIP, f, round(f * 1000 / 30), int(detected), k, KEYPOINT_NAMES[k], *values])
    cols = ["clip_id", "frame", "time_ms", "detected", "kp_id", "kp_name",
            "x", "y", "z", "visibility", "presence", "wx", "wy", "wz"]
    path = folder / f"{CLIP}_keypoints.csv"
    pd.DataFrame(rows, columns=cols).to_csv(path, index=False)
    with open(folder / f"{CLIP}_summary.json", "w") as fh:
        json.dump({"fps": 30.0, "width": 1920, "height": 1080, "model": "pose_landmarker_lite.task"}, fh)
    return path


def write_metadata(folder, bowling_arm="right", angle="side"):
    path = folder / "metadata.csv"
    pd.DataFrame([{"original_file": "x.MOV", "clip_id": CLIP, "bowler_id": "B09", "delivery_no": "1",
                   "angle": angle, "distance_m": "5", "lighting": "overcast", "device": "iPhone",
                   "fps": "30", "use": "icc", "notes": "", "bowling_arm": bowling_arm}]).to_csv(path, index=False)
    return path


@pytest.fixture
def processed(tmp_path):
    raw = write_raw_csv(tmp_path)
    stabilise(raw, out_dir=tmp_path, fps=30.0)
    normalise(tmp_path / f"{CLIP}_stable.csv", 1920, 1080)
    return tmp_path


def test_export_matches_contract_schema(processed):
    path, out = export_clip(CLIP, processed, write_metadata(processed), processed / "handoff")
    data = json.loads(path.read_text())
    jsonschema.validate(data, json.loads(SCHEMA.read_text()))   # raises if the format is wrong
    assert data == out
    assert data["normalisation"] == {"origin": "hip_centre", "scale": "shoulder_width", "filter": "none"}
    assert data["conditions"] == {"distance_m": 5, "angle": "side", "lighting": "overcast", "device": "iPhone"}
    assert data["model"] == "pose_landmarker_lite"
    assert data["fps"] == 30


def test_rear_angle_exports_and_validates(processed):
    """Rear camera (ball goes away from the camera) is a contract angle, not dropped."""
    path, out = export_clip(CLIP, processed, write_metadata(processed, angle="rear"), processed / "handoff")
    jsonschema.validate(json.loads(path.read_text()), json.loads(SCHEMA.read_text()))
    assert out["conditions"]["angle"] == "rear"


def test_frames_nulls_and_filled_points(processed):
    _, out = export_clip(CLIP, processed, write_metadata(processed), processed / "handoff")
    frames = out["frames"]
    assert len(frames) == N_FRAMES
    assert frames[1]["t"] == pytest.approx(0.033, abs=1e-3)
    assert all(lm is None for lm in frames[0]["landmarks"])         # no pose detected
    assert all(fr["landmarks"][16] is None for fr in frames)        # never visible
    assert frames[3]["filled"] == [15]                              # interpolated, flagged for C2
    assert frames[1]["landmarks"][23][:2] == [-0.2, 0.0]            # hip centre is the origin


def test_missing_bowling_arm_is_an_error(processed):
    meta = write_metadata(processed, bowling_arm="")
    with pytest.raises(ValueError, match="bowling arm"):
        export_clip(CLIP, processed, meta, processed / "handoff")
    path, out = export_clip(CLIP, processed, meta, processed / "handoff", bowling_arm="left")
    assert out["bowling_arm"] == "left"


def test_refuses_data_smoothed_by_old_stabilise(processed):
    report = processed / f"{CLIP}_stable_report.json"
    data = json.loads(report.read_text())
    data["settings"] = {"cutoff_hz": 8.0, "filter": "butterworth order 2 forward-backward"}
    report.write_text(json.dumps(data))
    with pytest.raises(ValueError, match="smoothed"):
        export_clip(CLIP, processed, write_metadata(processed), processed / "handoff")


def test_clip_missing_from_metadata_is_an_error(processed):
    meta = write_metadata(processed)
    sheet = pd.read_csv(meta)
    sheet["clip_id"] = "B09_D02_side_5m"            # the clip's row was never filled in
    sheet.to_csv(meta, index=False)
    with pytest.raises(ValueError, match="not in"):
        export_clip(CLIP, processed, meta, processed / "handoff")


def test_export_fills_reliability_for_camera_setup(processed):
    """side 5 m -> nearest studied setup side 4 m; keypoints are tagged, not removed."""
    path, out = export_clip(CLIP, processed, write_metadata(processed), processed / "handoff")
    rel = out["reliability"]
    assert rel["setup_matched"] == "side 4 m"
    assert rel["gate"] == 0.75 and rel["source"].startswith("pilot ICC study")
    assert rel["left_knee"]["usable"] in (True, False) and "icc" in rel["left_knee"]
    assert all(len(fr["landmarks"]) == 33 for fr in out["frames"])
    assert json.loads(path.read_text())["reliability"] == rel


def test_export_without_study_for_setup_says_so(processed):
    path, out = export_clip(CLIP, processed, write_metadata(processed, angle="front"), processed / "handoff")
    jsonschema.validate(json.loads(path.read_text()), json.loads(SCHEMA.read_text()))
    assert out["reliability"] == {"setup_matched": None, "note": "no reliability study for this setup yet"}
