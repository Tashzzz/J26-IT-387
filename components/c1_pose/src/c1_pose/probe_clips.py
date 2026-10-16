"""CricShield Component 1 - Step 0a: build the clip metadata sheet.

Opens every video in a folder with OpenCV, measures what the computer can
measure on its own (frame rate, frame count, length, resolution, file size)
and writes one row per clip into metadata.csv, using the same columns as
data/metadata_template.csv plus the measured ones.

The columns only a person can fill in (bowler_id, delivery_no, angle,
distance_m, lighting, clip_id, use, notes) are left empty the first time.
If metadata.csv already exists, those hand-filled values are KEPT and only the
measured columns are refreshed, so the script is safe to run again after new
clips are added.

metadata.csv may link real file names to bowlers, so it goes in data/, which
git ignores. Never commit it.

Usage (run from components/c1_pose, with the venv active):
  python src/c1_pose/probe_clips.py "D:/4th year 1st semester/rp/videos"
  python src/c1_pose/probe_clips.py ../../videos --out ../../data/metadata.csv
"""

import argparse
import csv
from pathlib import Path

import cv2

VIDEO_EXTENSIONS = {".mov", ".mp4", ".avi", ".mkv", ".m4v"}
DEFAULT_OUT = "../../data/metadata.csv"

# Filled in by a person (same order as data/metadata_template.csv).
MANUAL_COLUMNS = [
    "original_file", "clip_id", "bowler_id", "delivery_no", "angle",
    "distance_m", "lighting", "device", "fps", "use", "notes",
]
# Measured by this script.
MEASURED_COLUMNS = ["duration_s", "frames", "width", "height", "rotation", "size_mb", "flags"]
COLUMNS = MANUAL_COLUMNS + MEASURED_COLUMNS

MIN_FPS_FOR_BOWLING = 50   # below this the bowling arm blurs near release
MIN_DURATION_S = 1.0       # shorter than this is unlikely to hold a full delivery


def probe(path):
    """Return the measured properties of one video, or None if OpenCV cannot open it."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return None

    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    # iPhones store portrait video as landscape + a rotation tag. Newer OpenCV
    # versions expose that tag; older ones return 0.
    rotation = int(cap.get(getattr(cv2, "CAP_PROP_ORIENTATION_META", -1)) or 0)
    cap.release()

    duration = frames / fps if fps > 0 else 0.0
    flags = []
    if fps < MIN_FPS_FOR_BOWLING:
        flags.append(f"low fps (<{MIN_FPS_FOR_BOWLING})")
    if duration < MIN_DURATION_S:
        flags.append("very short")

    return {
        "fps": f"{fps:.2f}",
        "duration_s": f"{duration:.2f}",
        "frames": frames,
        "width": width,
        "height": height,
        "rotation": rotation,
        "size_mb": f"{path.stat().st_size / 1_000_000:.1f}",
        "flags": "; ".join(flags),
    }


def guess_device(path):
    """iPhone clips keep the IMG_xxxx.MOV name; anything else is unknown."""
    if path.suffix.lower() == ".mov" and path.stem.upper().startswith("IMG_"):
        return "iPhone"
    return ""


def load_existing(out_path):
    """Read an existing metadata.csv into {original_file: row} so hand-filled values survive."""
    if not out_path.exists():
        return {}
    with open(out_path, newline="", encoding="utf-8") as f:
        return {row["original_file"]: row for row in csv.DictReader(f)}


def build_rows(video_dir, existing):
    rows, unreadable, skipped = [], [], []
    for path in sorted(video_dir.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in VIDEO_EXTENSIONS:
            skipped.append(path.name)          # e.g. .HEIC photos
            continue

        measured = probe(path)
        if measured is None:
            unreadable.append(path.name)
            continue

        row = {col: "" for col in COLUMNS}
        row["original_file"] = path.name
        row["device"] = guess_device(path)
        row.update(existing.get(path.name, {}))  # keep what a person already typed
        row.update(measured)                     # always refresh the measured values
        rows.append(row)
    return rows, unreadable, skipped


def main():
    parser = argparse.ArgumentParser(description="Measure every clip and write metadata.csv.")
    parser.add_argument("videos", help="folder with the original videos")
    parser.add_argument("--out", default=DEFAULT_OUT, help=f"output CSV (default {DEFAULT_OUT})")
    args = parser.parse_args()

    video_dir, out_path = Path(args.videos), Path(args.out)
    if not video_dir.is_dir():
        parser.error(f"not a folder: {video_dir}")

    rows, unreadable, skipped = build_rows(video_dir, load_existing(out_path))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    print(f"{'file':<16} {'fps':>7} {'secs':>6} {'size':>11}  flags")
    for r in rows:
        size = f"{r['width']}x{r['height']}"
        print(f"{r['original_file']:<16} {r['fps']:>7} {r['duration_s']:>6} {size:>11}  {r['flags']}")
    print(f"\n{len(rows)} clips written to {out_path}")
    if skipped:
        print("Not videos, skipped: " + ", ".join(skipped))
    if unreadable:
        print("WARNING - OpenCV could not open: " + ", ".join(unreadable))


if __name__ == "__main__":
    main()
