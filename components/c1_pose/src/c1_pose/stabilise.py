"""CricShield Component 1 - Step 2: occlusion handling and temporal stabilisation. 

Takes the raw keypoints CSV from extract.py and makes the keypoint tracks
more continuous, in two steps:

  1. Mask      - a keypoint with visibility below MIN_VISIBILITY is treated as
                 missing (MediaPipe is guessing when it cannot see the joint,
                 e.g. the far-side arm hidden behind the body at release).
  2. Gap fill  - short gaps (up to MAX_GAP frames) are filled by straight-line
                 interpolation between the frames either side. Longer gaps are
                 left missing: inventing a whole second of arm motion is not honest.

Signal smoothing (the Butterworth low-pass filter) is NOT done here. As
presented at the proposal, smoothing belongs to Component 2 (biomechanical
feature engineering), which filters the signals it computes angles from.
C1 keeps the pose model's own output unsmoothed so that the reliability
study (ICC) measures how reliable the pose model is under each recording
condition, without a filter hiding the effect of the camera setup. 

Outputs (next to the input CSV unless --out is given):
  <clip>_stable.csv          same columns as the raw CSV, plus "filled"
                             (1 = this value was interpolated, not measured)
  <clip>_stable_report.json  continuity before/after, frames filled per keypoint,
                             and raw jitter (for C2 to compare against after smoothing)

Usage (run from components/c1_pose):
  python src/c1_pose/stabilise.py ../../data/processed/B01_D01_side_10m_keypoints.csv
  python src/c1_pose/stabilise.py <csv> --min-vis 0.6 --max-gap 3
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from keypoints import KEYPOINT_NAMES

MIN_VISIBILITY = 0.5   # below this a keypoint is treated as missing
MAX_GAP = 5            # longest gap (in frames) that is filled by interpolation

COORDS = ["x", "y", "z", "wx", "wy", "wz"]


def load_tracks(csv_path):
    """Read the long-format CSV into arrays of shape (frames, 33, ...)."""
    df = pd.read_csv(csv_path)
    clip_id = str(df["clip_id"].iloc[0])
    n_frames = int(df["frame"].max()) + 1
    df = df.sort_values(["frame", "kp_id"])

    coords = df[COORDS].to_numpy(dtype=float).reshape(n_frames, 33, len(COORDS))
    visibility = df["visibility"].to_numpy(dtype=float).reshape(n_frames, 33)
    time_ms = df["time_ms"].to_numpy().reshape(n_frames, 33)[:, 0]
    detected = df["detected"].to_numpy().reshape(n_frames, 33)[:, 0]
    return clip_id, coords, visibility, time_ms, detected


def mask_low_visibility(coords, visibility, min_visibility):
    """Set coordinates to NaN where MediaPipe's visibility is below the threshold."""
    masked = coords.copy()
    masked[visibility < min_visibility] = np.nan
    return masked


def fill_short_gaps(track, max_gap):
    """Linearly interpolate runs of NaN no longer than max_gap frames.

    track is 1-D (one coordinate of one keypoint over time). Returns the
    filled track and a boolean array marking which values were filled.
    """
    filled = track.copy()
    was_filled = np.zeros(len(track), dtype=bool)
    valid = ~np.isnan(track)
    if valid.sum() < 2:
        return filled, was_filled

    i = 0
    n = len(track)
    while i < n:
        if valid[i]:
            i += 1
            continue
        start = i
        while i < n and not valid[i]:
            i += 1
        end = i  # first valid frame after the gap (or n)
        gap_len = end - start
        # Only fill gaps that have a measured frame on both sides.
        if start > 0 and end < n and gap_len <= max_gap:
            before, after = track[start - 1], track[end]
            steps = np.arange(1, gap_len + 1) / (gap_len + 1)
            filled[start:end] = before + (after - before) * steps
            was_filled[start:end] = True
    return filled, was_filled


def jitter(coords):
    """Mean absolute frame-to-frame acceleration (second difference).

    Real motion changes smoothly, so large second differences are mostly
    tracking noise. Lower is steadier. Uses image x/y only (0-1 units).
    Reported so C2 can show how much its smoothing reduces it.
    """
    xy = coords[:, :, :2]
    acc = np.abs(np.diff(xy, n=2, axis=0))
    return float(np.nanmean(acc)) if np.isfinite(acc).any() else None


def continuity(coords):
    """Share of frames where each keypoint has a usable x value."""
    return (~np.isnan(coords[:, :, 0])).mean(axis=0)


def stabilise_tracks(raw, visibility, min_visibility=MIN_VISIBILITY, max_gap=MAX_GAP):
    """Mask + gap fill on arrays. Returns (masked, stable, filled_flag)."""
    masked = mask_low_visibility(raw, visibility, min_visibility)
    n_frames = raw.shape[0]
    stable = np.full_like(masked, np.nan)
    filled_flag = np.zeros((n_frames, 33), dtype=bool)
    for kp in range(33):
        for c in range(raw.shape[2]):
            track, was_filled = fill_short_gaps(masked[:, kp, c], max_gap)
            stable[:, kp, c] = track
            if c == 0:
                filled_flag[:, kp] = was_filled
    return masked, stable, filled_flag


def stabilise(csv_path, min_visibility=MIN_VISIBILITY, max_gap=MAX_GAP, out_dir=None, fps=None):
    csv_path = Path(csv_path)
    out_dir = Path(out_dir) if out_dir else csv_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    clip_id, raw, visibility, time_ms, detected = load_tracks(csv_path)
    n_frames = raw.shape[0]
    masked, stable, filled_flag = stabilise_tracks(raw, visibility, min_visibility, max_gap)

    # Save the stabilised CSV in the same long format as extract.py.
    rows = []
    for f in range(n_frames):
        for kp in range(33):
            values = stable[f, kp]
            rows.append([clip_id, f, int(time_ms[f]), int(detected[f]), kp, KEYPOINT_NAMES[kp]]
                        + [None if np.isnan(v) else round(float(v), 6) for v in values]
                        + [None if np.isnan(visibility[f, kp]) else visibility[f, kp],
                           int(filled_flag[f, kp])])
    columns = ["clip_id", "frame", "time_ms", "detected", "kp_id", "kp_name"] + COORDS + ["visibility", "filled"]
    out_csv = out_dir / f"{clip_id}_stable.csv"
    pd.DataFrame(rows, columns=columns).to_csv(out_csv, index=False)

    # Report: continuity before and after, and raw jitter for C2.
    cont_raw = continuity(raw)
    cont_masked = continuity(masked)
    cont_stable = continuity(stable)
    report = {
        "clip_id": clip_id,
        "fps": fps,
        "frames": n_frames,
        "settings": {
            "min_visibility": min_visibility,
            "max_gap_frames": max_gap,
            "smoothing": "none in C1 (Butterworth smoothing is done by C2)",
        },
        "continuity_mean": {
            "raw_detected": round(float(cont_raw.mean()), 4),
            "raw_visible": round(float(cont_masked.mean()), 4),
            "stabilised": round(float(cont_stable.mean()), 4),
        },
        "jitter_mean_unsmoothed": jitter(stable),
        "per_keypoint": {
            KEYPOINT_NAMES[k]: {
                "continuity_raw_visible": round(float(cont_masked[k]), 4),
                "continuity_stabilised": round(float(cont_stable[k]), 4),
                "frames_filled": int(filled_flag[:, k].sum()),
            }
            for k in range(33)
        },
        "csv": str(out_csv),
    }
    with open(out_dir / f"{clip_id}_stable_report.json", "w") as f:
        json.dump(report, f, indent=2)
    return report


def fps_from_summary(csv_path):
    """Read fps from the <clip>_summary.json that extract.py wrote next to the CSV."""
    csv_path = Path(csv_path)
    summary = csv_path.with_name(csv_path.name.replace("_keypoints.csv", "_summary.json"))
    if summary.exists():
        with open(summary) as f:
            return float(json.load(f)["fps"])
    return None


def main():
    parser = argparse.ArgumentParser(description="Mask low-visibility keypoints and fill short gaps.")
    parser.add_argument("csv", help="raw keypoints CSV from extract.py")
    parser.add_argument("--min-vis", type=float, default=MIN_VISIBILITY,
                        help=f"visibility below this counts as missing (default {MIN_VISIBILITY})")
    parser.add_argument("--max-gap", type=int, default=MAX_GAP,
                        help=f"longest gap in frames to fill (default {MAX_GAP})")
    parser.add_argument("--out", help="output folder (default: same folder as the CSV)")
    args = parser.parse_args()

    r = stabilise(args.csv, args.min_vis, args.max_gap, args.out, fps=fps_from_summary(args.csv))
    c = r["continuity_mean"]
    filled = sum(k["frames_filled"] for k in r["per_keypoint"].values())
    print(f"{r['clip_id']}: {r['frames']} frames")
    print(f"  continuity  detected {c['raw_detected']:.1%}  visible {c['raw_visible']:.1%}  "
          f"-> after gap fill {c['stabilised']:.1%}  ({filled} keypoint-frames filled)")
    print(f"  saved: {r['csv']}")


if __name__ == "__main__":
    main()
