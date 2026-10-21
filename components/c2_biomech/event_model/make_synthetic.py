"""
Generates FAKE landmark clips with known events, only to check the pipeline runs.
Never report results from this data.

Usage:
    python make_synthetic.py --out demo_data --bowlers 6 --clips 5
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from common import LM, other


def smoothstep(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def make_clip(rng, arm, fps=60):
    n = int(fps * rng.uniform(1.6, 2.2))
    t = np.arange(n)
    bfc = int(rng.uniform(0.30, 0.40) * n)
    ffc = bfc + int(fps * rng.uniform(0.13, 0.20))
    br = ffc + int(fps * rng.uniform(0.07, 0.11))
    ground, air = 0.90, 0.80
    rear, front = arm, other(arm)

    # rear foot: in the air during the bound, lands at BFC, lifts after BR
    rear_y = np.full(n, air)
    down = (t >= bfc - 8) & (t < bfc)
    rear_y[down] = air + (ground - air) * smoothstep((t[down] - (bfc - 8)) / 8)
    rear_y[(t >= bfc) & (t < br + 4)] = ground
    up = t >= br + 4
    rear_y[up] = ground - (ground - air) * smoothstep((t[up] - (br + 4)) / 10)
    rear_y[t < bfc - 20] = ground  # earlier run-up stride on the ground

    # front foot: swings through the air, lands at FFC, stays planted
    front_y = np.full(n, air)
    front_y[t < bfc - 12] = ground
    down = (t >= ffc - 7) & (t < ffc)
    front_y[down] = air + (ground - air) * smoothstep((t[down] - (ffc - 7)) / 7)
    front_y[t >= ffc] = ground

    # bowling wrist: circles up and is highest at BR
    phase = (t - br) / (0.25 * fps)
    wrist_y = 0.45 + 0.20 * (1 - np.exp(-phase ** 2))
    hip_x = 0.2 + 0.6 * t / n

    cols = {"frame": t, "time": t / fps}
    for k in range(33):
        cols[f"lm{k}_x"] = hip_x + rng.normal(0, 0.003, n)
        cols[f"lm{k}_y"] = np.full(n, 0.6) + rng.normal(0, 0.003, n)
        cols[f"lm{k}_z"] = np.zeros(n)
        cols[f"lm{k}_v"] = np.ones(n)
    for side in "LR":
        cols[f"lm{LM[side]['shoulder']}_y"] = 0.35 + rng.normal(0, 0.003, n)
        cols[f"lm{LM[side]['hip']}_y"] = 0.60 + rng.normal(0, 0.003, n)
        cols[f"lm{LM[side]['knee']}_y"] = 0.75 + rng.normal(0, 0.003, n)
    for side, fy in ((rear, rear_y), (front, front_y)):
        for j in ("heel", "toe", "ankle"):
            cols[f"lm{LM[side][j]}_y"] = fy - (0.02 if j == "ankle" else 0) + rng.normal(0, 0.004, n)
    cols[f"lm{LM[arm]['wrist']}_y"] = wrist_y + rng.normal(0, 0.004, n)
    return pd.DataFrame(cols), dict(bfc=bfc, ffc=ffc, br=br)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="demo_data")
    ap.add_argument("--bowlers", type=int, default=6)
    ap.add_argument("--clips", type=int, default=5)
    a = ap.parse_args()
    rng = np.random.default_rng(7)
    out = Path(a.out)
    (out / "landmarks").mkdir(parents=True, exist_ok=True)
    labels = []
    for b in range(a.bowlers):
        arm = "R" if b % 3 else "L"
        for c in range(a.clips):
            df, ev = make_clip(rng, arm)
            cid = f"B{b+1:02d}_d{c+1:02d}"
            df.to_csv(out / "landmarks" / f"{cid}.csv", index=False)
            labels.append(dict(clip_id=cid, bowler_id=f"B{b+1:02d}", bowling_arm=arm, fps=60, **ev))
    pd.DataFrame(labels).to_csv(out / "labels.csv", index=False)
    print(f"Wrote {len(labels)} fake clips to {out}/")
