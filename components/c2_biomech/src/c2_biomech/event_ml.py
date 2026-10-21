"""Ball release from a trained XGBoost model (works on C1's hip-centred keypoints).

The rule in events.py (first strong arm peak) is kept as the fallback. The model looks at a
short window of movement around every frame - bowling wrist and elbow height, wrist speed,
shoulder tilt and both feet relative to the hips, all divided by the trunk length - and
scores how likely that frame is the release. The highest-scoring usable frame is the release.

Trained by components/c2_biomech/event_model/train_release_c1format.py on hand-labelled
deliveries converted to exactly the format C1 sends (hip-centred, scaled by shoulder width)
and passed through the same C2 quality gate and Butterworth filter, so training and app input
match. Results and limits: event_model/models/README.md.

Turn it off with the environment variable C2_RELEASE_MODEL=off (then the rule is used).
If xgboost is not installed or the model file is missing, the rule is used as well.
"""

import json
import os
from functools import lru_cache
from pathlib import Path

import numpy as np

from . import keypoints as kp

MODEL_PATH = Path(__file__).parent / "models" / "release_xgb.json"
OFFSETS_MS = (-100, -66, -33, -17, 0, 17, 33, 66, 100)
MIN_CONFIDENCE = 0.2   # below this the model is not sure -> use the rule


def enabled():
    return os.environ.get("C2_RELEASE_MODEL", "on").lower() not in ("off", "0", "false", "no")


def _grad(x, fps):
    x = np.asarray(x, float)
    if len(x) < 2:
        return np.zeros_like(x)
    return np.gradient(x) * fps


def frame_signals(points, bowling_arm, fps):
    """Per-frame signals (frames, n_signals) from hip-centred keypoints, y pointing down."""
    from .events import arm_elevation

    P = np.asarray(points, float)
    s = kp.sides(bowling_arm)
    mid_sh = (P[:, kp.LEFT_SHOULDER, :2] + P[:, kp.RIGHT_SHOULDER, :2]) / 2
    mid_hip = (P[:, kp.LEFT_HIP, :2] + P[:, kp.RIGHT_HIP, :2]) / 2
    trunk = np.linalg.norm(mid_sh - mid_hip, axis=1)
    scale = np.nanmedian(trunk) if np.isfinite(trunk).any() else 1.0
    scale = scale if scale and scale > 1e-6 else 1.0

    elbow = kp.RIGHT_ELBOW if bowling_arm == "right" else kp.LEFT_ELBOW
    wrist, back_sh, front_sh = s["wrist"], s["back_shoulder"], s["front_shoulder"]
    elev = arm_elevation(P, bowling_arm)
    top = np.nanmax(elev) if np.isfinite(elev).any() else np.nan

    wx, wy = P[:, wrist, 0] / scale, P[:, wrist, 1] / scale
    cols = {
        "elev": elev,
        "elev_rel": elev / top if top and np.isfinite(top) and top > 0 else np.full(len(P), np.nan),
        "wrist_x": wx, "wrist_y": wy,
        "wrist_vx": _grad(wx, fps), "wrist_vy": _grad(wy, fps),
        "elbow_y": P[:, elbow, 1] / scale,
        "shoulder_tilt": (P[:, back_sh, 1] - P[:, front_sh, 1]) / scale,
    }
    cols["wrist_speed"] = np.hypot(cols["wrist_vx"], cols["wrist_vy"])
    for name in ("front", "back"):
        ax, ay = P[:, s[f"{name}_ankle"], 0] / scale, P[:, s[f"{name}_ankle"], 1] / scale
        cols[f"{name}_ankle_x"], cols[f"{name}_ankle_y"] = ax, ay
        cols[f"{name}_ankle_vx"], cols[f"{name}_ankle_vy"] = _grad(ax, fps), _grad(ay, fps)
    names = list(cols)
    return np.column_stack([cols[c] for c in names]), names


def window_features(signals, names, fps):
    """Stack every signal at fixed time offsets around each frame -> (frames, n_features)."""
    n = len(signals)
    blocks, feat_names = [], []
    for ms in OFFSETS_MS:
        k = int(round(ms / 1000 * fps))
        idx = np.clip(np.arange(n) + k, 0, n - 1)
        blocks.append(signals[idx])
        feat_names += [f"{c}@{ms}" for c in names]
    return np.hstack(blocks), feat_names


def features(points, bowling_arm, fps):
    sig, names = frame_signals(points, bowling_arm, fps)
    return window_features(sig, names, fps)


@lru_cache(maxsize=1)
def _load():
    if not MODEL_PATH.exists():
        return None
    try:
        import xgboost as xgb
    except ImportError:
        return None
    model = xgb.Booster()          # core API: no scikit-learn needed in the backend
    model.load_model(str(MODEL_PATH))
    meta_path = MODEL_PATH.with_suffix(".meta.json")
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    return model, meta


def available():
    return enabled() and _load() is not None


def release_scores(points, bowling_arm, fps, model=None):
    """Probability per frame that it is the release (or None when no model)."""
    if model is None:
        loaded = _load()
        if loaded is None:
            return None
        model = loaded[0]
    X, _ = features(points, bowling_arm, fps)
    if hasattr(model, "predict_proba"):      # scikit-learn wrapper (training script)
        return model.predict_proba(X)[:, 1]
    import xgboost as xgb
    return model.predict(xgb.DMatrix(X))     # Booster: binary:logistic -> probability


def predict_release(points, bowling_arm, fps, usable=None, model=None):
    """Return (frame, confidence) or (None, best_confidence) when the model is unsure / off."""
    if model is None and not enabled():
        return None, None
    p = release_scores(points, bowling_arm, fps, model)
    if p is None:
        return None, None
    p = np.array(p, float)
    if usable is not None:
        p[~np.asarray(usable, bool)] = -1
    i = int(np.argmax(p))
    conf = float(p[i])
    return (i, conf) if conf >= MIN_CONFIDENCE else (None, conf)
