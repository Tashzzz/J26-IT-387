"""
Train the release model used by the app (src/c2_biomech/event_ml.py).

The app receives C1's keypoints: hip-centred, divided by the clip's shoulder width, then
C2's quality gate and 8 Hz Butterworth filter run on them. This script converts the raw
MediaPipe landmark CSVs (extract_landmarks.py) into exactly that format, runs the same C2
steps, and then:

  1. leave-one-bowler-out: trains on all other bowlers, tests on the held-out one, and
     compares the model with the app's rule (first strong arm peak, events.py) on the
     same deliveries;
  2. fits on all deliveries and saves src/c2_biomech/models/release_xgb.json (+ .meta.json).

Usage (from components/c2_biomech, after pip install -e . and xgboost):
    python event_model/train_release_c1format.py --landmarks data/landmarks --labels data/labels.csv \
        --sizes data/video_sizes.csv --out results_release

video_sizes.csv: clip_id,width,height (pixels of the original video; MediaPipe x/y are
fractions of the frame, C1 converts them to pixels before normalising).
"""

import argparse
import json
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))

from c2_biomech import event_ml, keypoints as kp  # noqa: E402
from c2_biomech.events import detect_events  # noqa: E402
from c2_biomech.filtering import filter_delivery  # noqa: E402
from c2_biomech.loader import Delivery  # noqa: E402
from c2_biomech.quality import gate  # noqa: E402

MIN_VISIBILITY = 0.5   # C1 stabilise.py
CUTOFF_HZ = 8.0        # C2 default


def to_c1_points(lm, width, height):
    """Raw MediaPipe landmark table -> C1 contract points (hip-centred / shoulder width) + visibility."""
    n = len(lm)
    xyz = np.stack([lm[[f"lm{k}_x", f"lm{k}_y", f"lm{k}_z"]].to_numpy(float) for k in range(33)], axis=1)
    vis = np.stack([lm[f"lm{k}_v"].to_numpy(float) for k in range(33)], axis=1)
    px = xyz * np.array([width, height, width], float)
    px[vis < MIN_VISIBILITY] = np.nan
    hip = (px[:, kp.LEFT_HIP] + px[:, kp.RIGHT_HIP]) / 2
    sw = np.linalg.norm(px[:, kp.LEFT_SHOULDER, :2] - px[:, kp.RIGHT_SHOULDER, :2], axis=1)
    scale = np.nanmedian(sw) if np.isfinite(sw).any() else np.nan
    pts = (px - hip[:, None, :]) / scale
    vis = np.where(np.isfinite(pts[:, :, 0]), vis, np.nan)
    return pts.reshape(n, 33, 3), vis


def app_points(row, lm, width, height):
    """Same preprocessing as features.compute_features steps 1-3."""
    pts, vis = to_c1_points(lm, width, height)
    d = Delivery(video_id=row.clip_id, bowler_id=row.bowler_id, fps=float(row.fps),
                 bowling_arm="right" if row.bowling_arm == "R" else "left",
                 points=pts, visibility=vis, times=np.arange(len(pts)) / float(row.fps))
    gated, keep, _ = gate(d.points)
    d = replace(d, points=gated)
    filtered, _, _ = filter_delivery(d, "auto", CUTOFF_HZ)
    d = replace(d, points=filtered)
    usable = keep | np.isfinite(filtered[:, [kp.LEFT_SHOULDER, kp.RIGHT_SHOULDER,
                                             kp.LEFT_HIP, kp.RIGHT_HIP], 0]).all(axis=1)
    return d, usable


def make_model():
    from xgboost import XGBClassifier
    return XGBClassifier(n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.8,
                         colsample_bytree=0.8, objective="binary:logistic", eval_metric="logloss",
                         tree_method="hist", n_jobs=-1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--landmarks", required=True)
    ap.add_argument("--labels", required=True)
    ap.add_argument("--sizes", required=True)
    ap.add_argument("--out", default="results_release")
    ap.add_argument("--save", default=str(HERE.parent / "src" / "c2_biomech" / "models" / "release_xgb.json"))
    a = ap.parse_args()

    labels = pd.read_csv(a.labels)
    sizes = pd.read_csv(a.sizes).set_index("clip_id")
    clips = []
    for _, r in labels.iterrows():
        f = Path(a.landmarks) / f"{r.clip_id}.csv"
        if not f.exists() or r.clip_id not in sizes.index:
            print(f"  ! skipped {r.clip_id} (no landmarks or size)")
            continue
        d, usable = app_points(r, pd.read_csv(f), *sizes.loc[r.clip_id, ["width", "height"]])
        X, names = event_ml.features(d.points, d.bowling_arm, d.fps)
        tol = max(1, int(round(d.fps / 60)))
        y = np.zeros(len(X), int)
        y[max(0, int(r.br) - tol): int(r.br) + tol + 1] = 1
        ev, method, _, _ = detect_events(d, None, usable)
        clips.append(dict(r=r, d=d, usable=usable, X=X, y=y, rule=ev["release_frame"]))
    print(f"{len(clips)} deliveries from {len({c['r'].bowler_id for c in clips})} bowlers")

    rows = []
    for b in sorted({c["r"].bowler_id for c in clips}):
        train = [c for c in clips if c["r"].bowler_id != b]
        test = [c for c in clips if c["r"].bowler_id == b]
        Xtr = np.vstack([c["X"] for c in train])
        ytr = np.concatenate([c["y"] for c in train])
        w = np.where(ytr == 1, (ytr == 0).sum() / max(1, ytr.sum()), 1.0)
        m = make_model()
        m.fit(Xtr, ytr, sample_weight=w)
        for c in test:
            pred, conf = event_ml.predict_release(c["d"].points, c["d"].bowling_arm, c["d"].fps, c["usable"], model=m)
            used = pred if pred is not None else c["rule"]
            rows.append(dict(clip_id=c["r"].clip_id, bowler_id=b, fps=c["d"].fps, true=int(c["r"].br),
                             rule=c["rule"], model=pred, confidence=round(conf or 0, 3), app=used))
    res = pd.DataFrame(rows)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    res.to_csv(out / "release_predictions.csv", index=False)

    def score(col, sub):
        e = (sub[col] - sub.true).abs()
        e = e.where(sub[col].notna(), np.nan)
        return dict(n=int(sub[col].notna().sum()), median_frames=float(np.nanmedian(e)),
                    mean_ms=float(np.nanmean(e / sub.fps * 1000)),
                    within_1=float(100 * (e <= 1).mean()), within_2=float(100 * (e <= 2).mean()))

    summary = {name: {m: score(m, sub) for m in ("rule", "model", "app")}
               for name, sub in (("all", res), ("own_bowlers", res[res.bowler_id.isin(["B05", "B07"])]))}
    (out / "release_summary.json").write_text(json.dumps(summary, indent=1))
    for name, s in summary.items():
        print(f"\n{name}")
        for m, v in s.items():
            print(f"  {m:6s} n={v['n']:2d}  median {v['median_frames']:.1f} fr  mean {v['mean_ms']:.0f} ms  "
                  f"within 1 fr {v['within_1']:.0f}%  within 2 fr {v['within_2']:.0f}%")

    Xall = np.vstack([c["X"] for c in clips])
    yall = np.concatenate([c["y"] for c in clips])
    m = make_model()
    m.fit(Xall, yall, sample_weight=np.where(yall == 1, (yall == 0).sum() / max(1, yall.sum()), 1.0))
    save = Path(a.save)
    save.parent.mkdir(parents=True, exist_ok=True)
    m.save_model(str(save))
    save.with_suffix(".meta.json").write_text(json.dumps({
        "trained": pd.Timestamp.now().strftime("%Y-%m-%d"),
        "deliveries": len(clips), "bowlers": len({c["r"].bowler_id for c in clips}),
        "features": names, "leave_one_bowler_out": summary,
    }, indent=1))
    print(f"\nSaved {save}")


if __name__ == "__main__":
    main()
