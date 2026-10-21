"""
Step 1: Video -> landmark CSV (MediaPipe Pose Landmarker, Tasks API).

If Component 1 (Nethmi) already gives you landmark files, skip this and just
convert hers to the same column format (see common.py).

Download the model once (about 30 MB) into models/:
    https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task

Usage:
    python extract_landmarks.py --videos data/videos --out data/landmarks \
        --model models/pose_landmarker_heavy.task
"""

import argparse
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import pandas as pd

VIDEO_EXT = {".mp4", ".mov", ".avi", ".mkv", ".m4v"}


def extract(video_path, model_path):
    BaseOptions = mp.tasks.BaseOptions
    PoseLandmarker = mp.tasks.vision.PoseLandmarker
    Options = mp.tasks.vision.PoseLandmarkerOptions
    opts = Options(base_options=BaseOptions(model_asset_path=str(model_path)),
                   running_mode=mp.tasks.vision.RunningMode.VIDEO, num_poses=1)

    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    rows, i = [], 0
    with PoseLandmarker.create_from_options(opts) as lm:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            res = lm.detect_for_video(img, int(i * 1000 / fps))
            row = {"frame": i, "time": i / fps}
            pts = res.pose_landmarks[0] if res.pose_landmarks else None
            for k in range(33):
                p = pts[k] if pts else None
                row[f"lm{k}_x"] = p.x if p else np.nan
                row[f"lm{k}_y"] = p.y if p else np.nan
                row[f"lm{k}_z"] = p.z if p else np.nan
                row[f"lm{k}_v"] = p.visibility if p else 0.0
            rows.append(row)
            i += 1
    cap.release()
    return pd.DataFrame(rows), fps


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", required=True)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for v in sorted(Path(a.videos).iterdir()):
        if v.suffix.lower() not in VIDEO_EXT:
            continue
        df, fps = extract(v, a.model)
        df.to_csv(out / f"{v.stem}.csv", index=False)
        lost = df["lm0_x"].isna().mean() * 100
        print(f"{v.name}: {len(df)} frames @ {fps:.1f} fps, person not found in {lost:.0f}% of frames")
