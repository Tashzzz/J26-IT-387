"""
Step 5: Use the trained model on a new clip.

Usage:
    python predict.py --landmarks data/landmarks/new_clip.csv --arm R --fps 60 \
        --model models/event_xgb.json
"""

import argparse
import json
from pathlib import Path

from xgboost import XGBClassifier

from common import event_angles, frame_features, load_landmarks, window_features, ANGLE_AT_EVENT
from train_evaluate import decode

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--landmarks", required=True)
    ap.add_argument("--arm", choices=["R", "L"], required=True)
    ap.add_argument("--fps", type=float, required=True)
    ap.add_argument("--model", required=True)
    a = ap.parse_args()

    df = load_landmarks(a.landmarks)
    X = window_features(frame_features(df, a.arm, a.fps), a.fps)
    X = X[json.loads(Path(a.model).with_suffix(".features.json").read_text())]
    m = XGBClassifier()
    m.load_model(a.model)
    ev = decode(m.predict_proba(X))
    ang = event_angles(df, a.arm, a.fps)
    for e, f in ev.items():
        vals = ", ".join(f"{n}={ang[n].iloc[f]:.1f}°" for n in ANGLE_AT_EVENT[e])
        print(f"{e.upper():>3}: frame {f:4d}  ({f / a.fps:.3f} s)   {vals}")
