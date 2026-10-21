"""CricShield Component 1 - Step 1: keypoint extraction.

Reads a bowling video, runs MediaPipe PoseLandmarker (Tasks API, VIDEO mode)
on every frame, and saves the 33 keypoints per frame to a CSV file.

Outputs (in data/processed/ by default):
  <clip>_keypoints.csv   one row per frame per keypoint (long format)
  <clip>_summary.json    frame count, fps, detection rate, processing time,
                         mean visibility per keypoint

Usage (run from components/c1_pose, with the venv active):
  python src/c1_pose/extract.py ../../data/raw/B01_D01_side_10m.MOV
  python src/c1_pose/extract.py ../../data/raw                   # every video in a folder
  python src/c1_pose/extract.py ../../data/raw/B01_D01_side_10m.MOV --model models/pose_landmarker_full.task
"""

import argparse
import csv
import json
import math
import time
from pathlib import Path

import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

from keypoints import KEYPOINT_NAMES

VIDEO_EXTENSIONS = {".mov", ".mp4", ".avi", ".mkv", ".m4v"}
DEFAULT_MODEL = "models/pose_landmarker_lite.task"
DEFAULT_OUT = "../../data/processed"
LOW_VISIBILITY = 0.5  # below this, a keypoint is counted as "poorly tracked"

CSV_COLUMNS = [
    "clip_id", "frame", "time_ms", "detected", "kp_id", "kp_name",
    "x", "y", "z", "visibility", "presence",  # normalised image coords (0-1)
    "wx", "wy", "wz",                          # world coords in metres, hip-centred
]


def create_landmarker(model_path):
    """Build a PoseLandmarker in VIDEO mode (uses tracking between frames)."""
    options = vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,  # only the bowler; see README note about other people in frame
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return vision.PoseLandmarker.create_from_options(options)


def extract_video(video_path, model_path, out_dir, frame_step=1, transform=None):
    """Extract keypoints from one video. Returns the summary dict.

    frame_step and transform are for the robustness study (robustness.py):
    frame_step=2 keeps every 2nd frame (60 fps -> 30 fps), and transform(frame_bgr)
    changes each kept frame (e.g. darker, smaller) before MediaPipe sees it.
    The changed frames are never written to a video, so no extra compression is added.
    """
    video_path = Path(video_path)
    clip_id = video_path.stem
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0 or math.isnan(fps):
        print(f"  WARNING: fps not found in {video_path.name}, assuming 30")
        fps = 30.0
    fps /= frame_step
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    csv_path = out_dir / f"{clip_id}_keypoints.csv"
    n_frames = 0
    n_detected = 0
    vis_sum = [0.0] * 33
    low_vis_count = [0] * 33
    start = time.perf_counter()

    with create_landmarker(model_path) as landmarker, \
            open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(CSV_COLUMNS)

        frame_idx = 0
        source_idx = -1
        while True:
            ok, frame_bgr = cap.read()
            if not ok:
                break
            source_idx += 1
            if source_idx % frame_step:
                continue
            if transform is not None:
                frame_bgr = transform(frame_bgr)
                height, width = frame_bgr.shape[:2]   # normalise.py needs the size MediaPipe saw

            # Timestamps must strictly increase in VIDEO mode.
            time_ms = int(round(frame_idx * 1000.0 / fps))
            rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect_for_video(mp_image, time_ms)

            if result.pose_landmarks:
                n_detected += 1
                lms = result.pose_landmarks[0]
                wlms = result.pose_world_landmarks[0] if result.pose_world_landmarks else None
                for kp_id, lm in enumerate(lms):
                    vis = lm.visibility if lm.visibility is not None else float("nan")
                    pres = lm.presence if lm.presence is not None else float("nan")
                    w = wlms[kp_id] if wlms else None
                    writer.writerow([
                        clip_id, frame_idx, time_ms, 1, kp_id, KEYPOINT_NAMES[kp_id],
                        f"{lm.x:.6f}", f"{lm.y:.6f}", f"{lm.z:.6f}",
                        f"{vis:.4f}", f"{pres:.4f}",
                        f"{w.x:.6f}" if w else "", f"{w.y:.6f}" if w else "",
                        f"{w.z:.6f}" if w else "",
                    ])
                    vis_sum[kp_id] += vis if not math.isnan(vis) else 0.0
                    if math.isnan(vis) or vis < LOW_VISIBILITY:
                        low_vis_count[kp_id] += 1
            else:
                # Keep a row for every frame so missing frames stay visible
                # (gap filling in a later step needs to know where the gaps are).
                for kp_id in range(33):
                    writer.writerow([clip_id, frame_idx, time_ms, 0, kp_id,
                                     KEYPOINT_NAMES[kp_id]] + [""] * 8)

            frame_idx += 1
            n_frames += 1
            if n_frames % 100 == 0:
                print(f"  {n_frames} frames processed...")

    cap.release()
    elapsed = time.perf_counter() - start

    summary = {
        "clip_id": clip_id,
        "video": str(video_path),
        "model": Path(model_path).name,
        "fps": round(fps, 3),
        "width": width,
        "height": height,
        "frames": n_frames,
        "frames_detected": n_detected,
        "detection_rate": round(n_detected / n_frames, 4) if n_frames else 0.0,
        "processing_seconds": round(elapsed, 2),
        "processing_fps": round(n_frames / elapsed, 2) if elapsed > 0 else None,
        "per_keypoint": {
            KEYPOINT_NAMES[k]: {
                "mean_visibility": round(vis_sum[k] / n_detected, 4) if n_detected else None,
                "low_visibility_frames": low_vis_count[k],
            }
            for k in range(33)
        },
        "csv": str(csv_path),
    }
    with open(out_dir / f"{clip_id}_summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    return summary


def find_videos(path):
    path = Path(path)
    if path.is_dir():
        return sorted(p for p in path.iterdir() if p.suffix.lower() in VIDEO_EXTENSIONS)
    return [path]


def main():
    parser = argparse.ArgumentParser(description="Extract MediaPipe keypoints from bowling videos.")
    parser.add_argument("input", help="a video file or a folder of videos")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"model file (default {DEFAULT_MODEL})")
    parser.add_argument("--out", default=DEFAULT_OUT, help=f"output folder (default {DEFAULT_OUT})")
    args = parser.parse_args()

    if not Path(args.model).exists():
        raise SystemExit(f"Model file not found: {args.model}")

    videos = find_videos(args.input)
    if not videos:
        raise SystemExit(f"No videos found in {args.input}")

    for video in videos:
        print(f"Processing {video.name} ...")
        s = extract_video(video, args.model, args.out)
        print(f"  frames: {s['frames']}  detected: {s['frames_detected']} "
              f"({s['detection_rate']:.1%})  fps: {s['fps']}  "
              f"time: {s['processing_seconds']}s ({s['processing_fps']} frames/s)")
        worst = sorted(s["per_keypoint"].items(),
                       key=lambda kv: kv[1]["mean_visibility"] or 0)[:5]
        print("  lowest-visibility keypoints: " +
              ", ".join(f"{n} ({v['mean_visibility']})" for n, v in worst))
        print(f"  saved: {s['csv']}")


if __name__ == "__main__":
    main()
