"""
Ground-truth injury hazard for the C3 synthetic cohort ("oracle").

Why
    If a plan chosen with C3's model is also *scored* with C3's model, the evaluation grades
    its own homework. The synthetic cohort that C3 is trained on was generated from a known,
    documented hazard model (components/c3_risk/scripts/generate_synthetic.py, COEF). This module
    re-computes that TRUE daily injury probability for any planned delivery series, so every
    policy (usual week, C4 rules, C4 what-if) is judged against the same ground truth that
    produced the injuries C3 learned from.

What it reproduces (per bowler, per day t, per injury type k)
    logit_k(t) = intercept_k + technique_k + workload_k(t) + interaction_k(t) + host_k + frailty
    p_k(t)     = sigmoid(logit_k(t)) * min(1.6, deliveries(t) / 36)     (0 on non-bowling days)
    risk       = 1 - prod_t prod_k (1 - p_k(t))      over the evaluation window

    * workload and interaction terms are recomputed from the delivery series (acute / chronic
      load, ACWR, smoothed week-to-week change, 3+ days in a row, match day, fatigue x load)
    * technique and host terms are taken from ground_truth_spells.csv at the screening date
      and held fixed over the window (technique drift over 4 weeks is small in the generator)
    * the shoulder z-score needed by the "mixed action x spike" interaction is solved from the
      recorded technique terms (two linear equations, two unknowns)

`check()` verifies the reproduction against the generator's own recorded terms.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

INJ = {"lumbar": "lumbar_bone_stress", "hamstring": "hamstring_strain", "side": "side_strain"}
COEF_W = {   # workload + interaction coefficients (generate_synthetic.COEF)
    "lumbar": {"acwr_spike": 1.10, "high_acute": 0.70, "high_chronic": 0.60, "low_chronic": 0.40, "consec3": 0.40},
    "hamstring": {"acwr_spike": 1.50, "high_acute": 0.80, "low_chronic": 0.70, "diff_load_pos": 0.60,
                  "match_day": 0.50, "consec3": 0.50},
    "side": {"acwr_spike": 0.80, "high_acute": 0.50},
}
COEF_I = {"lumbar": {"scr_pos_x_spike": 1.25, "fatigue_x_load": 0.90},
          "hamstring": {"fatigue_x_load": 0.75}, "side": {"fatigue_x_load": 0.75}}


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


class Oracle:
    def __init__(self, data_dir: Path):
        d = Path(data_dir)
        cfg = json.loads((d / "generation_config.json").read_text())
        self.intercept = {s: cfg["calibrated_intercepts"][k] for s, k in INJ.items()}
        self.gt = pd.read_csv(d / "ground_truth_spells.csv").set_index("spell_id")
        work = pd.read_csv(d / "workload_daily.csv")
        self.season_start = pd.Timestamp(cfg["season_start"]).date()
        self.deliv = {b: g.sort_values("day")["deliveries"].to_numpy(float) for b, g in work.groupby("bowler_id")}
        self.kind = {b: g.sort_values("day")["session_type"].to_numpy(str) for b, g in work.groupby("bowler_id")}
        # bowler-level latents -> standardised latflex velocity (population z, as in the generator)
        bl = self.gt.drop_duplicates("bowler_id").set_index("bowler_id")
        v = bl["true_latflex_vel"]
        self.lfv_z = ((v - v.mean()) / v.std()).to_dict()

    # --------------------------------------------------------------- helpers
    def day_of(self, d) -> int:
        return (d - self.season_start).days

    def _scr_z(self, g) -> float:
        hss_z = (g.true_hss - 25) / 7
        lf_z = (g.gt_side_technique - 1.10 * self.lfv_z[g.bowler_id] - 0.75 * hss_z) / 1.25
        ext_z = (g.true_trunk_ext - 12) / 5
        knee_z = (g.true_knee_ffc - 28) / 10
        return (g.gt_lumbar_technique - 1.10 * lf_z - 0.75 * ext_z - 0.50 * hss_z + 0.30 * knee_z) / 1.40

    @staticmethod
    def drivers(deliv: np.ndarray, match: np.ndarray, start: int, end: int) -> dict[str, np.ndarray]:
        """Workload drivers for days start..end (inclusive), recomputed from day 0 like the generator."""
        n = end + 1
        out = {k: np.zeros(n - start) for k in ("acwr", "acwr_spike", "high_acute", "high_chronic", "low_chronic",
                                                 "diff_load_pos", "consec3", "match_day", "d")}
        diff, consec = 0.0, 0
        for t in range(n):
            acute = deliv[max(0, t - 6): t + 1].sum()
            if t >= 27:
                chronic = deliv[t - 27: t + 1].sum() / 4
            elif t >= 6:
                chronic = deliv[: t + 1].sum() / ((t + 1) / 7)
            else:
                chronic = 60.0
            acwr = acute / max(chronic, 40.0)
            prev = deliv[max(0, t - 13): max(0, t - 6)].sum()
            diff = diff + (2 / 8) * ((acute - prev) - diff)
            consec = consec + 1 if deliv[t] > 0 else 0
            if t >= start:
                i = t - start
                out["acwr"][i] = acwr
                out["acwr_spike"][i] = max(0.0, acwr - 1.3)
                out["high_acute"][i] = max(0.0, acute - 170) / 60
                out["high_chronic"][i] = max(0.0, chronic - 130) / 40
                out["low_chronic"][i] = max(0.0, 60 - chronic) / 30
                out["diff_load_pos"][i] = max(0.0, diff) / 40
                out["consec3"][i] = float(consec >= 3)
                out["match_day"][i] = float(match[t])
                out["d"][i] = deliv[t]
        return out

    # --------------------------------------------------------------- main API
    def risk(self, spell_id: str, plan_deliveries: list[float], plan_match: list[bool],
             horizon: int = 28) -> dict:
        """True injury probability over `horizon` days after the screening date.

        plan_deliveries / plan_match: the days after screening (any length <= horizon); days
        beyond the plan must be supplied by the caller (e.g. the usual week repeated).
        """
        g = self.gt.loc[spell_id]
        b = g.bowler_id
        t0 = int(self._screen_day[spell_id]) if hasattr(self, "_screen_day") else None
        if t0 is None:
            raise RuntimeError("call set_screen_days first")
        hist = self.deliv[b][: t0 + 1]
        hist_match = self.kind[b][: t0 + 1] == "match"
        deliv = np.concatenate([hist, np.asarray(plan_deliveries[:horizon], float)])
        match = np.concatenate([hist_match, np.asarray(plan_match[:horizon], bool)])
        dr = self.drivers(deliv, match, t0 + 1, t0 + horizon)
        fat_z = np.log(g.true_fatigue_k) / 0.45
        scr_z = self._scr_z(g)
        expo = np.where(dr["d"] > 0, np.minimum(1.6, dr["d"] / 36), 0.0)
        surv = np.ones_like(expo)
        per_type = {}
        for s in INJ:
            wl = sum(c * dr[n] for n, c in COEF_W[s].items())
            inter = COEF_I[s].get("fatigue_x_load", 0) * fat_z * np.maximum(0.0, dr["acwr"] - 1.0)
            if s == "lumbar":
                inter = inter + 1.25 * max(0.0, scr_z) * dr["acwr_spike"]
            logit = self.intercept[s] + g[f"gt_{s}_technique"] + g[f"gt_{s}_host"] + wl + inter + g.true_frailty
            p = sigmoid(logit) * expo
            per_type[s] = float(1 - np.prod(1 - p))
            surv *= (1 - p)
        daily = 1 - surv
        return {"risk": float(1 - np.prod(surv)), "risk_week1": float(1 - np.prod(surv[:7])),
                "per_type": per_type, "daily": daily}

    def set_screen_days(self, spells: pd.DataFrame) -> None:
        self._screen_day = dict(zip(spells.spell_id, spells.day))

    # --------------------------------------------------------------- validation
    def check(self, spells: pd.DataFrame, n: int = 300) -> dict:
        """Recompute the generator's recorded workload + interaction terms on screening days."""
        self.set_screen_days(spells)
        errs = []
        for s in spells.spell_id.iloc[:n]:
            g = self.gt.loc[s]
            t0 = self._screen_day[s]
            deliv = self.deliv[g.bowler_id][: t0 + 1]
            match = self.kind[g.bowler_id][: t0 + 1] == "match"
            dr = {k: v[-1] for k, v in self.drivers(deliv, match, t0, t0).items()}
            fat_z = np.log(g.true_fatigue_k) / 0.45
            for sname in INJ:
                wl = sum(c * dr[k] for k, c in COEF_W[sname].items())
                errs.append(abs(wl - g[f"gt_{sname}_workload"]))
                inter = COEF_I[sname].get("fatigue_x_load", 0) * fat_z * max(0.0, dr["acwr"] - 1.0)
                if sname == "lumbar":
                    inter += 1.25 * max(0.0, self._scr_z(g)) * dr["acwr_spike"]
                errs.append(abs(inter - g[f"gt_{sname}_interaction"]))
        return {"terms_checked": len(errs), "max_abs_error": float(np.max(errs)), "mean_abs_error": float(np.mean(errs))}
