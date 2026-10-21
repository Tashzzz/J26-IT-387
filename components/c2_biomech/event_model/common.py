"""
Shared helpers for CricShield Component 2 delivery-event detection.

Landmark CSV format (one row per video frame), produced by extract_landmarks.py:
    frame, time, lm0_x, lm0_y, lm0_z, lm0_v, ..., lm32_x, lm32_y, lm32_z, lm32_v
x, y are MediaPipe normalised image coordinates (0-1). Image y grows DOWNWARD,
so a foot on the ground has a LARGER y than a foot in the air.

Labels CSV format (one row per delivery), made with label_events.py:
    clip_id, bowler_id, bowling_arm, fps, bfc, ffc, br
bowling_arm is "R" or "L". bfc/ffc/br are frame numbers.
"""

from pathlib import Path

import numpy as np
import pandas as pd
from scipy.signal import butter, filtfilt

EVENTS = ["bfc", "ffc", "br"]

# MediaPipe Pose landmark indices (person's own left/right)
LM = {
    "L": dict(shoulder=11, elbow=13, wrist=15, hip=23, knee=25, ankle=27, heel=29, toe=31),
    "R": dict(shoulder=12, elbow=14, wrist=16, hip=24, knee=26, ankle=28, heel=30, toe=32),
}


def other(side):
    return "L" if side == "R" else "R"


def load_landmarks(path):
    return pd.read_csv(path)


def lowpass(x, fps, cutoff_hz=8.0, order=4):
    """Zero-lag Butterworth low-pass. Cut-off is clamped below Nyquist (fps/2)."""
    x = np.asarray(x, dtype=float)
    # fill gaps (frames where MediaPipe lost the person)
    if np.isnan(x).any():
        idx = np.arange(len(x))
        ok = ~np.isnan(x)
        if ok.sum() < 2:
            return x
        x = np.interp(idx, idx[ok], x[ok])
    nyq = fps / 2.0
    wn = min(cutoff_hz / nyq, 0.95)
    if len(x) <= 3 * (order + 1):
        return x
    b, a = butter(order // 2, wn)  # filtfilt doubles the order -> 4th order overall
    return filtfilt(b, a, x)


def point(df, idx, fps, cutoff_hz=8.0):
    """Smoothed (x, y) arrays for one landmark."""
    x = lowpass(df[f"lm{idx}_x"].values, fps, cutoff_hz)
    y = lowpass(df[f"lm{idx}_y"].values, fps, cutoff_hz)
    return x, y


def body_scale(df, fps):
    """Median shoulder-mid to hip-mid distance, used to make features size-independent."""
    lsx, lsy = point(df, 11, fps)
    rsx, rsy = point(df, 12, fps)
    lhx, lhy = point(df, 23, fps)
    rhx, rhy = point(df, 24, fps)
    d = np.hypot((lsx + rsx) / 2 - (lhx + rhx) / 2, (lsy + rsy) / 2 - (lhy + rhy) / 2)
    s = np.nanmedian(d)
    return s if s > 1e-6 else 1.0


def foot_y(df, side, fps):
    """Vertical position of a foot = mean of heel and toe."""
    _, hy = point(df, LM[side]["heel"], fps)
    _, ty = point(df, LM[side]["toe"], fps)
    return (hy + ty) / 2


def frame_features(df, bowling_arm, fps):
    """Per-frame signals, in body-scale units per second, bowling-side aware.

    rear = bowling-arm side foot (lands at BFC); front = other foot (lands at FFC).
    """
    s = body_scale(df, fps)
    rear, front = bowling_arm, other(bowling_arm)
    out = {}
    for name, side in (("rear", rear), ("front", front)):
        y = foot_y(df, side, fps) / s
        out[f"{name}_foot_y"] = y - np.nanmax(y)  # 0 = lowest point (ground)
        out[f"{name}_foot_vy"] = np.gradient(y) * fps
        out[f"{name}_foot_ay"] = np.gradient(out[f"{name}_foot_vy"]) * fps
        ax, _ = point(df, LM[side]["ankle"], fps)
        out[f"{name}_ankle_vx"] = np.gradient(ax / s) * fps
    wx, wy = point(df, LM[bowling_arm]["wrist"], fps)
    _, sy = point(df, LM[bowling_arm]["shoulder"], fps)
    out["wrist_above_shoulder"] = (sy - wy) / s  # >0 when wrist is above shoulder
    out["wrist_vy"] = np.gradient(wy / s) * fps
    out["wrist_vx"] = np.gradient(wx / s) * fps
    out["wrist_speed"] = np.hypot(out["wrist_vx"], out["wrist_vy"])
    lhx, _ = point(df, 23, fps)
    rhx, _ = point(df, 24, fps)
    out["hip_vx"] = np.gradient(((lhx + rhx) / 2) / s) * fps
    return pd.DataFrame(out)


def window_features(ff, fps, offsets_ms=(-100, -66, -33, -17, 0, 17, 33, 66, 100)):
    """Stack each per-frame signal at time offsets around every frame (for XGBoost)."""
    n = len(ff)
    cols = {}
    for ms in offsets_ms:
        k = int(round(ms / 1000 * fps))
        idx = np.clip(np.arange(n) + k, 0, n - 1)
        for c in ff.columns:
            cols[f"{c}@{ms}"] = ff[c].values[idx]
    X = pd.DataFrame(cols)
    X["t_rel"] = np.arange(n) / max(n - 1, 1)  # position in clip
    return X


def joint_angle(ax, ay, bx, by, cx, cy):
    """Angle at B between A and C (degrees), atan2 form."""
    v1 = np.stack([ax - bx, ay - by], -1)
    v2 = np.stack([cx - bx, cy - by], -1)
    cross = v1[..., 0] * v2[..., 1] - v1[..., 1] * v2[..., 0]
    dot = (v1 * v2).sum(-1)
    return np.degrees(np.arctan2(np.abs(cross), dot))


def event_angles(df, bowling_arm, fps):
    """2D side-on angles used to show how event errors become angle errors."""
    rear, front = bowling_arm, other(bowling_arm)
    P = lambda side, j: point(df, LM[side][j], fps)
    out = {}
    for name, side in (("rear", rear), ("front", front)):
        sh, hp, kn, an = P(side, "shoulder"), P(side, "hip"), P(side, "knee"), P(side, "ankle")
        out[f"{name}_knee"] = joint_angle(*hp, *kn, *an)
        out[f"{name}_hip"] = joint_angle(*sh, *hp, *kn)
    return pd.DataFrame(out)


# which angle matters at which event (Alway 2021 feature set, 2D proxies)
ANGLE_AT_EVENT = {"bfc": ["rear_hip", "rear_knee"], "ffc": ["front_hip", "front_knee"], "br": ["front_knee"]}


def load_dataset(landmark_dir, labels_csv):
    """Yield (row, landmarks_df) for every labelled clip that has a landmark file."""
    labels = pd.read_csv(labels_csv)
    before = len(labels)
    labels = labels.dropna(subset=["bowling_arm", "bfc", "ffc", "br"])  # skip rows not labelled yet
    if len(labels) < before:
        print(f"  ({before - len(labels)} rows not labelled yet, skipped)")
    for e in EVENTS:
        labels[e] = labels[e].astype(int)
    labels["bowling_arm"] = labels["bowling_arm"].str.strip().str.upper()
    landmark_dir = Path(landmark_dir)
    for _, row in labels.iterrows():
        f = landmark_dir / f"{row.clip_id}.csv"
        if not f.exists():
            print(f"  ! missing landmarks for {row.clip_id}, skipped")
            continue
        yield row, load_landmarks(f)
