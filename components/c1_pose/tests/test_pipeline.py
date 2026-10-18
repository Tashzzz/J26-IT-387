"""Tests for pipeline.py: bad inputs give a PipelineError with a plain message.

Only made-up inputs are used (a text file, black videos made with OpenCV);
no bowler videos.
"""

import cv2
import numpy as np
import pytest

import pipeline
from pipeline import PipelineError, run_pipeline


def black_video(path, seconds, fps=30, size=(320, 240)):
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, size)
    frame = np.zeros((size[1], size[0], 3), dtype=np.uint8)
    for _ in range(int(seconds * fps)):
        writer.write(frame)
    writer.release()
    return path


needs_model = pytest.mark.skipif(not (pipeline.MODELS_DIR / "pose_landmarker_lite.task").exists(),
                                 reason="lite model not downloaded (scripts/download_models.py)")


def test_text_file_renamed_to_mp4(tmp_path):
    fake = tmp_path / "not_a_video.mp4"
    fake.write_text("this is just text, not a video")
    with pytest.raises(PipelineError, match="could not be opened as a video"):
        run_pipeline(fake, tmp_path / "out", bowling_arm="right")


@needs_model
def test_clip_shorter_than_one_second(tmp_path):
    video = black_video(tmp_path / "short.mp4", 0.5)
    with pytest.raises(PipelineError, match="too short"):
        run_pipeline(video, tmp_path / "out", bowling_arm="right")


@needs_model
def test_no_person_in_black_video(tmp_path):
    video = black_video(tmp_path / "black.mp4", 2.0)
    with pytest.raises(PipelineError, match="No person was found"):
        run_pipeline(video, tmp_path / "out", bowling_arm="right")


@pytest.mark.parametrize("arm", [None, "", "both", "up", 1])
def test_bad_bowling_arm(tmp_path, arm):
    video = black_video(tmp_path / "black.mp4", 2.0)
    with pytest.raises(PipelineError, match="bowling arm: left or right"):
        run_pipeline(video, tmp_path / "out", bowling_arm=arm)


def test_low_detection_rate_message():
    with pytest.raises(PipelineError, match="film closer or with better light"):
        pipeline.check_detection({"frames_detected": 10, "detection_rate": 0.1})
    pipeline.check_detection({"frames_detected": 60, "detection_rate": 0.2})   # 20 % is enough


def test_unknown_model(tmp_path):
    video = black_video(tmp_path / "black.mp4", 2.0)
    with pytest.raises(PipelineError, match="Unknown model"):
        run_pipeline(video, tmp_path / "out", model="huge", bowling_arm="left")
