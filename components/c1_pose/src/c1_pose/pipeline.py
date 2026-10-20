"""CricShield Component 1 - the whole C1 pipeline for one video.

extract -> stabilise -> normalise -> overlay -> export, by calling the functions
of the step scripts directly (no subprocesses), so the FastAPI endpoint can use it.

Problems the user can fix (not a video, too short, nobody found, bowler not
visible enough, bowling arm not given) raise PipelineError with a plain-English
message that can be shown in the app as it is.

Writes into out_dir:
  <clip>_keypoints.csv, <clip>_summary.json      extract.py
  <clip>_stable.csv, <clip>_stable_report.json   stabilise.py
  <clip>_norm.csv, <clip>_norm_info.json         normalise.py
  <clip>_overlay.mp4                             overlay.py
  <clip>.json                                    export.py (C1 -> C2 contract, with reliability
                                                 tags for the camera angle + distance in conditions)

Usage (run from components/c1_pose):
  python src/c1_pose/pipeline.py ../../data/raw/B03_D02_side_4m.mp4 --out out --bowling-arm left
"""

import argparse
import math
from pathlib import Path

import cv2

from export import export_from_row
from extract import extract_video
from normalise import normalise
from overlay import make_overlay
from stabilise import stabilise

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"
MODELS = ("lite", "full", "heavy")
MIN_DURATION_S = 1.0
MIN_DETECTION_RATE = 0.20


class PipelineError(Exception):
    """A problem with the user's input, with a message that can be shown to them."""


def model_path(model):
    """"lite" / "full" / "heavy" -> models/pose_landmarker_<model>.task."""
    if model not in MODELS:
        raise PipelineError(f"Unknown model '{model}'. Choose one of: {', '.join(MODELS)}.")
    path = MODELS_DIR / f"pose_landmarker_{model}.task"
    if not path.exists():
        raise PipelineError(f"The {model} pose model is not installed on the server "
                            "(run scripts/download_models.py).")
    return path


def check_bowling_arm(bowling_arm):
    arm = (bowling_arm or "").strip().lower() if isinstance(bowling_arm, str) else ""
    if arm not in ("left", "right"):
        raise PipelineError("Please choose the bowling arm: left or right.")
    return arm


def check_video(video_path):
    """Open the video with OpenCV and check it is at least MIN_DURATION_S long."""
    video_path = Path(video_path)
    if not video_path.is_file():
        raise PipelineError("The video file was not found. Please upload it again.")
    cap = cv2.VideoCapture(str(video_path))
    try:
        ok, _ = cap.read() if cap.isOpened() else (False, None)
        if not ok:
            raise PipelineError("This file could not be opened as a video. "
                                "Please upload an MP4 or MOV video.")
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    finally:
        cap.release()
    if fps and fps > 0 and not math.isnan(fps) and frames and frames > 0:
        check_duration(frames / fps)


def check_duration(seconds):
    if seconds < MIN_DURATION_S:
        raise PipelineError(f"The clip is too short ({seconds:.1f} s). Please upload at least "
                            f"{MIN_DURATION_S:.0f} second of the bowling action.")


def check_detection(summary):
    if summary["frames_detected"] == 0:
        raise PipelineError("No person was found in the video. Make sure the bowler is in the frame.")
    if summary["detection_rate"] < MIN_DETECTION_RATE:
        raise PipelineError(f"The bowler was found in only {summary['detection_rate']:.0%} of the frames: "
                            "bowler not visible enough – film closer or with better light.")


def run_pipeline(video_path, out_dir, model="lite", bowling_arm=None, conditions=None):
    """Run all C1 steps on one video. Returns clip_id, json_path, overlay_path,
    detection_rate, processing_seconds. Raises PipelineError for problems the user can fix.

    conditions: optional {"distance_m", "angle", "lighting", "device"}; values outside
    the contract are left out of the JSON, as in export.py.
    """
    arm = check_bowling_arm(bowling_arm)
    weights = model_path(model)
    check_video(video_path)

    video_path, out_dir = Path(video_path), Path(out_dir)
    clip_id = video_path.stem

    summary = extract_video(video_path, weights, out_dir)
    if summary["fps"]:
        check_duration(summary["frames"] / summary["fps"])   # frame count in the header can be wrong
    check_detection(summary)

    keypoints_csv = out_dir / f"{clip_id}_keypoints.csv"
    stabilise(keypoints_csv, out_dir=out_dir, fps=summary["fps"])
    stable_csv = out_dir / f"{clip_id}_stable.csv"
    normalise(stable_csv, summary["width"], summary["height"])

    overlay_path = out_dir / f"{clip_id}_overlay.mp4"
    make_overlay(video_path, keypoints_csv, overlay_path)

    row = dict(conditions or {})
    row.pop("bowling_arm", None)        # the bowling_arm argument is the one that counts
    json_path, _ = export_from_row(clip_id, out_dir, row, out_dir, bowling_arm=arm)

    return {
        "clip_id": clip_id,
        "json_path": str(json_path),
        "overlay_path": str(overlay_path),
        "detection_rate": summary["detection_rate"],
        "processing_seconds": summary["processing_seconds"],
    }


def main():
    parser = argparse.ArgumentParser(description="Run the whole C1 pipeline on one video.")
    parser.add_argument("video", help="video file")
    parser.add_argument("--out", required=True, help="output folder")
    parser.add_argument("--model", default="lite", choices=MODELS)
    parser.add_argument("--bowling-arm", required=True, choices=["left", "right"])
    parser.add_argument("--angle", help="front, rear, semi_side or side")
    parser.add_argument("--distance-m", help="camera distance in metres")
    parser.add_argument("--lighting", help="daylight, overcast or indoor")
    parser.add_argument("--device", help="phone model")
    args = parser.parse_args()

    conditions = {k: v for k, v in {"angle": args.angle, "distance_m": args.distance_m,
                                    "lighting": args.lighting, "device": args.device}.items() if v}
    try:
        result = run_pipeline(args.video, args.out, args.model, args.bowling_arm, conditions)
    except PipelineError as e:
        raise SystemExit(f"Error: {e}")
    for key, value in result.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
