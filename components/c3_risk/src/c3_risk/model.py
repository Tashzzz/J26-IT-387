"""The trained C3 model: XGBoost on the fused feature row, calibrated, with TreeSHAP.

Files (written by `python -m c3_risk train`, never committed - team rule, no model weights in git):
  models/c3_xgb.json       XGBoost booster
  models/model_card.json   features, calibration, thresholds, metrics, training data

Risk outputs
  probability_28d  calibrated probability of a time-loss injury in the next 28 days
  risk_score       0-1 risk score on the scale the team shares with C4
                   (knowledge_base.json risk_tiers: 0.30 / 0.55 / 0.75), built from the
                   probability with a monotone piecewise-linear map:
                     probability = alert threshold      -> 0.30  (recall-weighted, catches >= 80 % of injuries)
                     probability = 2 x squad base rate  -> 0.55
                     probability = 4 x squad base rate  -> 0.75
  risk_level       contract scale: low (< 0.30) / medium (0.30-0.55) / high (>= 0.55)
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Optional

import numpy as np

from .spec import FEATURE_NAMES, SCORE_CUTS

DEFAULT_MODEL_DIR = Path(os.environ.get("C3_MODEL_DIR", Path(__file__).resolve().parents[2] / "models"))
BOOSTER_FILE, CARD_FILE = "c3_xgb.json", "model_card.json"


class ModelNotReady(RuntimeError):
    """The model files are missing or the ML libraries are not installed."""


def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-z))


def logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def risk_index(p: float, thr: dict) -> float:
    """Monotone piecewise-linear map from probability to the shared 0-1 risk score."""
    xs = [0.0, thr["alert"], thr["high"], thr["critical"], 1.0]
    ys = [0.0, SCORE_CUTS["Moderate"], SCORE_CUTS["High"], SCORE_CUTS["Critical"], 1.0]
    return float(np.interp(p, xs, ys))


def level_of(score: float) -> str:
    return "high" if score >= SCORE_CUTS["High"] else "medium" if score >= SCORE_CUTS["Moderate"] else "low"


def tier_of(score: float) -> str:
    """Same 4 tiers and cut-offs as C4 (knowledge_base.json risk_tiers)."""
    if score >= SCORE_CUTS["Critical"]:
        return "Critical"
    if score >= SCORE_CUTS["High"]:
        return "High"
    return "Moderate" if score >= SCORE_CUTS["Moderate"] else "Low"


class RiskModel:
    def __init__(self, booster, card: dict):
        self.booster = booster
        self.card = card
        self.features = card["features"]
        if self.features != FEATURE_NAMES:
            raise ModelNotReady("The saved model was trained with a different feature list - retrain it "
                                "with `python -m c3_risk train`.")
        self.a, self.b = card["calibration"]["a"], card["calibration"]["b"]
        self.thr = card["thresholds"]["probability"]
        self.base_rate = card["base_rate"]
        self.version = card["model"]

    # ----------------------------------------------------------------- io
    @classmethod
    def load(cls, model_dir: Optional[Path] = None) -> "RiskModel":
        model_dir = Path(model_dir or DEFAULT_MODEL_DIR)
        booster_path, card_path = model_dir / BOOSTER_FILE, model_dir / CARD_FILE
        if not booster_path.exists() or not card_path.exists():
            raise ModelNotReady(
                "The C3 risk model has not been trained on this computer yet. From components/c3_risk run: "
                "python -m c3_risk train --data <folder with the synthetic data>  (see components/c3_risk/README.md).")
        try:
            import xgboost as xgb
        except ImportError as e:  # pragma: no cover - depends on the environment
            raise ModelNotReady("xgboost is not installed - run: pip install -e components/c3_risk") from e
        booster = xgb.Booster()
        booster.load_model(str(booster_path))
        return cls(booster, json.loads(card_path.read_text(encoding="utf-8")))

    def save(self, model_dir: Path) -> None:
        model_dir.mkdir(parents=True, exist_ok=True)
        self.booster.save_model(str(model_dir / BOOSTER_FILE))
        (model_dir / CARD_FILE).write_text(json.dumps(self.card, indent=2), encoding="utf-8")

    # ------------------------------------------------------------ predict
    def _matrix(self, rows: list[dict]):
        import xgboost as xgb
        X = np.array([[np.nan if r.get(f) is None else float(r[f]) for f in self.features] for r in rows], dtype=float)
        return xgb.DMatrix(X, feature_names=self.features, missing=np.nan)

    def margin(self, rows: list[dict]) -> np.ndarray:
        return self.booster.predict(self._matrix(rows), output_margin=True)

    def probability(self, rows: list[dict]) -> np.ndarray:
        return sigmoid(self.a * self.margin(rows) + self.b)

    def explain_row(self, row: dict) -> dict:
        """Probability, score and exact TreeSHAP values for one row.

        SHAP values are rescaled by the Platt slope, so they are in calibrated log-odds and
        add up exactly to logit(probability): base_logodds + sum(phi) = logit(p).
        """
        raw = self.booster.predict(self._matrix([row]), pred_contribs=True)[0]
        phi = raw[:-1] * self.a
        base = float(raw[-1] * self.a + self.b)
        z = base + float(phi.sum())
        p = float(sigmoid(z))
        return {"probability": p, "logodds": z, "base_logodds": base, "base_probability": float(sigmoid(base)),
                "phi": dict(zip(self.features, phi.astype(float).tolist()))}

    def score(self, p: float) -> float:
        return risk_index(p, self.thr)

    def score_slope(self, p: float, p0: float) -> float:
        """Secant slope d(score)/d(logodds) between the base risk and this bowler's risk.

        Multiplying log-odds SHAP values by it gives contributions in risk-score units that add
        up exactly to score(p) - score(p0), keep each factor's sign and ranking, and stay inside
        the +-1 range C4 validates.
        """
        z, z0 = float(logit(p)), float(logit(p0))
        if abs(z - z0) > 1e-6:
            return (self.score(p) - self.score(p0)) / (z - z0)
        eps = 1e-4
        return (self.score(float(sigmoid(z + eps))) - self.score(float(sigmoid(z - eps)))) / (2 * eps)

    @property
    def alert_score(self) -> float:
        return SCORE_CUTS["Moderate"]


_cached: Optional[RiskModel] = None
_cached_mtime: Optional[float] = None


def get_model(model_dir: Optional[Path] = None) -> RiskModel:
    """Load once; reload automatically if the model files are retrained."""
    global _cached, _cached_mtime
    model_dir = Path(model_dir or DEFAULT_MODEL_DIR)
    card = model_dir / CARD_FILE
    mtime = card.stat().st_mtime if card.exists() else None
    if _cached is None or mtime != _cached_mtime or mtime is None:
        _cached = RiskModel.load(model_dir)
        _cached_mtime = mtime
    return _cached


def reset_cache() -> None:
    global _cached, _cached_mtime
    _cached, _cached_mtime = None, None


def is_nan(v) -> bool:
    return v is None or (isinstance(v, float) and math.isnan(v))
