"""Tests for the C1 endpoints in app/routers/pose.py.

Only made-up inputs are used (text files, a black video made with OpenCV);
no bowler videos. Run from the backend folder:  python -m pytest tests
"""

import sys
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402
from app.routers import pose  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def runs_in_tmp(tmp_path, monkeypatch):
    """Keep test runs out of data/c1_runs."""
    monkeypatch.setattr(pose, "RUNS_DIR", tmp_path / "runs")


def upload(name, content, arm="right"):
    return client.post("/pose/process", files={"video": (name, content, "video/mp4")},
                       data={"bowling_arm": arm})


def test_ping():
    assert client.get("/pose/ping").json() == {"component": "C1", "status": "ok"}


def test_wrong_file_type_is_rejected():
    r = upload("notes.txt", b"hello")
    assert r.status_code == 422
    assert r.json()["detail"] == "Please upload an MP4 or MOV video."


def test_text_file_renamed_to_mp4_gives_plain_message():
    r = upload("fake.mp4", b"this is just text, not a video")
    assert r.status_code == 422
    assert "could not be opened as a video" in r.json()["detail"]


def test_bowling_arm_must_be_left_or_right():
    r = upload("fake.mp4", b"x", arm="up")
    assert r.status_code == 422
    assert "left or right" in r.json()["detail"]


def test_failed_run_leaves_no_folder(tmp_path):
    upload("fake.mp4", b"not a video")
    assert not any((tmp_path / "runs").glob("*"))


@pytest.mark.skipif(not (pose.C1_DIR / "models" / "pose_landmarker_lite.task").exists(),
                    reason="lite model not downloaded")
def test_empty_video_says_no_person(tmp_path):
    path = tmp_path / "black.mp4"
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 30, (320, 240))
    for _ in range(45):
        writer.write(np.zeros((240, 320, 3), dtype=np.uint8))
    writer.release()
    r = upload("black.mp4", path.read_bytes())
    assert r.status_code == 422
    assert "No person was found" in r.json()["detail"]


@pytest.mark.parametrize("run_id", ["zzz", "0123456789ab", "..%2F..%2Fetc"])
def test_unknown_or_unsafe_run_id_is_404(run_id):
    assert client.get(f"/pose/runs/{run_id}/overlay").status_code == 404
    assert client.get(f"/pose/runs/{run_id}/keypoints").status_code == 404


def test_setup_name_is_split():
    assert pose._setup("B01_semi_side_5m") == {"bowler": "B01", "angle": "semi_side", "distance_m": 5.0}
    assert pose._setup("odd") == {"bowler": None, "angle": None, "distance_m": None}


def test_clip_id_is_safe():
    assert pose._clip_id("My clip (1).MOV") == "My_clip_1"
    assert pose._clip_id("../../evil.mp4") == "evil"
    assert pose._clip_id(None) == "upload"


def test_reliability_groups_keypoints_by_region():
    r = client.get("/pose/reliability")
    assert r.status_code == 200
    body = r.json()
    assert body["gate"] == 0.75
    for setup in body["setups"]:
        assert [g["region"] for g in setup["regions"]] == pose.REGION_ORDER
        assert sum(g["total"] for g in setup["regions"]) == setup["total"]
        assert sum(g["usable"] for g in setup["regions"]) == setup["usable"]
