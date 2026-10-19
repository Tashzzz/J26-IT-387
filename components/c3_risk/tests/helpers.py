"""Test helpers: a tiny model trained on made-up rows, and contract-shaped inputs."""
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

TODAY = date.today()
REPO = Path(__file__).resolve().parents[3]


def build_tiny_model(model_dir: Path, seed: int = 0) -> None:
    """Train the real pipeline (same params, monotone constraints, Platt, thresholds) on 800 made-up rows."""
    from c3_risk import __version__
    from c3_risk.model import RiskModel, sigmoid
    from c3_risk.spec import FEATURE_NAMES, MODALITY_OF
    from c3_risk.train import fit_booster, platt, recall_threshold, _dmatrix

    rng = np.random.default_rng(seed)
    n = 800
    df = pd.DataFrame({
        "scr_mean": rng.normal(28, 10, n), "tlf_mean": rng.normal(38, 7, n), "knee_ffc_mean": rng.normal(28, 9, n),
        "knee_rel_mean": rng.normal(34, 9, n), "deliveries_7d": rng.gamma(4, 30, n), "deliveries_28d_weekly": rng.gamma(5, 22, n),
        "ewma_ratio": rng.normal(1.1, 0.3, n), "differential_load_7d": rng.normal(5, 30, n),
        "bowling_days_7d": rng.integers(0, 7, n), "matches_14d": rng.integers(0, 4, n),
        "max_daily_deliveries_7d": rng.gamma(6, 7, n), "rest_days_7d": rng.integers(0, 5, n),
        "consecutive_bowling_days": rng.integers(0, 5, n), "age": rng.integers(15, 30, n),
        "injuries_12m": rng.poisson(0.3, n), "days_since_return": rng.choice([365, 200, 60, 10], n, p=[.7, .1, .1, .1]),
    })
    df["scr_peak"] = df.scr_mean + rng.gamma(2, 2, n)
    df["scr_slope"] = rng.normal(0.1, 0.3, n)
    df["scr_breach_share"] = (df.scr_mean > 30).astype(float)
    df["tlf_peak"] = df.tlf_mean + rng.gamma(2, 1.5, n)
    df["tlf_slope"] = rng.normal(0.2, 0.3, n)
    df["tlf_breach_share"] = (df.tlf_mean > 40).astype(float)
    df["knee_rel_breach_share"] = (df.knee_rel_mean < 30).astype(float)
    df["acwr_7_28"] = df.deliveries_7d / df.deliveries_28d_weekly
    lvl = rng.choice(3, n)
    df["level_school"], df["level_club"], df["level_higher"] = (lvl == 0) * 1.0, (lvl == 1) * 1.0, (lvl == 2) * 1.0
    df["lumbar_12m"] = (rng.random(n) < 0.1) * 1.0
    df["hamstring_12m"] = (rng.random(n) < 0.1) * 1.0
    df["side_strain_12m"] = (rng.random(n) < 0.05) * 1.0
    df["injuries_6m"] = np.minimum(df.injuries_12m, rng.poisson(0.2, n))
    df["months_since_last_injury"] = np.where(df.injuries_12m > 0, rng.uniform(0, 12, n), 24.0)
    z = (-2.9 + 0.07 * (df.scr_peak - 30) + 0.06 * (df.tlf_mean - 38) + 1.4 * np.clip(df.acwr_7_28 - 1.3, 0, None)
         + 1.2 * (df.days_since_return < 90))
    df["y"] = (rng.random(n) < sigmoid(z)).astype(int)
    df = df[FEATURE_NAMES + ["y"]]
    bst = fit_booster(df.iloc[:600], seed)
    val = df.iloc[600:]
    m = bst.predict(_dmatrix(val), output_margin=True)
    a, b, _ = platt(m, val.y.values)
    alert = recall_threshold(sigmoid(a * m + b), val.y.values)
    base = float(df.y.mean())
    high = max(2 * base, 1.5 * alert)
    card = {
        "model": f"xgboost_fusion_v{__version__}_test", "package_version": __version__, "created": TODAY.isoformat(),
        "synthetic": True, "training_data": {"source": "unit-test rows"}, "features": FEATURE_NAMES,
        "modality": {f: MODALITY_OF[f] for f in FEATURE_NAMES},
        "feature_medians": {f: float(v) for f, v in df[FEATURE_NAMES].median().items()},
        "calibration": {"method": "platt", "a": a, "b": b}, "base_rate": base,
        "thresholds": {"probability": {"alert": alert, "high": high, "critical": max(4 * base, 1.5 * high)},
                       "score": {"medium": 0.3, "high": 0.55, "critical": 0.75}},
        "metrics": {"cv_auc_mean": 0.0, "test": {}},
    }
    RiskModel(bst, card).save(model_dir)


def athlete(code="T01", age=17, level="club", injuries=None):
    return {"bowler_id": code, "birth_year": TODAY.year - age, "playing_level": level,
            "dominant_arm": "right", "injury_history": injuries or []}


def steady_log(overs=6, days=(27, 24, 20, 17, 13, 10, 6, 3), spike_overs=None, spike_days=()):
    log = [{"session_date": (TODAY - timedelta(days=d)).isoformat(), "session_type": "nets", "overs": overs} for d in days]
    log += [{"session_date": (TODAY - timedelta(days=d)).isoformat(), "session_type": "match", "overs": spike_overs}
            for d in spike_days]
    return log


def c2_row(code="T01", n=1, scr=None, tlf=None, knee_ffc=None, knee_rel=None, reliable=True):
    feats = {}
    if scr is not None:
        feats["shoulder_counter_rotation_deg"] = {"value": scr, "threshold": 30.0, "breach": scr > 30, "reliable": reliable}
    if tlf is not None:
        feats["trunk_lateral_flexion_deg"] = {"value": tlf, "threshold": 40.0, "breach": tlf > 40, "reliable": True}
    if knee_ffc is not None:
        feats["front_knee_flexion_ffc_deg"] = {"value": knee_ffc, "threshold": None, "breach": False, "reliable": True}
    if knee_rel is not None:
        feats["front_knee_flexion_release_deg"] = {"value": knee_rel, "threshold": 30.0, "breach": knee_rel < 30, "reliable": True}
    return {"video_id": f"{code}_D{n:02d}_side_10m", "bowler_id": code, "events": {}, "features": feats}
