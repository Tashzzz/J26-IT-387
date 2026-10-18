"""Tests for compare_models.py, using small made-up summary files."""

import json

import pandas as pd
import pytest

from compare_models import compare_models, recommend
from keypoints import KEYPOINT_NAMES


def write_summary(folder, clip_id, detection_rate, fps, arm_vis=0.5, other_vis=0.9, side="right"):
    folder.mkdir(parents=True, exist_ok=True)
    arm = {f"{side}_{j}" for j in ("shoulder", "elbow", "wrist")}
    per_kp = {n: {"mean_visibility": arm_vis if n in arm else other_vis, "low_visibility_frames": 0}
              for n in KEYPOINT_NAMES}
    with open(folder / f"{clip_id}_summary.json", "w") as f:
        json.dump({"clip_id": clip_id, "video": "secret/path/rumeth3.MOV", "detection_rate": detection_rate,
                   "processing_fps": fps, "per_keypoint": per_kp}, f)


def write_metadata(path):
    pd.DataFrame([
        {"original_file": "rumeth3.MOV", "clip_id": "B01_D01_side_5m", "notes": ""},
        {"original_file": "vishmi7.mp4", "clip_id": "B02_D01_side_5m", "notes": "left-arm"},
    ]).to_csv(path, index=False)
    return path


@pytest.fixture
def setup(tmp_path):
    p = tmp_path / "processed"
    # B01: right arm via --bowling-arm; B02: left arm from notes
    for model, det, fps in [("lite", 0.60, 30.0), ("full", 0.62, 15.0), ("heavy", 0.63, 5.0)]:
        write_summary(p / model, "B01_D01_side_5m", det, fps, arm_vis=0.5)
        write_summary(p / model, "B02_D01_side_5m", det, fps, arm_vis=0.7, side="left")
    write_summary(p / "lite", "B03_D01_side_5m", 0.9, 30.0)      # only lite -> skipped
    return p, write_metadata(tmp_path / "metadata.csv"), tmp_path / "out"


def test_writes_csv_png_md_for_common_clips(setup):
    processed, meta, out = setup
    df, means, choice = compare_models(processed, meta, out, fallback_arm="right")
    assert sorted(df["clip_id"].unique()) == ["B01_D01_side_5m", "B02_D01_side_5m"]
    assert len(df) == 6
    csv = pd.read_csv(out / "model_comparison.csv")
    assert list(csv.columns) == ["clip_id", "model", "detection_rate", "processing_fps",
                                 "arm_visibility", "all_visibility"]
    b02 = csv[(csv.clip_id == "B02_D01_side_5m") & (csv.model == "lite")].iloc[0]
    assert b02.arm_visibility == pytest.approx(0.7)                 # left arm, read from notes
    assert b02.all_visibility == pytest.approx((3 * 0.7 + 30 * 0.9) / 33, abs=1e-4)
    assert (out / "model_comparison.png").stat().st_size > 0
    assert means.at["lite", "processing_fps"] == 30.0
    assert choice == "lite"                                         # slower models only +3 points


def test_outputs_have_no_paths_or_names(setup):
    processed, meta, out = setup
    compare_models(processed, meta, out, fallback_arm="right")
    for name in ("model_comparison.csv", "model_comparison.md"):
        text = (out / name).read_text()
        for secret in ("rumeth", "vishmi", "secret", ".MOV", "processed/", "processed\\"):
            assert secret not in text


def test_unknown_arm_left_blank(setup):
    processed, meta, out = setup
    df, means, _ = compare_models(processed, meta, out)             # no fallback for B01
    assert df[df.clip_id == "B01_D01_side_5m"]["arm_visibility"].isna().all()
    assert means.at["lite", "arm_clips"] == 1
    assert "over 1 clips with a known bowling arm" in (out / "model_comparison.md").read_text()


def test_recommend_picks_slower_model_when_clearly_better():
    means = pd.DataFrame({"detection_rate": [0.50, 0.60, 0.61], "processing_fps": [30, 15, 5],
                          "arm_visibility": [0.6, 0.6, 0.6]}, index=["lite", "full", "heavy"])
    assert recommend(means) == "full"


def test_no_common_clips_is_an_error(tmp_path):
    write_summary(tmp_path / "p" / "lite", "B01_D01_side_5m", 0.5, 10)
    with pytest.raises(ValueError, match="no clip"):
        compare_models(tmp_path / "p", write_metadata(tmp_path / "m.csv"), tmp_path / "out")
