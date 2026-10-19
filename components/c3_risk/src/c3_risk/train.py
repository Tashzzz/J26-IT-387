"""Train the C3 risk model on the synthetic development dataset.

The synthetic dataset (scripts/generate_synthetic.py, or the shared cricshield_synthetic_v1.zip)
is first converted into the SAME shapes the real system receives:
  * C2 rows       one per delivery, C2 feature names, with a random number of analysed
                  deliveries per session (1-12) and random missing features (camera views
                  where C2 cannot measure an angle),
  * workload log  C4 session shape (date, nets/training/match, overs, rpe),
  * profile       C4 athlete shape (birth year, level, injury history with dates).
Features are then computed with c3_risk.features - the code the API uses.

Protocol (same as the research notebook)
  * bowler-level split from the dataset: train / val / test (no bowler in two parts)
  * 5-fold StratifiedGroupKFold on train+val -> AUC / PR-AUC mean +- SD
  * XGBoost (additive, monotone, class-weighted) fitted on train
  * Platt calibration + recall-weighted alert threshold (recall >= 0.80) on val
  * held-out test evaluated once, 95 % CI by bowler-level bootstrap

Usage (from components/c3_risk):
  python -m c3_risk train --data ../../data/c3_synthetic/data
"""
from __future__ import annotations

import json
import math
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from . import __version__
from .features import build_features
from .model import DEFAULT_MODEL_DIR, RiskModel, logit, sigmoid
from .spec import FEATURE_NAMES, MODALITIES, MODALITY_OF, MONOTONE

SEASON_START = date(2026, 1, 5)
TARGET_RECALL = 0.80
# max_depth=1 -> an additive model: each factor's SHAP value depends only on that factor's own
# value (no hidden interactions), and with the monotone constraints it always points the
# clinically agreed way. It also scored best in grouped CV (0.767 vs 0.753 for depth 2).
XGB_PARAMS = dict(max_depth=1, eta=0.03, subsample=0.7, colsample_bytree=0.6, min_child_weight=25,
                  reg_lambda=10.0, gamma=1.0, objective="binary:logistic", eval_metric="logloss",
                  monotone_constraints="(" + ",".join(str(MONOTONE.get(f, 0)) for f in FEATURE_NAMES) + ")")
N_ROUNDS = 250
AUGMENT = 3               # training copies per session (different delivery subsets)
P_DROP_FEATURE = 0.15     # chance a C2 feature is missing for a whole session
P_SHORT_LOG = 0.12        # chance the workload log only covers the last 7-20 days
SITE = {"lumbar_bone_stress": "lumbar", "hamstring_strain": "hamstring", "side_strain": "side_strain"}
LEVEL = {"school": "school", "club": "club", "academy": "provincial"}


# ---------------------------------------------------------------------------
# Synthetic dataset -> contract shapes
# ---------------------------------------------------------------------------
class SyntheticSource:
    def __init__(self, data_dir: Path, seed: int = 2026):
        d = Path(data_dir)
        need = ["athletes.csv", "workload_daily.csv", "injuries.csv", "spells.csv", "deliveries.csv"]
        missing = [n for n in need if not (d / n).exists()]
        if missing:
            raise FileNotFoundError(f"{d} is missing {', '.join(missing)} - point --data at the folder that holds "
                                    "the synthetic CSV files (cricshield_synthetic_v1/data).")
        self.athletes = pd.read_csv(d / "athletes.csv").set_index("bowler_id")
        self.work = pd.read_csv(d / "workload_daily.csv", parse_dates=["date"])
        self.inj = pd.read_csv(d / "injuries.csv", parse_dates=["onset_date", "return_date"])
        self.spells = pd.read_csv(d / "spells.csv", parse_dates=["screen_date"])
        self.deliv = pd.read_csv(d / "deliveries.csv")
        self.rng = np.random.default_rng(seed)
        self._sessions = {b: self._sessions_for(g) for b, g in self.work.groupby("bowler_id")}
        self._pre = {b: self._preseason_injuries(b, r) for b, r in self.athletes.iterrows()}
        self._deliv = {s: g.sort_values("delivery_no") for s, g in self.deliv.groupby("spell_id")}

    @staticmethod
    def _sessions_for(g: pd.DataFrame) -> list[dict]:
        out = []
        for r in g.itertuples():
            if r.session_type == "rest":
                continue
            kind = "match" if r.session_type == "match" else "nets" if "nets" in r.session_type else "training"
            out.append({"session_date": r.date.date(), "session_type": kind, "overs": round(r.deliveries / 6, 2),
                        "rpe": None if pd.isna(r.srpe) else int(r.srpe)})
        return out

    def _preseason_injuries(self, bowler: str, r) -> list[dict]:
        """Rebuild dated injuries from the pre-season flags (all within 12 months before the season)."""
        sites = [s for s, k in (("lumbar", "prior_lumbar_12m"), ("hamstring", "prior_hamstring_12m"),
                                ("side_strain", "prior_side_strain_12m")) if r[k]]
        sites += ["other"] * max(0, int(r["prior_injury_count_12m"]) - len(sites))
        if not sites:
            return []
        months = r["months_since_last_injury"] if not pd.isna(r["months_since_last_injury"]) else 6.0
        latest = SEASON_START - timedelta(days=int(months * 30.44))
        order = list(self.rng.permutation(len(sites)))
        out = []
        for j, idx in enumerate(order):
            d = latest if j == 0 else SEASON_START - timedelta(days=int(self.rng.uniform(months * 30.44, 360)))
            out.append({"site": sites[idx], "injury_date": d, "returned_to_play": True})
        return out

    def athlete(self, bowler: str, as_of: date) -> dict:
        r = self.athletes.loc[bowler]
        hist = list(self._pre[bowler])
        for i in self.inj[(self.inj.bowler_id == bowler) & (self.inj.onset_date.dt.date < as_of)].itertuples():
            hist.append({"site": SITE[i.injury_type], "injury_date": i.onset_date.date(),
                         "returned_to_play": as_of >= i.return_date.date()})
        return {"bowler_id": bowler, "birth_year": int(round(SEASON_START.year - r.age_at_season_start)),
                "playing_level": LEVEL.get(r.level, "club"), "injury_history": hist}

    def workloads(self, bowler: str, as_of: date, short: bool = False) -> list[dict]:
        s = [w for w in self._sessions[bowler] if w["session_date"] <= as_of]
        if short:
            keep = int(self.rng.integers(7, 21))
            s = [w for w in s if (as_of - w["session_date"]).days < keep]
        return s

    def c2_rows(self, spell_id: str, bowler: str) -> list[dict]:
        g = self._deliv[spell_id]
        k = int(self.rng.integers(1, len(g) + 1))
        pick = g.iloc[np.sort(self.rng.choice(len(g), size=k, replace=False))]
        drop = {name for name in ("shoulder_counter_rotation_deg", "trunk_lateral_flexion_deg",
                                  "front_knee_flexion_ffc_deg", "front_knee_flexion_release_deg")
                if self.rng.random() < P_DROP_FEATURE}
        rows = []
        for r in pick.itertuples():
            feats = {
                "shoulder_counter_rotation_deg": {"value": r.shoulder_counter_rotation_deg, "threshold": 30.0,
                                                  "breach": r.shoulder_counter_rotation_deg > 30, "reliable": True},
                "trunk_lateral_flexion_deg": {"value": r.lateral_flexion_at_br_deg, "threshold": 40.0,
                                              "breach": r.lateral_flexion_at_br_deg > 40, "reliable": True},
                "front_knee_flexion_ffc_deg": {"value": r.front_knee_flexion_ffc_deg, "threshold": None,
                                               "breach": False, "reliable": True},
                "front_knee_flexion_release_deg": {"value": r.front_knee_flexion_br_deg, "threshold": 30.0,
                                                   "breach": r.front_knee_flexion_br_deg < 30, "reliable": True},
            }
            rows.append({"video_id": f"{bowler}_D{int(r.delivery_no):02d}_side_10m", "bowler_id": bowler,
                         "features": {k_: v for k_, v in feats.items() if k_ not in drop}})
        return rows

    def table(self, copies_for: dict[str, int]) -> pd.DataFrame:
        """One feature row per (spell, copy). copies_for: split name -> number of copies."""
        rows = []
        for s in self.spells.itertuples():
            n = copies_for.get(s.split, 1)
            as_of = s.screen_date.date()
            athlete = self.athlete(s.bowler_id, as_of)
            full_log = self.workloads(s.bowler_id, as_of)
            for c in range(n):
                short = self.rng.random() < P_SHORT_LOG
                log = self.workloads(s.bowler_id, as_of, short=True) if short else full_log
                feats, _, _ = build_features(self.c2_rows(s.spell_id, s.bowler_id), log, athlete, as_of)
                rows.append({"spell_id": s.spell_id, "bowler_id": s.bowler_id, "split": s.split, "copy": c,
                             "y": int(s.injury_28d), **feats})
        return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Training helpers
# ---------------------------------------------------------------------------
def _dmatrix(df: pd.DataFrame, weight: Optional[np.ndarray] = None):
    import xgboost as xgb
    return xgb.DMatrix(df[FEATURE_NAMES].astype(float).values, label=df["y"].values if "y" in df else None,
                       weight=weight, feature_names=FEATURE_NAMES, missing=np.nan)


def fit_booster(df: pd.DataFrame, seed: int = 0):
    import xgboost as xgb
    y = df["y"].values
    spw = (y == 0).sum() / max(1, y.sum())
    return xgb.train({**XGB_PARAMS, "scale_pos_weight": spw, "seed": seed}, _dmatrix(df), num_boost_round=N_ROUNDS)


def platt(margin: np.ndarray, y: np.ndarray) -> tuple[float, float, bool]:
    """Logistic calibration with a positive-slope guard (a noisy fit must never reverse the ranking)."""
    from sklearn.linear_model import LogisticRegression
    lr = LogisticRegression(C=100.0, max_iter=1000).fit(margin.reshape(-1, 1), y)
    a, b = float(lr.coef_[0, 0]), float(lr.intercept_[0])
    if a < 0.05:
        return 1.0, float(logit(np.array([y.mean()]))[0] - np.median(margin)), True
    return a, b, False


def recall_threshold(p: np.ndarray, y: np.ndarray, target: float = TARGET_RECALL) -> float:
    pos = np.sort(p[y == 1])[::-1]
    return float(pos[max(0, math.ceil(target * len(pos)) - 1)]) if len(pos) else 0.5


def metrics_at(y: np.ndarray, p: np.ndarray, thr: float) -> dict:
    from sklearn.metrics import average_precision_score, f1_score, precision_score, recall_score, roc_auc_score
    yhat = (p >= thr).astype(int)
    return {"auc": float(roc_auc_score(y, p)), "pr_auc": float(average_precision_score(y, p)),
            "recall": float(recall_score(y, yhat, zero_division=0)),
            "precision": float(precision_score(y, yhat, zero_division=0)),
            "f1": float(f1_score(y, yhat, zero_division=0)), "flagged_share": float(yhat.mean())}


def train(data_dir: Path, out_dir: Optional[Path] = None, seed: int = 2026, n_boot: int = 1000,
          experiments_dir: Optional[Path] = None, verbose: bool = True) -> dict:
    from sklearn.metrics import average_precision_score, roc_auc_score
    from sklearn.model_selection import StratifiedGroupKFold

    log = print if verbose else (lambda *a, **k: None)
    out_dir = Path(out_dir or DEFAULT_MODEL_DIR)
    src = SyntheticSource(Path(data_dir), seed)
    log("Building feature rows from contract-shaped inputs ...")
    df = src.table({"train": AUGMENT, "val": AUGMENT, "test": 1})
    one = df[df["copy"] == 0].reset_index(drop=True)            # one copy per session for evaluation
    log(f"  {one.spell_id.nunique()} sessions, {one.bowler_id.nunique()} bowlers, {int(one.y.sum())} positive "
        f"({one.y.mean():.1%}); {len(df)} rows incl. augmented copies")

    # ---- 5-fold grouped CV on train+val ------------------------------------
    dev = one[one.split.isin(["train", "val"])].reset_index(drop=True)
    cv_auc, cv_pr = [], []
    for k, (a, b) in enumerate(StratifiedGroupKFold(5, shuffle=True, random_state=seed)
                               .split(dev, dev.y, dev.bowler_id)):
        tr_b = set(dev.bowler_id.iloc[a])
        tr = df[df.bowler_id.isin(tr_b) & df.split.isin(["train", "val"])]
        bst = fit_booster(tr, seed + k)
        m = bst.predict(_dmatrix(dev.iloc[b]), output_margin=True)
        cv_auc.append(float(roc_auc_score(dev.y.iloc[b], m)))
        cv_pr.append(float(average_precision_score(dev.y.iloc[b], m)))
    log(f"  CV AUC {np.mean(cv_auc):.3f} ± {np.std(cv_auc):.3f}")

    # ---- final fit on train, calibrate + threshold on val --------------------
    bst = fit_booster(df[df.split == "train"], seed)
    val = one[one.split == "val"]
    a_, b_, fallback = platt(bst.predict(_dmatrix(val), output_margin=True), val.y.values)
    p_val = sigmoid(a_ * bst.predict(_dmatrix(val), output_margin=True) + b_)
    alert = recall_threshold(p_val, val.y.values)
    base_rate = float(dev.y.mean())
    high = max(2 * base_rate, 1.5 * alert)
    critical = max(4 * base_rate, 1.5 * high)
    thr = {"alert": alert, "high": high, "critical": critical}

    # ---- held-out test -----------------------------------------------------
    test = one[one.split == "test"].reset_index(drop=True)
    p_te = sigmoid(a_ * bst.predict(_dmatrix(test), output_margin=True) + b_)
    test_m = metrics_at(test.y.values, p_te, alert)
    rng = np.random.default_rng(seed)
    bowlers = test.bowler_id.unique()
    rows_of = {b: np.where(test.bowler_id.values == b)[0] for b in bowlers}
    boot = []
    for _ in range(n_boot):
        idx = np.concatenate([rows_of[b] for b in rng.choice(bowlers, len(bowlers))])
        if 0 < test.y.values[idx].sum() < len(idx):
            boot.append(metrics_at(test.y.values[idx], p_te[idx], alert))
    ci = {k: [float(np.quantile([x[k] for x in boot], 0.025)), float(np.quantile([x[k] for x in boot], 0.975))]
          for k in ("auc", "recall", "precision", "f1")}
    log(f"  test AUC {test_m['auc']:.3f} [{ci['auc'][0]:.2f}–{ci['auc'][1]:.2f}], recall {test_m['recall']:.2f}, "
        f"precision {test_m['precision']:.2f} at alert probability {alert:.3f}")

    # ---- global SHAP share by modality (test) --------------------------------
    contrib = bst.predict(_dmatrix(test), pred_contribs=True)[:, :-1]
    mod_share = {m: float(np.abs(contrib[:, [i for i, f in enumerate(FEATURE_NAMES) if MODALITY_OF[f] == m]].sum(1)).mean())
                 for m in MODALITIES}
    tot = sum(mod_share.values())
    mod_share = {m: round(v / tot, 3) for m, v in mod_share.items()}

    train_rows = df[df.split == "train"]
    card = {
        "model": f"xgboost_fusion_v{__version__}_synthetic",
        "package_version": __version__,
        "created": date.today().isoformat(),
        "synthetic": True,
        "training_data": {"source": str(Path(data_dir).name), "sessions": int(one.spell_id.nunique()),
                          "bowlers": int(one.bowler_id.nunique()), "positive_rate": round(float(one.y.mean()), 4),
                          "label": "time-loss injury onset within 28 days of the session",
                          "augmentation": f"{AUGMENT} delivery subsets per training session; "
                                          f"{P_DROP_FEATURE:.0%} missing C2 features; {P_SHORT_LOG:.0%} short logs"},
        "features": FEATURE_NAMES,
        "modality": {f: MODALITY_OF[f] for f in FEATURE_NAMES},
        "feature_medians": {f: (None if pd.isna(v) else float(v)) for f, v in train_rows[FEATURE_NAMES].median().items()},
        "xgb_params": {**XGB_PARAMS, "num_boost_round": N_ROUNDS, "class_weighting": "scale_pos_weight"},
        "calibration": {"method": "platt", "a": a_, "b": b_, "slope_fallback_used": fallback},
        "base_rate": base_rate,
        "thresholds": {
            "probability": thr,
            "score": {"medium": 0.30, "high": 0.55, "critical": 0.75},
            "rule": "alert = lowest probability that still flags >= 80% of injured validation sessions; "
                    "high = 2 x squad base rate; critical = 4 x squad base rate (each at least 1.5 x the previous)",
        },
        "metrics": {
            "cv_auc_mean": float(np.mean(cv_auc)), "cv_auc_sd": float(np.std(cv_auc)),
            "cv_pr_auc_mean": float(np.mean(cv_pr)), "cv_folds": cv_auc,
            "test": test_m, "test_ci95": ci, "test_sessions": int(len(test)),
            "test_bowlers": int(len(bowlers)), "test_positive_sessions": int(test.y.sum()),
            "shap_modality_share_test": mod_share,
        },
    }
    model = RiskModel(bst, card)
    model.save(out_dir)
    log(f"Saved model to {out_dir}")

    if experiments_dir:
        experiments_dir = Path(experiments_dir)
        experiments_dir.mkdir(parents=True, exist_ok=True)
        (experiments_dir / "c3_xgb_fusion_metrics.json").write_text(
            json.dumps({k: card[k] for k in ("model", "created", "training_data", "thresholds", "metrics", "base_rate")},
                       indent=2), encoding="utf-8")
        md = [
            f"# C3 backend model – {card['model']}",
            "",
            f"Trained {card['created']} on **synthetic** data ({card['training_data']['sessions']} sessions, "
            f"{card['training_data']['bowlers']} bowlers, {card['training_data']['positive_rate']:.1%} positive). "
            "Features are computed from contract-shaped inputs (C2 rows, C4 profile and workload log).",
            "",
            "| Metric | Value |",
            "|---|---|",
            f"| 5-fold grouped CV AUC (train+val) | {np.mean(cv_auc):.3f} ± {np.std(cv_auc):.3f} |",
            f"| Test AUC (95% CI, bowler bootstrap) | {test_m['auc']:.3f} [{ci['auc'][0]:.2f}–{ci['auc'][1]:.2f}] |",
            f"| Test recall at alert threshold | {test_m['recall']:.2f} [{ci['recall'][0]:.2f}–{ci['recall'][1]:.2f}] |",
            f"| Test precision at alert threshold | {test_m['precision']:.2f} [{ci['precision'][0]:.2f}–{ci['precision'][1]:.2f}] |",
            f"| Test F1 | {test_m['f1']:.2f} |",
            f"| Share of test sessions flagged | {test_m['flagged_share']:.0%} |",
            f"| Alert / high / critical probability | {alert:.3f} / {high:.3f} / {critical:.3f} |",
            f"| SHAP share technique / workload / history | {mod_share['kinematics']:.0%} / {mod_share['workload']:.0%} / {mod_share['metadata']:.0%} |",
            "",
            f"Test set: {len(test)} sessions from {len(bowlers)} held-out bowlers ({int(test.y.sum())} positive) – small, so read the CIs.",
            "Synthetic data: these numbers show the pipeline works; they are not evidence about real bowlers.",
        ]
        (experiments_dir / "c3_xgb_fusion_metrics.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    return card
