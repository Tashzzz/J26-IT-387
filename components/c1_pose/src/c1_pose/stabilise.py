"""CricShield Component 1 - Step 2: temporal stabilisation.

Takes the raw keypoints CSV from extract.py and makes the keypoint tracks
smoother and more continuous, in three steps:

  1. Mask      - a keypoint with visibility below MIN_VISIBILITY is treated as
                 missing (MediaPipe is guessing when it cannot see the joint).
  2. Gap fill  - short gaps (up to MAX_GAP frames) are filled by straight-line
                 interpolation between the frames either side. Longer gaps are
                 left missing: inventing a whole second of arm motion is not honest.
  3. Filter    - a low-pass Butterworth filter removes frame-to-frame jitter.
                 A 2nd-order filter is run forwards and then backwards
                 (scipy filtfilt), which gives a 4th-order, zero-lag filter:
                 the standard way of smoothing motion data in biomechanics,
                 because it does not shift the timing of events like release.

CUTOFF_HZ is the main setting. Movement faster than the cutoff is treated as
noise and removed:
  - lower cutoff  -> smoother tracks, but fast real motion (the bowling arm
                     near release) gets flattened and peak values drop
  - higher cutoff -> keeps fast motion, but lets more jitter through
The cutoff must be below half the frame rate (15 Hz for 30 fps video).

Outputs (next to the input CSV unless --out is given):
  <clip>_stable.csv          same columns as the raw CSV, plus "filled"
                             (1 = this value was interpolated, not measured)
  <clip>_stable_report.json  continuity and jitter, raw vs stabilised

Usage (run from components/c1_pose):
  python src/c1_pose/stabilise.py ../../data/processed/B01_D01_side_10m_keypoints.csv
  python src/c1_pose/stabilise.py <csv> --cutoff 10
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.signal import butter, filtfilt

from keypoints import KEYPOINT_NAMES

CUTOFF_HZ = 8.0        # low-pass cutoff frequency
FILTER_ORDER = 2       # run forwards + backwards -> effective 4th order
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


def lowpass(track, fps, cutoff_hz, order):
    """Zero-lag Butterworth filter applied to each continuous run of data.

    NaN gaps that were too long to fill split the track into separate runs;
    each run is filtered on its own. Runs too short for filtfilt are left as
    they are.
    """
    b, a = butter(order, cutoff_hz / (fps / 2.0), btype="low")
    min_len = 3 * max(len(a), len(b)) + 1  # filtfilt's padding needs this many samples
    out = track.copy()
    valid = ~np.isnan(track)

    i = 0
    n = len(track)
    while i < n:
        if not valid[i]:
            i += 1
            continue
        start = i
        while i < n and valid[i]:
            i += 1
        if i - start >= min_len:
            out[start:i] = filtfilt(b, a, track[start:i])
    return out


def jitter(coords):
    """Mean absolute frame-to-frame acceleration (second difference).

    Real motion changes smoothly, so large second differences are mostly
    tracking noise. Lower is steadier. Uses image x/y only (0-1 units).
    """
    xy = coords[:, :, :2]
    acc = np.abs(np.diff(xy, n=2, axis=0))
    return float(np.nanmean(acc)) if np.isfinite(acc).any() else None


def continuity(coords):
    """Share of frames where each keypoint has a usable x value."""
    return (~np.isnan(coords[:, :, 0])).mean(axis=0)


def stabilise(csv_path, fps, cutoff_hz=CUTOFF_HZ, min_visibility=MIN_VISIBILITY,
              max_gap=MAX_GAP, out_dir=None):
    csv_path = Path(csv_path)
    out_dir = Path(out_dir) if out_dir else csv_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    if cutoff_hz >= fps / 2.0:
        raise ValueError(f"cutoff {cutoff_hz} Hz must be below half the frame rate ({fps / 2} Hz)")

    clip_id, raw, visibility, time_ms, detected = load_tracks(csv_path)
    n_frames = raw.shape[0]

    # 1. Mask low-visibility keypoints.
    masked = raw.copy()
    masked[visibility < min_visibility] = np.nan

    # 2 + 3. Fill short gaps, then filter, one coordinate track at a time.
    stable = np.full_like(masked, np.nan)
    filled_flag = np.zeros((n_frames, 33), dtype=bool)
    for kp in range(33):
        for c in range(len(COORDS)):
            track, was_filled = fill_short_gaps(masked[:, kp, c], max_gap)
            stable[:, kp, c] = lowpass(track, fps, cutoff_hz, FILTER_ORDER)
            if c == 0:
                filled_flag[:, kp] = was_filled

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

    # Report: continuity and jitter before and after.
    cont_raw = continuity(raw)
    cont_masked = continuity(masked)
    cont_stable = continuity(stable)
    report = {
        "clip_id": clip_id,
        "fps": fps,
        "frames": n_frames,
        "settings": {
            "cutoff_hz": cutoff_hz,
            "filter": f"butterworth order {FILTER_ORDER} forward-backward (effective order {FILTER_ORDER * 2}, zero lag)",
            "min_visibility": min_visibility,
            "max_gap_frames": max_gap,
        },
        "continuity_mean": {
            "raw_detected": round(float(cont_raw.mean()), 4),
            "raw_visible": round(float(cont_masked.mean()), 4),
            "stabilised": round(float(cont_stable.mean()), 4),
        },
        "jitter_mean": {
            "raw_visible": jitter(masked),
            "stabilised": jitter(stable),
        },
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
    parser = argparse.ArgumentParser(description="Gap-fill and Butterworth-filter keypoint tracks.")
    parser.add_argument("csv", help="raw keypoints CSV from extract.py")
    parser.add_argument("--fps", type=float, help="frame rate (default: read from the summary JSON)")
    parser.add_argument("--cutoff", type=float, default=CUTOFF_HZ, help=f"cutoff in Hz (default {CUTOFF_HZ})")
    parser.add_argument("--min-vis", type=float, default=MIN_VISIBILITY,
                        help=f"visibility below this counts as missing (default {MIN_VISIBILITY})")
    parser.add_argument("--max-gap", type=int, default=MAX_GAP,
                        help=f"longest gap in frames to fill (default {MAX_GAP})")
    parser.add_argument("--out", help="output folder (default: same folder as the CSV)")
    args = parser.parse_args()

    fps = args.fps or fps_from_summary(args.csv)
    if not fps:
        raise SystemExit("Frame rate unknown: pass --fps or keep the _summary.json next to the CSV")

    r = stabilise(args.csv, fps, args.cutoff, args.min_vis, args.max_gap, args.out)
    c, j = r["continuity_mean"], r["jitter_mean"]
    print(f"{r['clip_id']}: {r['frames']} frames at {fps} fps, cutoff {args.cutoff} Hz")
    print(f"  continuity  detected {c['raw_detected']:.1%}  visible {c['raw_visible']:.1%}  "
          f"-> stabilised {c['stabilised']:.1%}")
    if j["raw_visible"] is not None and j["stabilised"] is not None:
        print(f"  jitter      {j['raw_visible']:.5f} -> {j['stabilised']:.5f} "
              f"({1 - j['stabilised'] / j['raw_visible']:.0%} lower)")
    print(f"  saved: {r['csv']}")


if __name__ == "__main__":
    main()
