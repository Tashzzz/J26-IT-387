"""CricShield Component 1 - Step 4: JSON export for Component 2.

Turns one clip's normalised keypoints into <clip>.json, in the format agreed
with C2 in contracts/c1_keypoints.schema.json.

Reads, for one clip_id:
  <clip>_norm.csv            from normalise.py   (nx, ny, nz per frame and keypoint)
  <clip>_norm_info.json      from normalise.py   (origin and scale used)
  <clip>_stable_report.json  from stabilise.py   (checked: must be unsmoothed)
  <clip>_summary.json        from extract.py     (fps and model, if present)
  metadata.csv               one row per clip    (conditions + bowling arm)

What goes into the JSON:
  frames[].t          seconds from the first frame of the clip
  frames[].landmarks  33 x [nx, ny, nz, visibility] in MediaPipe order, or null
                      when the keypoint is missing (masked and not gap-filled)
  frames[].filled     (only when not empty) keypoint ids whose position was
                      interpolated by stabilise.py rather than measured, so C2
                      can tell measured from filled values. For a filled point
                      with no measured visibility, visibility is written as 0.
  normalisation       origin/scale from normalise.py; filter "none" - C1 does
                      not smooth, C2 applies the Butterworth filter
  window              {} - back-foot contact and release are detected by C2
  reliability         {} - filled in later by the reliability study (reliability.py)

Safety check: if the stable report shows the old filtered stabilise.py was used,
the export stops instead of labelling smoothed data as "none".

Usage (run from components/c1_pose):
  python src/c1_pose/export.py B01_D01_front_5m --processed ../../data/processed/lite \\
      --metadata ../../data/metadata.csv --out ../../data/handoff
  python src/c1_pose/export.py <clip_id> ... --bowling-arm right   # if the sheet has no bowling_arm
"""

import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

ANGLES = {"front", "rear", "semi_side", "side"}
LIGHTING = {"daylight", "overcast", "indoor"}
DECIMALS = 4


def _number(value):
    """'5' -> 5, '5.0' -> 5.0, '' or 'far' -> None."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(f):
        return None
    return int(f) if f.is_integer() else f


def read_metadata_row(metadata_path, clip_id):
    meta = pd.read_csv(metadata_path, dtype=str, encoding="utf-8-sig").fillna("")
    rows = meta[meta["clip_id"] == clip_id]
    if rows.empty:
        raise ValueError(f"{clip_id} is not in {metadata_path} (fill in its clip_id first)")
    if len(rows) > 1:
        raise ValueError(f"{clip_id} appears {len(rows)} times in {metadata_path}")
    return rows.iloc[0].to_dict()


def build_conditions(row):
    """Recording conditions from the metadata row; values outside the contract are left out."""
    conditions = {}
    distance = _number(row.get("distance_m"))
    if distance is not None:
        conditions["distance_m"] = distance
    if row.get("angle") in ANGLES:
        conditions["angle"] = row["angle"]
    if row.get("lighting") in LIGHTING:
        conditions["lighting"] = row["lighting"]
    if row.get("device"):
        conditions["device"] = row["device"]
    return conditions


def check_unsmoothed(stable_report_path):
    """Stop if the keypoints were smoothed by the old stabilise.py."""
    if not stable_report_path.exists():
        raise FileNotFoundError(f"{stable_report_path} not found (run stabilise.py first)")
    with open(stable_report_path) as f:
        settings = json.load(f).get("settings", {})
    if "cutoff_hz" in settings or not str(settings.get("smoothing", "")).startswith("none"):
        raise ValueError(f"{stable_report_path.name} shows smoothed keypoints; re-run the current "
                         "stabilise.py (C1 sends unsmoothed keypoints, filter 'none')")


def build_frames(norm_df):
    """Long-format normalised CSV -> list of {t, landmarks[, filled]}."""
    df = norm_df.sort_values(["frame", "kp_id"])
    n_frames = int(df["frame"].max()) + 1
    xyz = df[["nx", "ny", "nz"]].to_numpy(dtype=float).reshape(n_frames, 33, 3)
    vis = df["visibility"].to_numpy(dtype=float).reshape(n_frames, 33)
    filled = (df["filled"].to_numpy(dtype=float).reshape(n_frames, 33) == 1
              if "filled" in df else np.zeros((n_frames, 33), dtype=bool))
    time_ms = df["time_ms"].to_numpy(dtype=float).reshape(n_frames, 33)[:, 0]

    frames = []
    for f in range(n_frames):
        landmarks = []
        for k in range(33):
            if np.isnan(xyz[f, k]).any():
                landmarks.append(None)
            else:
                v = 0.0 if np.isnan(vis[f, k]) else vis[f, k]
                landmarks.append([round(float(c), DECIMALS) for c in (*xyz[f, k], v)])
        frame = {"t": round(float(time_ms[f]) / 1000.0, 4), "landmarks": landmarks}
        filled_ids = [int(k) for k in np.flatnonzero(filled[f])]
        if filled_ids:
            frame["filled"] = filled_ids
        frames.append(frame)
    return frames


def export_clip(clip_id, processed_dir, metadata_path, out_dir, bowling_arm=None):
    processed_dir, out_dir = Path(processed_dir), Path(out_dir)
    norm_csv = processed_dir / f"{clip_id}_norm.csv"
    norm_info_path = processed_dir / f"{clip_id}_norm_info.json"
    for p in (norm_csv, norm_info_path):
        if not p.exists():
            raise FileNotFoundError(f"{p} not found (run normalise.py first)")
    check_unsmoothed(processed_dir / f"{clip_id}_stable_report.json")

    row = read_metadata_row(metadata_path, clip_id)
    arm = (row.get("bowling_arm") or bowling_arm or "").strip().lower()
    if arm not in ("left", "right"):
        raise ValueError(f"bowling arm unknown for {clip_id}: add a bowling_arm column "
                         "(left/right) to metadata.csv or pass --bowling-arm")

    with open(norm_info_path) as f:
        norm_info = json.load(f)
    summary_path = processed_dir / f"{clip_id}_summary.json"
    summary = json.load(open(summary_path)) if summary_path.exists() else {}
    fps = _number(summary.get("fps")) or _number(row.get("fps"))
    if not fps:
        raise ValueError(f"frame rate unknown for {clip_id} (no summary JSON and no fps in metadata)")

    out = {
        "video_id": clip_id,
        "fps": fps,
        "bowling_arm": arm,
        "conditions": build_conditions(row),
        "window": {},
        "normalisation": {
            "origin": norm_info["origin"],
            "scale": norm_info["scale"],
            "filter": "none",
        },
        "frames": build_frames(pd.read_csv(norm_csv)),
        "reliability": {},
    }
    if summary.get("model"):
        out["model"] = Path(summary["model"]).stem   # "pose_landmarker_lite.task" -> "pose_landmarker_lite"

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{clip_id}.json"
    with open(out_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    return out_path, out


def main():
    parser = argparse.ArgumentParser(description="Export normalised keypoints as C1 contract JSON.")
    parser.add_argument("clip_ids", nargs="+", help="one or more clip IDs, e.g. B01_D01_front_5m")
    parser.add_argument("--processed", required=True, help="folder with the _norm/_stable/_summary files")
    parser.add_argument("--metadata", required=True, help="metadata.csv")
    parser.add_argument("--out", default="../../data/handoff", help="output folder (default ../../data/handoff)")
    parser.add_argument("--bowling-arm", choices=["left", "right"],
                        help="used when metadata.csv has no bowling_arm for the clip")
    args = parser.parse_args()

    for clip_id in args.clip_ids:
        path, out = export_clip(clip_id, args.processed, args.metadata, args.out, args.bowling_arm)
        frames = out["frames"]
        with_pose = sum(any(lm is not None for lm in fr["landmarks"]) for fr in frames)
        print(f"{clip_id}: {len(frames)} frames ({with_pose} with keypoints), "
              f"{out['conditions']} -> {path} ({path.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
