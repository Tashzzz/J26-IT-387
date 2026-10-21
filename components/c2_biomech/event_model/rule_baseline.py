"""
Step 3: Rule-based event detector (your baseline - no training needed).

Rules:
  BR  = frame where the bowling wrist is highest above the bowling shoulder
  FFC = last time the FRONT foot lands (comes down from the air onto the ground) before BR
  BFC = last time the REAR foot lands before FFC

Usage (detect only, on one clip):
    python rule_baseline.py --landmarks data/landmarks/clip01.csv --arm R --fps 60
"""

import argparse

import numpy as np

from common import frame_features, load_landmarks


def landing_onsets(foot_y, fps, tol=0.10, min_air_ms=50):
    """Frames where a foot arrives at the ground after being in the air.

    foot_y: 0 at the foot's lowest point, negative when raised (body-scale units).
    """
    ground = np.nanpercentile(foot_y, 95)
    on_ground = foot_y > ground - tol
    min_air = max(1, int(min_air_ms / 1000 * fps))
    onsets, air_run = [], 0
    for t in range(len(foot_y)):
        if on_ground[t]:
            if air_run >= min_air:
                onsets.append(t)
            air_run = 0
        else:
            air_run += 1
    return onsets


def detect(df, bowling_arm, fps, max_gap_s=0.6):
    ff = frame_features(df, bowling_arm, fps)
    n = len(ff)
    gap = int(max_gap_s * fps)

    br = int(np.nanargmax(ff["wrist_above_shoulder"].values))

    front = [t for t in landing_onsets(ff["front_foot_y"].values, fps) if br - gap <= t < br]
    if front:
        ffc = front[-1]
    else:  # fallback: front foot lowest point shortly before release
        lo = max(0, br - gap)
        ffc = lo + int(np.nanargmax(ff["front_foot_y"].values[lo:br])) if br > lo else max(0, br - 1)

    rear = [t for t in landing_onsets(ff["rear_foot_y"].values, fps) if ffc - gap <= t < ffc]
    if rear:
        bfc = rear[-1]
    else:
        lo = max(0, ffc - gap)
        bfc = lo + int(np.nanargmax(ff["rear_foot_y"].values[lo:ffc])) if ffc > lo else max(0, ffc - 1)

    return {"bfc": int(bfc), "ffc": int(ffc), "br": int(min(br, n - 1))}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--landmarks", required=True)
    ap.add_argument("--arm", choices=["R", "L"], required=True, help="bowling arm")
    ap.add_argument("--fps", type=float, required=True)
    a = ap.parse_args()
    print(detect(load_landmarks(a.landmarks), a.arm, a.fps))
