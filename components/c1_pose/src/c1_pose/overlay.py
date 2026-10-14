"""CricShield Component 1 - skeleton overlay video.

Draws the extracted keypoints from <clip>_keypoints.csv back onto the original
video and saves a new MP4. Keypoints are coloured by visibility:
  green  = well tracked (visibility >= 0.5)
  red    = poorly tracked (visibility < 0.5)
Frames with no pose detected are marked "NO POSE".

Usage (run from components/c1_pose):
  python src/c1_pose/overlay.py ../../data/raw/B01_D01_side_10m.MOV
  python src/c1_pose/overlay.py ../../data/raw/B01_D01_side_10m.MOV --show
"""

import argparse
from pathlib import Path

import cv2
import pandas as pd

from keypoints import POSE_CONNECTIONS

GOOD = (0, 200, 0)    # BGR green
BAD = (0, 0, 255)     # BGR red
LINE = (255, 200, 0)  # BGR light blue
VIS_THRESHOLD = 0.5


def load_keypoints(csv_path):
    """Return {frame: {kp_id: (x, y, visibility)}} for detected frames."""
    df = pd.read_csv(csv_path)
    df = df[df["detected"] == 1]
    frames = {}
    for row in df.itertuples(index=False):
        frames.setdefault(int(row.frame), {})[int(row.kp_id)] = (
            float(row.x), float(row.y), float(row.visibility))
    return frames


def draw(frame, kps):
    h, w = frame.shape[:2]
    pts = {k: (int(x * w), int(y * h), v) for k, (x, y, v) in kps.items()}
    thickness = max(2, w // 400)
    radius = max(3, w // 250)
    for a, b in POSE_CONNECTIONS:
        if a in pts and b in pts:
            cv2.line(frame, pts[a][:2], pts[b][:2], LINE, thickness)
    for k, (x, y, v) in pts.items():
        cv2.circle(frame, (x, y), radius, GOOD if v >= VIS_THRESHOLD else BAD, -1)


def make_overlay(video_path, csv_path, out_path, show=False):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    frames = load_keypoints(csv_path)
    used_window = show
    writer = None
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if writer is None:
            h, w = frame.shape[:2]
            writer = cv2.VideoWriter(str(out_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))

        if idx in frames:
            draw(frame, frames[idx])
            label = f"frame {idx}"
        else:
            label = f"frame {idx}  NO POSE"
        cv2.putText(frame, label, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)

        writer.write(frame)
        if show:
            cv2.imshow("CricShield overlay (q to quit)", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                show = False
                cv2.destroyAllWindows()
        idx += 1

    cap.release()
    if writer is not None:
        writer.release()
    if used_window:
        cv2.destroyAllWindows()
    return idx


def main():
    parser = argparse.ArgumentParser(description="Draw extracted keypoints onto a bowling video.")
    parser.add_argument("video", help="original video file")
    parser.add_argument("--csv", help="keypoints CSV (default ../../data/processed/<clip>_keypoints.csv)")
    parser.add_argument("--out", help="output MP4 (default ../../data/processed/<clip>_overlay.mp4)")
    parser.add_argument("--show", action="store_true", help="also show the video while writing")
    args = parser.parse_args()

    video = Path(args.video)
    csv_path = Path(args.csv) if args.csv else Path("../../data/processed") / f"{video.stem}_keypoints.csv"
    out_path = Path(args.out) if args.out else Path("../../data/processed") / f"{video.stem}_overlay.mp4"
    if not csv_path.exists():
        raise SystemExit(f"Keypoints CSV not found: {csv_path}  (run extract.py first)")

    n = make_overlay(video, csv_path, out_path, args.show)
    print(f"Wrote {n} frames to {out_path}")


if __name__ == "__main__":
    main()
