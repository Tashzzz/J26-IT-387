"""
Steps 3-4: Evaluate the rule-based baseline and train/evaluate XGBoost
with leave-one-bowler-out (LOBO) cross-validation.

Usage:
    python train_evaluate.py --landmarks data/landmarks --labels data/labels.csv
    python train_evaluate.py ... --save-model models/event_xgb.json   # also fit on all data

Outputs (in --out, default results/):
    predictions.csv   one row per clip x method: true and predicted frames
    summary.csv       frame-error metrics per method x event
    angle_error.csv   how much the injury angle changes because of the event error
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from common import ANGLE_AT_EVENT, EVENTS, event_angles, frame_features, load_dataset, window_features
from rule_baseline import detect as rule_detect

CLASS = {"none": 0, "bfc": 1, "ffc": 2, "br": 3}


def build_clip(row, df):
    fps = float(row.fps)
    ff = frame_features(df, row.bowling_arm, fps)
    X = window_features(ff, fps)
    y = np.zeros(len(X), dtype=int)
    tol = max(1, int(round(fps / 60)))  # +-1 frame at 60 fps counts as the event
    for ev in EVENTS:
        t = int(row[ev])
        y[max(0, t - tol): t + tol + 1] = CLASS[ev]
    return X, y


def decode(proba):
    """Pick one frame per event, keeping BFC < FFC < BR."""
    n = len(proba)
    br = int(np.argmax(proba[:, 3]))
    ffc = int(np.argmax(proba[:br, 2])) if br > 0 else 0
    bfc = int(np.argmax(proba[:ffc, 1])) if ffc > 0 else 0
    return {"bfc": bfc, "ffc": ffc, "br": min(br, n - 1)}


def make_model():
    from xgboost import XGBClassifier

    return XGBClassifier(
        n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.8,
        colsample_bytree=0.8, objective="multi:softprob", num_class=4,
        eval_metric="mlogloss", tree_method="hist", n_jobs=-1,
    )


def balanced_weights(y):
    counts = np.bincount(y, minlength=4).astype(float)
    counts[counts == 0] = 1
    w = len(y) / (4 * counts)
    return w[y]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--landmarks", required=True, help="folder of <clip_id>.csv landmark files")
    ap.add_argument("--labels", required=True, help="labels.csv")
    ap.add_argument("--out", default="results")
    ap.add_argument("--save-model", default=None, help="path to save a model trained on ALL clips")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    clips = []
    for row, df in load_dataset(a.landmarks, a.labels):
        X, y = build_clip(row, df)
        clips.append(dict(row=row, df=df, X=X, y=y))
    if not clips:
        raise SystemExit("No labelled clips found.")
    bowlers = sorted({str(c["row"].bowler_id) for c in clips})
    print(f"{len(clips)} clips from {len(bowlers)} bowlers")

    preds = []
    # --- rule-based baseline
    for c in clips:
        r = c["row"]
        preds.append(dict(clip_id=r.clip_id, bowler_id=r.bowler_id, method="rule",
                          **{f"pred_{e}": v for e, v in rule_detect(c["df"], r.bowling_arm, float(r.fps)).items()}))

    # --- XGBoost, leave-one-bowler-out
    if len(bowlers) >= 2:
        groups = bowlers
        key = lambda c: str(c["row"].bowler_id)
    else:
        print("Only one bowler: falling back to leave-one-CLIP-out (results will be optimistic).")
        groups = [str(c["row"].clip_id) for c in clips]
        key = lambda c: str(c["row"].clip_id)

    for g in groups:
        train = [c for c in clips if key(c) != g]
        test = [c for c in clips if key(c) == g]
        Xtr = pd.concat([c["X"] for c in train], ignore_index=True)
        ytr = np.concatenate([c["y"] for c in train])
        if len(np.unique(ytr)) < 4:
            print(f"  ! fold {g}: training data lacks some event classes, skipped")
            continue
        model = make_model()
        model.fit(Xtr, ytr, sample_weight=balanced_weights(ytr))
        for c in test:
            r = c["row"]
            p = decode(model.predict_proba(c["X"]))
            preds.append(dict(clip_id=r.clip_id, bowler_id=r.bowler_id, method="xgboost",
                              **{f"pred_{e}": v for e, v in p.items()}))

    P = pd.DataFrame(preds)
    truth = pd.DataFrame([dict(clip_id=c["row"].clip_id, fps=float(c["row"].fps),
                               **{e: int(c["row"][e]) for e in EVENTS}) for c in clips])
    P = P.merge(truth, on="clip_id")
    P.to_csv(out / "predictions.csv", index=False)

    # --- frame-error summary
    rows = []
    for m, g in P.groupby("method"):
        for e in EVENTS:
            err = (g[f"pred_{e}"] - g[e]).values
            ms = np.abs(err) / g["fps"].values * 1000
            rows.append(dict(method=m, event=e.upper(), n=len(err),
                             mean_abs_frames=np.mean(np.abs(err)).round(2),
                             median_abs_frames=np.median(np.abs(err)),
                             mean_abs_ms=ms.mean().round(1),
                             within_1_frame_pct=(np.abs(err) <= 1).mean().round(3) * 100,
                             within_2_frames_pct=(np.abs(err) <= 2).mean().round(3) * 100))
    S = pd.DataFrame(rows)
    S.to_csv(out / "summary.csv", index=False)

    # --- angle error caused by event error
    by_id = {c["row"].clip_id: c for c in clips}
    arows = []
    for _, p in P.iterrows():
        c = by_id[p.clip_id]
        ang = event_angles(c["df"], c["row"].bowling_arm, float(c["row"].fps))
        for e in EVENTS:
            for name in ANGLE_AT_EVENT[e]:
                arows.append(dict(method=p.method, event=e.upper(), angle=name,
                                  abs_error_deg=abs(ang[name].iloc[int(p[f"pred_{e}"])]
                                                    - ang[name].iloc[int(p[e])])))
    A = (pd.DataFrame(arows).groupby(["method", "event", "angle"])["abs_error_deg"]
         .agg(["mean", "max"]).round(2).reset_index())
    A.to_csv(out / "angle_error.csv", index=False)

    pd.set_option("display.width", 140)
    print("\nFrame error by method and event\n", S.to_string(index=False))
    print("\nAngle error caused by event error (degrees)\n", A.to_string(index=False))

    if a.save_model:
        X = pd.concat([c["X"] for c in clips], ignore_index=True)
        y = np.concatenate([c["y"] for c in clips])
        model = make_model()
        model.fit(X, y, sample_weight=balanced_weights(y))
        Path(a.save_model).parent.mkdir(parents=True, exist_ok=True)
        model.save_model(a.save_model)
        Path(a.save_model).with_suffix(".features.json").write_text(json.dumps(list(X.columns)))
        print(f"\nSaved model trained on all {len(clips)} clips -> {a.save_model}")


if __name__ == "__main__":
    main()
