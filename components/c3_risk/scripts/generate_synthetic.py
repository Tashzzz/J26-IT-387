#!/usr/bin/env python3
"""
CricShield - Component 3 synthetic dataset generator (v1.0)
===========================================================

Generates a SYNTHETIC, literature-informed dataset for developing and testing the
multimodal XGBoost-LSTM injury-risk classifier (Component 3) before real data exists.

What it simulates
-----------------
* A cohort of school / club / academy fast bowlers (aged 16-35) over a 24-week season.
* Daily workload logs (deliveries, session type, sRPE, duration) driven by team schedules,
  tournament weeks, extra sessions and graded return-to-play after injury.
* Gradual-onset injuries (lumbar bone stress, hamstring strain, side strain) drawn from a
  daily hazard model that depends on latent technique, workload and host factors.
* Weekly filmed screening spells (12 deliveries) producing per-frame joint-angle sequences
  that stand in for the Component 1 -> Component 2 output (no video involved).
* Labels: injury onset within the 28 days after each screening spell.

Everything is driven by documented coefficients (see COEF below) so the ground truth is
known. That makes the data useful for checking that a pipeline works and that SHAP recovers
the true risk drivers. It is NOT evidence about real bowlers.

Usage
-----
    python scripts/generate_synthetic.py --out ../../data/c3_synthetic/data --seed 2026 --n-bowlers 200
"""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.interpolate import PchipInterpolator
from scipy.signal import savgol_filter, medfilt

# --------------------------------------------------------------------------------------
# Global configuration
# --------------------------------------------------------------------------------------
SEASON_START = pd.Timestamp("2026-01-05")  # a Monday
N_WEEKS = 24
N_DAYS = N_WEEKS * 7
SCREEN_WEEKS = (4, 19)        # 0-based week index -> season weeks 5..20 (16 screens)
LABEL_HORIZON = 28            # days
DELIVERIES_PER_SPELL = 12
FPS = 120
T = 60                        # frames per delivery window (0.5 s at 120 fps)
PHASE = [0.55, 0.70, 0.85]    # pre-season volume ramp, weeks 1-3

CHANNELS = [
    "shoulder_alignment_deg",
    "pelvis_alignment_deg",
    "hip_shoulder_separation_deg",
    "trunk_lateral_flexion_deg",
    "trunk_flexion_deg",
    "front_knee_flexion_deg",
    "front_hip_flexion_deg",
    "bowling_elbow_flexion_deg",
    "bowling_shoulder_elevation_deg",
    "pose_confidence",
]

LEVEL_PLAN = {
    #           nets days        S&C days    match day  screen day  p(match)
    "school":  dict(nets=[0, 2, 4], sc=[1, 3], match=5, screen=2, p_match=0.85),
    "club":    dict(nets=[1, 3],    sc=[0, 2], match=6, screen=3, p_match=0.90),
    "academy": dict(nets=[0, 1, 3, 4], sc=[2], match=5, screen=1, p_match=0.80),
}

INJ_TYPES = ["lumbar_bone_stress", "hamstring_strain", "side_strain"]
TIME_LOSS = {  # (mean, sd, min, max) days unavailable, general time-loss definition
    "lumbar_bone_stress": (75, 20, 42, 120),
    "hamstring_strain": (21, 7, 10, 42),
    "side_strain": (35, 10, 21, 56),
}

# Hazard model coefficients (log-odds per unit of each standardised driver).
# Directions follow the literature; MAGNITUDES ARE DELIBERATELY AMPLIFIED so the signal is
# detectable in a cohort of ~200 bowlers. Do not quote them as real-world effect sizes.
# Intercepts are calibrated at run time to hit the target season incidences in TARGETS.
COEF = {
    "lumbar_bone_stress": {
        "technique": {"scr_z": 1.40, "latflex_z": 1.10, "trunk_ext_z": 0.75, "hss_z": 0.50, "knee_z": -0.30},
        "workload": {"acwr_spike": 1.10, "high_acute": 0.70, "high_chronic": 0.60, "low_chronic": 0.40, "consec3": 0.40},
        "interaction": {"scr_pos_x_spike": 1.25, "fatigue_x_load": 0.90},
        "host": {"prior_same": 0.60, "recent_return_same": 0.40, "adolescent": 0.45, "maturity_lag": 0.35},
    },
    "hamstring_strain": {
        "technique": {},
        "workload": {"acwr_spike": 1.50, "high_acute": 0.80, "low_chronic": 0.70, "diff_load_pos": 0.60,
                     "match_day": 0.50, "consec3": 0.50},
        "interaction": {"fatigue_x_load": 0.75},
        "host": {"age_z": 0.25, "pace_z": 0.30, "prior_same": 0.90, "recent_return_same": 0.45},
    },
    "side_strain": {
        "technique": {"latflex_z": 1.25, "latflex_vel_z": 1.10, "hss_z": 0.75},
        "workload": {"acwr_spike": 0.80, "high_acute": 0.50},
        "interaction": {"fatigue_x_load": 0.75},
        "host": {"prior_same": 0.60, "recent_return_same": 0.40},
    },
}
FRAILTY_SD = 0.45   # unobserved bowler-level random effect (added to every type's logit)
TARGETS = {"lumbar_bone_stress": 0.15, "hamstring_strain": 0.15, "side_strain": 0.10}  # share of bowlers / season
ORACLE_BOWLING_DAYS = 12      # bowling days assumed in the 28-day "true risk at screening" calculation


def clip(x, lo, hi):
    return float(min(max(x, lo), hi))


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


# --------------------------------------------------------------------------------------
# 1. Cohort
# --------------------------------------------------------------------------------------
def make_bowlers(rng, n_bowlers):
    n_teams = max(4, n_bowlers // 6)
    team = np.arange(n_bowlers) % n_teams
    team_level = np.where(np.arange(n_teams) < round(0.6 * n_teams), "school",
                          np.where(np.arange(n_teams) < round(0.9 * n_teams), "club", "academy"))
    level = team_level[team]

    rows = []
    # correlated technique latents: scr, latflex, hss, knee_ffc, trunk_ext
    corr = np.array([
        [1.00, 0.30, 0.35, 0.00, 0.10],
        [0.30, 1.00, 0.15, 0.00, 0.20],
        [0.35, 0.15, 1.00, 0.00, 0.00],
        [0.00, 0.00, 0.00, 1.00, 0.00],
        [0.10, 0.20, 0.00, 0.00, 1.00],
    ])
    sd = np.array([11.0, 7.0, 7.0, 10.0, 5.0])
    mu = np.array([28.0, 38.0, 25.0, 28.0, 12.0])
    lat = rng.multivariate_normal(mu, np.outer(sd, sd) * corr, size=n_bowlers)

    for i in range(n_bowlers):
        lv = level[i]
        if lv == "school":
            age = rng.uniform(16.0, 19.0)
        elif lv == "club":
            age = min(35.0, 18.0 + rng.gamma(2.0, 3.5))
        else:
            age = rng.uniform(17.0, 23.0)
        height = rng.normal(176 if age < 19 else 179, 6.5)
        bmi = rng.normal(21.0 if age < 19 else 23.2, 1.9)
        mass = bmi * (height / 100) ** 2
        aphv = rng.normal(14.0, 0.9)  # age at peak height velocity
        scr, lf, hss, knee, ext = lat[i]
        if lv == "school":
            scr += 2.0
        scr = clip(scr, 3, 65); lf = clip(lf, 22, 58); hss = clip(hss, 8, 45)
        knee = clip(knee, 5, 60); ext = clip(ext, 0, 30)
        rise = clip(rng.normal(10, 2), 6, 14)              # frames FFC -> peak lateral flexion
        pace = {"school": 112, "club": 118, "academy": 125}[lv] + 0.25 * (lf - 38) + rng.normal(0, 7)
        true_action = "mixed" if scr > 30 else rng.choice(["side-on", "front-on", "semi-open"], p=[0.35, 0.30, 0.35])
        coach_action = true_action if rng.random() < 0.75 else rng.choice(
            [a for a in ["side-on", "front-on", "semi-open", "mixed"] if a != true_action])
        u = rng.normal(0, FRAILTY_SD)
        scr_zp, lf_zp = (scr - 30) / 10, (lf - 38) / 7
        prior_l = rng.random() < sigmoid(-2.6 + 0.6 * scr_zp + 0.4 * lf_zp + 0.5 * (age < 20) + u)
        prior_h = rng.random() < sigmoid(-2.2 + 0.05 * (age - 20) + 0.03 * (pace - 115) + u)
        prior_s = rng.random() < sigmoid(-3.0 + 0.4 * lf_zp + u)
        prior_other = rng.poisson(0.15)
        n_prior = int(prior_l) + int(prior_h) + int(prior_s) + prior_other
        rows.append(dict(
            bowler_id=f"CS{i + 1:03d}", team_id=f"T{team[i] + 1:02d}", level=lv,
            age_at_season_start=round(age, 2), height_cm=round(height, 1), mass_kg=round(mass, 1),
            bmi=round(bmi, 1),
            maturity_offset_yrs=round(age - aphv, 2) if age < 19 else np.nan,
            bowling_arm="R" if rng.random() < 0.82 else "L",
            bowling_role="opening" if rng.random() < 0.4 else "change",
            action_type_coach=coach_action,
            years_bowling=int(clip(round(rng.normal((age - 11) * 0.7, 1.5)), 1, age - 9)),
            typical_pace_kmh=round(pace, 1),
            prior_lumbar_12m=int(prior_l), prior_hamstring_12m=int(prior_h), prior_side_strain_12m=int(prior_s),
            prior_injury_count_12m=n_prior,
            months_since_last_injury=round(rng.uniform(1, 12), 1) if n_prior > 0 else np.nan,
            # ---- latent (ground truth only; not observable) ----
            _scr=scr, _latflex=lf, _hss=hss, _knee_ffc=knee, _trunk_ext=ext, _rise=rise,
            _knee_delta=rng.normal(6, 9), _hip_ffc=rng.normal(38, 7), _elbow_uah=rng.normal(20, 6),
            _elbow_ext=clip(rng.normal(8, 3.5), 0, 20), _shoulder_bfc=rng.normal(35, 8),
            _fatigue_k=float(np.exp(rng.normal(0, 0.45))), _frailty=u, _aphv=aphv,
            _vol=float(np.exp(rng.normal(0, 0.30))), _spike_prop=float(rng.beta(2, 5)),
            _true_action=true_action,
        ))
    df = pd.DataFrame(rows)
    # population-standardised drivers used by the hazard model
    df["_latflex_vel"] = 0.55 * df["_latflex"] / (df["_rise"] / FPS)
    df["_latflex_vel_z"] = (df["_latflex_vel"] - df["_latflex_vel"].mean()) / df["_latflex_vel"].std()
    return df


def team_schedules(rng, bowlers):
    sched, screen = {}, {}
    for team, lv in bowlers.groupby("team_id")["level"].first().items():
        plan = LEVEL_PLAN[lv]
        s = ["rest"] * N_DAYS
        sc = [False] * N_DAYS
        tourn = set(rng.choice(np.arange(7, 19), size=rng.integers(1, 3), replace=False).tolist())
        for w in range(N_WEEKS):
            if w in tourn:
                days = {0: "nets", 1: "match", 3: "match", 5: "match"}
                sday = 0
            else:
                days = {d: "nets" for d in plan["nets"]}
                days.update({d: "sc" for d in plan["sc"]})
                if w >= 3 and rng.random() < plan["p_match"]:
                    days[plan["match"]] = "match"
                sday = plan["screen"]
            for d, k in days.items():
                s[w * 7 + d] = k
            if SCREEN_WEEKS[0] <= w <= SCREEN_WEEKS[1]:
                sc[w * 7 + sday] = True
        sched[team] = (s, sc, tourn)
    return sched


# --------------------------------------------------------------------------------------
# 2. Day-by-day simulation of workload + injury
# --------------------------------------------------------------------------------------
def simulate(rng, bowlers, sched, intercepts, record=True):
    work_rows, inj_rows, screen_recs = [], [], []
    for _, b in bowlers.iterrows():
        s, scr_flag, tourn = sched[b.team_id]
        drift_scr = np.cumsum(rng.normal(0, 0.7, N_WEEKS))
        drift_lf = np.cumsum(rng.normal(0, 0.5, N_WEEKS))
        extra = set()
        for w in range(N_WEEKS):
            if rng.random() < b._spike_prop:
                c = [w * 7 + d for d in range(7) if s[w * 7 + d] in ("rest", "sc")]
                if c:
                    extra.add(int(rng.choice(c)))
        deliv = np.zeros(N_DAYS)
        injured_until, return_day = -1, None
        last_return = {k: -999 for k in INJ_TYPES}
        prior = {"lumbar_bone_stress": b.prior_lumbar_12m, "hamstring_strain": b.prior_hamstring_12m,
                 "side_strain": b.prior_side_strain_12m}
        diff_ewma, consec = 0.0, 0
        adolescent = float(b.age_at_season_start < 19)
        mat_lag = max(0.0, (b._aphv - 14.0) / 0.9) if adolescent else 0.0
        fat_z = np.log(b._fatigue_k) / 0.45
        for t in range(N_DAYS):
            w, kind = t // 7, s[t]
            phase = PHASE[w] if w < 3 else 1.0
            since_rtp = t - return_day if return_day is not None else 999
            rtp = 0.4 + 0.6 * since_rtp / 21 if since_rtp < 21 else 1.0
            stype, srpe, dur, screened = "rest", np.nan, np.nan, False
            d_today = 0
            if t < injured_until:
                if kind in ("nets", "sc"):
                    stype, srpe, dur = "rehab", clip(round(rng.normal(3.5, 0.8)), 1, 6), clip(round(rng.normal(45, 8)), 20, 75)
            else:
                if t in extra and kind in ("rest", "sc"):
                    kind = "extra_nets"
                if kind in ("nets", "extra_nets"):
                    if rng.random() < 0.92:
                        mu = 32 if kind == "nets" else 40
                        d_today = int(clip(round(b._vol * phase * rtp * rng.normal(mu, 8)), 6, 72))
                        if scr_flag[t] and kind == "nets":
                            screened = True
                            d_today = max(d_today, DELIVERIES_PER_SPELL + int(rng.integers(0, 13)))
                        stype = kind
                        srpe = clip(round(rng.normal(6, 1)), 3, 9)
                        dur = clip(round(rng.normal(75 if kind == "nets" else 60, 15)), 40, 120)
                elif kind == "sc":
                    if rng.random() < 0.85:
                        stype, srpe, dur = "strength_conditioning", clip(round(rng.normal(5, 1)), 2, 8), clip(round(rng.normal(55, 10)), 30, 90)
                elif kind == "match":
                    p_sel = 0.92 if b.bowling_role == "opening" else 0.82
                    if since_rtp >= 10 and rng.random() < p_sel:
                        overs = clip(round(rng.normal(7.5 if b.bowling_role == "opening" else 5.0, 2.0)), 1, 10)
                        overs = max(1, round(overs * rtp))
                        d_today = int(overs * 6 + rng.poisson(1.2))
                        stype = "match"
                        srpe = clip(round(rng.normal(7.2, 1.1)), 4, 10)
                        dur = clip(round(rng.normal(210, 45)), 90, 360)
            deliv[t] = d_today

            # ---- workload state (up to and including today) ----
            acute = deliv[max(0, t - 6): t + 1].sum()
            if t >= 27:
                chronic = deliv[t - 27: t + 1].sum() / 4
            elif t >= 6:
                chronic = deliv[: t + 1].sum() / ((t + 1) / 7)
            else:
                chronic = 60.0 * b._vol
            acwr = acute / max(chronic, 40.0)
            prev_week = deliv[max(0, t - 13): max(0, t - 6)].sum()
            diff_ewma = diff_ewma + (2 / 8) * ((acute - prev_week) - diff_ewma)
            consec = consec + 1 if d_today > 0 else 0

            drv = dict(
                scr_z=(b._scr + drift_scr[w] - 30) / 10, latflex_z=(b._latflex + drift_lf[w] - 38) / 7,
                trunk_ext_z=(b._trunk_ext - 12) / 5, hss_z=(b._hss - 25) / 7, knee_z=(b._knee_ffc - 28) / 10,
                latflex_vel_z=b._latflex_vel_z,
                acwr_spike=max(0.0, acwr - 1.3), high_acute=max(0.0, acute - 170) / 60,
                high_chronic=max(0.0, chronic - 130) / 40, low_chronic=max(0.0, 60 - chronic) / 30,
                diff_load_pos=max(0.0, diff_ewma) / 40, consec3=float(consec >= 3),
                match_day=float(stype == "match"),
                adolescent=adolescent, maturity_lag=mat_lag,
                age_z=(b.age_at_season_start - 21) / 5, pace_z=(b.typical_pace_kmh - 115) / 9,
            )
            drv["scr_pos_x_spike"] = max(0.0, drv["scr_z"]) * drv["acwr_spike"]
            drv["fatigue_x_load"] = fat_z * max(0.0, acwr - 1.0)

            parts = {}
            p_types = {}
            for k in INJ_TYPES:
                drv_k = dict(drv, prior_same=float(prior[k]), recent_return_same=float(t - last_return[k] < 56))
                grp = {g: sum(c * drv_k[n] for n, c in COEF[k][g].items()) for g in COEF[k]}
                parts[k] = grp
                logit = intercepts[k] + sum(grp.values()) + b._frailty
                exposure = min(1.6, d_today / 36) if d_today > 0 else 0.0
                p_types[k] = sigmoid(logit) * exposure
            p_any = 1 - np.prod([1 - p for p in p_types.values()])

            onset = None
            if t >= injured_until and d_today > 0:
                for k in INJ_TYPES:
                    if rng.random() < p_types[k]:
                        onset = k
                        break
            if onset:
                m, sdv, lo, hi = TIME_LOSS[onset]
                tl = int(clip(round(rng.normal(m, sdv)), lo, hi))
                injured_until = t + 1 + tl
                return_day = injured_until
                last_return[onset] = injured_until
                prior[onset] = 1
                inj_rows.append(dict(bowler_id=b.bowler_id, onset_day=t, injury_type=onset, time_loss_days=tl))

            if record:
                work_rows.append(dict(bowler_id=b.bowler_id, day=t, session_type=stype, deliveries=d_today,
                                      srpe=srpe, duration_min=dur, tournament_week=int(w in tourn),
                                      _p_any=p_any))
                if screened:
                    screen_recs.append(dict(
                        bowler_id=b.bowler_id, day=t, acwr_state=acwr,
                        prev2=deliv[max(0, t - 2): t].sum(),
                        scr_cur=b._scr + drift_scr[w], lf_cur=b._latflex + drift_lf[w],
                        **{f"gt_{k.split('_')[0]}_{g}": v for k in INJ_TYPES for g, v in parts[k].items()},
                        **{f"_drv_{n}": v for n, v in drv.items()},
                    ))
    return work_rows, inj_rows, screen_recs


def calibrate_intercepts(bowlers, sched, seed):
    inter = {"lumbar_bone_stress": -6.6, "hamstring_strain": -6.4, "side_strain": -7.0}
    for _ in range(8):
        rng = np.random.default_rng(seed + 999)
        _, inj, _ = simulate(rng, bowlers, sched, inter, record=False)
        inj = pd.DataFrame(inj)
        for k in INJ_TYPES:
            share = inj.loc[inj.injury_type == k, "bowler_id"].nunique() / len(bowlers) if len(inj) else 0
            share = max(share, 0.005)
            inter[k] += 0.9 * (np.log(TARGETS[k] / (1 - TARGETS[k])) - np.log(share / (1 - share)))
    return inter


# --------------------------------------------------------------------------------------
# 3. Kinematic sequences (stand-in for Component 1 -> 2 output)
# --------------------------------------------------------------------------------------
def pchip(xs, ys, n=T):
    xs, idx = np.unique(np.asarray(xs, float), return_index=True)
    return PchipInterpolator(xs, np.asarray(ys, float)[idx])(np.arange(n))


def make_delivery(rng, b, scr_d, lf_d, hss_d, knee_d, ext_d, rise_d, elbow_d, eext_d, kdelta_d, hip_d):
    bfc = 10 + int(rng.integers(-2, 3))
    ffc = bfc + int(round(rng.normal(15, 1.5)))
    br = ffc + int(round(rng.normal(12, 1.2)))
    br = min(br, 50)
    s0 = b._shoulder_bfc + rng.normal(0, 3)
    smin_f = ffc - 1
    shoulder = pchip([0, bfc, smin_f, br, T - 1],
                     [s0 + 6, s0, s0 - scr_d, s0 + 105 + rng.normal(0, 5), s0 + 150])
    s_ffc = shoulder[ffc]
    pelvis = pchip([0, bfc, ffc, br, T - 1],
                   [s0 + 12, s0 + 10, s_ffc + hss_d, shoulder[br] - 8, s0 + 140])
    pk = int(min(ffc + round(rise_d), T - 3))
    latflex = pchip([0, bfc, ffc, pk, T - 1], [4, 7, 0.42 * lf_d, lf_d, 0.55 * lf_d])
    trunk = pchip([0, bfc, ffc, br, T - 1], [5, 2, -ext_d, 15 + rng.normal(0, 4), 55 + rng.normal(0, 6)])
    knee = np.clip(pchip([0, bfc, ffc, br, T - 1],
                         [70, 55 + rng.normal(0, 5), knee_d, knee_d + kdelta_d, 45 + rng.normal(0, 8)]), 0, None)
    hip = pchip([0, bfc, ffc, br, T - 1], [40, 45, hip_d, hip_d + 15, 85])
    uah = ffc + 4
    elbow = np.clip(pchip([0, bfc, uah, br, T - 1], [60, 70, elbow_d, elbow_d - eext_d, 25]), 0, None)
    elev = pchip([0, bfc, ffc, br, T - 1], [20, 40, 110, 175, 90])

    clean = np.stack([shoulder, pelvis, pelvis - shoulder, latflex, trunk, knee, hip, elbow, elev], axis=1)
    noise = rng.normal(0, 0.8, clean.shape) + rng.normal(0, 1.0, (1, clean.shape[1]))
    f = np.arange(T)
    conf = 0.93 + rng.normal(0, 0.015, T) - 0.12 * np.exp(-((f - br) / 3.0) ** 2) * rng.uniform(0.5, 1.5)
    noisy = clean + noise
    noisy[:, 2] = noisy[:, 1] - noisy[:, 0]  # keep separation consistent with measured channels
    glitch = rng.random() < 0.02
    if glitch:
        g0 = int(br - 1 + rng.integers(0, 3))
        for g in range(g0, min(g0 + 2, T)):
            noisy[g, [0, 3]] += rng.normal(0, 12, 2)
            conf[g] = rng.uniform(0.25, 0.4)
        noisy[:, 2] = noisy[:, 1] - noisy[:, 0]
    seq = np.concatenate([noisy, np.clip(conf, 0.2, 0.99)[:, None]], axis=1)
    return seq.astype(np.float32), dict(bfc_frame=bfc, ffc_frame=ffc, uah_frame=uah, br_frame=br,
                                        tracking_glitch=int(glitch))


def delivery_metrics(seq, ev):
    """Component-2-style per-delivery metrics, extracted from the noisy sequence."""
    sm = np.empty_like(seq[:, :9])
    for c in range(9):
        x = medfilt(seq[:, c].astype(float), 3)
        sm[:, c] = savgol_filter(x, 9, 3)
    bfc, ffc, br = ev["bfc_frame"], ev["ffc_frame"], ev["br_frame"]
    sh, sep, lf, tr, kn, el = sm[:, 0], sm[:, 2], sm[:, 3], sm[:, 4], sm[:, 5], sm[:, 7]
    lf_vel = savgol_filter(medfilt(seq[:, 3].astype(float), 3), 9, 3, deriv=1) * FPS
    return dict(
        shoulder_counter_rotation_deg=sh[bfc] - sh[bfc: ffc + 1].min(),
        peak_lateral_flexion_deg=lf[ffc: min(br + 8, T)].max(),
        lateral_flexion_at_br_deg=lf[br],
        peak_hip_shoulder_sep_deg=sep[bfc: br + 1].max(),
        front_knee_flexion_ffc_deg=kn[ffc],
        front_knee_flexion_br_deg=kn[br],
        trunk_extension_ffc_deg=-tr[ffc],
        elbow_extension_deg=el[ev["uah_frame"]] - el[br],
        peak_lat_flex_velocity_dps=lf_vel[ffc: min(br + 8, T)].max(),
        mean_pose_confidence=float(seq[:, 9].mean()),
    )


def build_kinematics(rng, bowlers, screen_df):
    bmap = bowlers.set_index("bowler_id")
    seqs, drows, srows = [], [], []
    for _, r in screen_df.iterrows():
        b = bmap.loc[r.bowler_id]
        fs = max(0.0, r.acwr_state - 1.0) + r.prev2 / 72
        lf_drift = 0.18 * b._fatigue_k * (1 + 0.8 * fs)
        scr_drift = 0.10 * b._fatigue_k * (1 + 0.8 * fs)
        day_lf, day_scr = rng.normal(0, 1.5), rng.normal(0, 1.5)
        speed_gun = rng.random() < 0.6
        for j in range(DELIVERIES_PER_SPELL):
            scr_d = max(0.5, r.scr_cur + day_scr + scr_drift * j + rng.normal(0, 3.0))
            lf_d = r.lf_cur + day_lf + lf_drift * j + rng.normal(0, 2.0)
            seq, ev = make_delivery(
                rng, b, scr_d, lf_d,
                hss_d=b._hss + rng.normal(0, 2.5), knee_d=max(2, b._knee_ffc + rng.normal(0, 3.5)),
                ext_d=max(0, b._trunk_ext + rng.normal(0, 1.8)), rise_d=clip(b._rise + rng.normal(0, 1.0), 5, 16),
                elbow_d=b._elbow_uah + rng.normal(0, 1.5), eext_d=max(0, b._elbow_ext + rng.normal(0, 1.5)),
                kdelta_d=b._knee_delta + rng.normal(0, 3), hip_d=b._hip_ffc + rng.normal(0, 3))
            did = f"{r.spell_id}-D{j + 1:02d}"
            m = delivery_metrics(seq, ev)
            speed = b.typical_pace_kmh - 0.15 * j * b._fatigue_k + rng.normal(0, 2.5) if speed_gun else np.nan
            drows.append(dict(delivery_id=did, spell_id=r.spell_id, bowler_id=r.bowler_id, delivery_no=j + 1,
                              **ev, release_speed_kmh=round(speed, 1) if speed_gun else np.nan,
                              **{k: round(float(v), 2) for k, v in m.items()}))
            seqs.append(seq)
    return np.stack(seqs), pd.DataFrame(drows)


# --------------------------------------------------------------------------------------
# 4. Workload features as an analyst would compute them from the raw log
# --------------------------------------------------------------------------------------
def workload_features(work):
    w = work.copy()
    w["srpe_imputed"] = w["srpe"]
    med = w.groupby(["bowler_id", "session_type"])["srpe"].transform("median")
    w.loc[w.srpe.isna() & ~w.session_type.isin(["rest"]), "srpe_imputed"] = med
    dmed = w.groupby(["bowler_id", "session_type"])["duration_min"].transform("median")
    w["duration_imputed"] = w["duration_min"].fillna(dmed)
    w["session_load_au"] = (w.srpe_imputed * w.duration_imputed).fillna(0)
    w["bowled"] = (w.deliveries > 0).astype(int)
    w["is_match"] = (w.session_type == "match").astype(int)
    w["is_rest"] = (w.session_type == "rest").astype(int)
    w["srpe_missing"] = (w.srpe.isna() & (w.session_type != "rest")).astype(int)
    out = []
    for bid, g in w.groupby("bowler_id", sort=False):
        g = g.sort_values("day").copy()
        d = g.deliveries
        g["deliveries_7d"] = d.rolling(7, min_periods=1).sum()
        g["deliveries_28d_weekly"] = d.rolling(28, min_periods=7).sum() / (d.rolling(28, min_periods=7).count() / 7)
        g["deliveries_42d_weekly"] = d.rolling(42, min_periods=7).sum() / (d.rolling(42, min_periods=7).count() / 7)
        g["acwr_7_28"] = g.deliveries_7d / g.deliveries_28d_weekly.replace(0, np.nan)
        g["ewma_acute_7"] = d.ewm(alpha=2 / 8, adjust=False).mean()
        g["ewma_chronic_28"] = d.ewm(alpha=2 / 29, adjust=False).mean()
        g["ewma_ratio"] = g.ewma_acute_7 / g.ewma_chronic_28.replace(0, np.nan)
        weekly_change = g.deliveries_7d - g.deliveries_7d.shift(7).fillna(0)
        g["differential_load_7d"] = weekly_change.ewm(alpha=2 / 8, adjust=False).mean()
        sl = g.session_load_au
        g["session_load_7d"] = sl.rolling(7, min_periods=1).sum()
        g["session_load_28d_weekly"] = sl.rolling(28, min_periods=7).sum() / (sl.rolling(28, min_periods=7).count() / 7)
        sd7 = sl.rolling(7, min_periods=2).std().replace(0, np.nan)
        g["monotony_7d"] = sl.rolling(7, min_periods=2).mean() / sd7
        g["strain_7d"] = g.session_load_7d * g.monotony_7d
        g["bowling_days_7d"] = g.bowled.rolling(7, min_periods=1).sum()
        g["matches_14d"] = g.is_match.rolling(14, min_periods=1).sum()
        g["max_daily_deliveries_7d"] = d.rolling(7, min_periods=1).max()
        g["rest_days_7d"] = g.is_rest.rolling(7, min_periods=1).sum()
        g["srpe_missing_7d"] = g.srpe_missing.rolling(7, min_periods=1).sum()
        run = (g.bowled.groupby((g.bowled == 0).cumsum()).cumsum())
        g["consecutive_bowling_days"] = run
        last_rest = g.day.where(g.is_rest == 1).ffill()
        g["days_since_rest_day"] = g.day - last_rest
        out.append(g)
    cols = ["deliveries_7d", "deliveries_28d_weekly", "deliveries_42d_weekly", "acwr_7_28", "ewma_acute_7",
            "ewma_chronic_28", "ewma_ratio", "differential_load_7d", "session_load_7d", "session_load_28d_weekly",
            "monotony_7d", "strain_7d", "bowling_days_7d", "matches_14d", "max_daily_deliveries_7d",
            "rest_days_7d", "srpe_missing_7d", "consecutive_bowling_days", "days_since_rest_day"]
    return pd.concat(out)[["bowler_id", "day"] + cols], cols


def spell_kinematic_summary(deliv):
    def slope(y):
        x = np.arange(len(y))
        return float(np.polyfit(x, y, 1)[0]) if len(y) > 2 else np.nan
    rows = []
    for sid, g in deliv.groupby("spell_id", sort=False):
        g = g.sort_values("delivery_no")
        lf = g.peak_lateral_flexion_deg.values
        rows.append(dict(
            spell_id=sid,
            scr_mean=g.shoulder_counter_rotation_deg.mean(), scr_peak=g.shoulder_counter_rotation_deg.max(),
            scr_slope_per_delivery=slope(g.shoulder_counter_rotation_deg.values),
            n_deliveries_scr_over_30=int((g.shoulder_counter_rotation_deg > 30).sum()),
            latflex_mean=lf.mean(), latflex_peak=lf.max(), latflex_slope_per_delivery=slope(lf),
            latflex_max_delivery_no=int(g.delivery_no.values[np.argmax(lf)]),
            latflex_vel_mean=g.peak_lat_flex_velocity_dps.mean(),
            hss_mean=g.peak_hip_shoulder_sep_deg.mean(),
            trunk_ext_ffc_mean=g.trunk_extension_ffc_deg.mean(),
            knee_flex_ffc_mean=g.front_knee_flexion_ffc_deg.mean(),
            knee_flex_change_mean=(g.front_knee_flexion_br_deg - g.front_knee_flexion_ffc_deg).mean(),
            elbow_ext_mean=g.elbow_extension_deg.mean(),
            release_speed_mean=g.release_speed_kmh.mean(),
            pose_conf_mean=g.mean_pose_confidence.mean(),
        ))
    out = pd.DataFrame(rows)
    num = out.columns.drop("spell_id")
    out[num] = out[num].round(3)
    return out


# --------------------------------------------------------------------------------------
# 5. Main
# --------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--n-bowlers", type=int, default=200)
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(args.seed)

    bowlers = make_bowlers(rng, args.n_bowlers)
    sched = team_schedules(rng, bowlers)
    intercepts = calibrate_intercepts(bowlers, sched, args.seed)
    work_rows, inj_rows, screen_recs = simulate(np.random.default_rng(args.seed + 1), bowlers, sched, intercepts)

    work = pd.DataFrame(work_rows)
    inj = pd.DataFrame(inj_rows)
    scr = pd.DataFrame(screen_recs)
    date_of = lambda d: (SEASON_START + pd.to_timedelta(d, unit="D")).dt.date

    # ---- injuries ----
    inj = inj.sort_values(["bowler_id", "onset_day"]).reset_index(drop=True)
    inj.insert(0, "injury_id", [f"INJ{i + 1:03d}" for i in range(len(inj))])
    inj["onset_date"] = date_of(inj.onset_day)
    inj["return_date"] = date_of(inj.onset_day + 1 + inj.time_loss_days)
    inj["definition"] = "general time-loss"

    # ---- spells + labels ----
    scr = scr.sort_values(["bowler_id", "day"]).reset_index(drop=True)
    scr["spell_id"] = [f"{b}-W{d // 7 + 1:02d}" for b, d in zip(scr.bowler_id, scr.day)]
    lab = []
    for _, r in scr.iterrows():
        f = inj[(inj.bowler_id == r.bowler_id) & (inj.onset_day > r.day) & (inj.onset_day <= r.day + LABEL_HORIZON)]
        prev = inj[(inj.bowler_id == r.bowler_id) & (inj.onset_day < r.day)]
        rtp_days = (r.day - (prev.onset_day + 1 + prev.time_loss_days)).max() if len(prev) else np.nan
        if len(f):
            first = f.iloc[0]
            lab.append(dict(injury_28d=1, injury_type_28d=first.injury_type, days_to_onset=int(first.onset_day - r.day),
                            in_season_injuries_before=len(prev), days_since_rtp=rtp_days))
        else:
            lab.append(dict(injury_28d=0, injury_type_28d="none", days_to_onset=np.nan,
                            in_season_injuries_before=len(prev), days_since_rtp=rtp_days))
    scr = pd.concat([scr, pd.DataFrame(lab)], axis=1)
    # True 28-day risk as of the screening date: the generator's hazard with the bowler's state frozen at
    # screening (incl. the unobserved frailty), over ORACLE_BOWLING_DAYS standard 36-delivery days.
    frail = scr.bowler_id.map(bowlers.set_index("bowler_id")._frailty).values
    surv = np.ones(len(scr))
    for k in INJ_TYPES:
        short = k.split("_")[0]
        lg = intercepts[k] + scr[[c for c in scr.columns if c.startswith(f"gt_{short}_")]].sum(axis=1).values + frail
        p = sigmoid(lg)
        scr[f"true_risk_28d_{short}"] = 1 - (1 - p) ** ORACLE_BOWLING_DAYS
        surv *= (1 - p) ** ORACLE_BOWLING_DAYS
    scr["oracle_risk_28d"] = 1 - surv
    for k in INJ_TYPES:
        scr[f"label_{k}_28d"] = (scr.injury_type_28d == k).astype(int)

    # ---- bowler-level split (no bowler appears in two splits) ----
    ever = inj.bowler_id.unique()
    bl = bowlers[["bowler_id", "level"]].copy()
    bl["strat"] = bl.level + "_" + bl.bowler_id.isin(ever).astype(str)
    split_rng = np.random.default_rng(args.seed + 7)
    split = {}
    for _, g in bl.groupby("strat"):
        ids = split_rng.permutation(g.bowler_id.values)
        n = len(ids); n_te = int(round(0.15 * n)); n_va = int(round(0.15 * n))
        for i, b in enumerate(ids):
            split[b] = "test" if i < n_te else ("val" if i < n_te + n_va else "train")
    scr["split"] = scr.bowler_id.map(split)

    # ---- kinematics ----
    X, deliv = build_kinematics(np.random.default_rng(args.seed + 2), bowlers, scr)
    ksum = spell_kinematic_summary(deliv)

    # ---- workload features at screening date ----
    wf, wcols = workload_features(work)
    scr = scr.merge(wf, on=["bowler_id", "day"], how="left")

    # ---- metadata ----
    meta_cols = ["bowler_id", "team_id", "level", "bowling_arm", "bowling_role", "action_type_coach", "years_bowling",
                 "height_cm", "mass_kg", "bmi", "typical_pace_kmh", "prior_lumbar_12m", "prior_hamstring_12m",
                 "prior_side_strain_12m", "prior_injury_count_12m", "months_since_last_injury"]
    meta = bowlers[meta_cols + ["age_at_season_start", "maturity_offset_yrs"]]
    scr = scr.merge(meta, on="bowler_id", how="left")
    scr["age_at_screen"] = (scr.age_at_season_start + scr.day / 365.25).round(2)
    scr["maturity_offset_yrs"] = (scr.maturity_offset_yrs + scr.day / 365.25).round(2)
    scr["screen_date"] = date_of(scr.day)
    scr["season_week"] = scr.day // 7 + 1

    # ---- write files ----
    athletes = bowlers[["bowler_id", "team_id", "level", "age_at_season_start", "height_cm", "mass_kg", "bmi",
                        "maturity_offset_yrs", "bowling_arm", "bowling_role", "action_type_coach", "years_bowling",
                        "typical_pace_kmh", "prior_lumbar_12m", "prior_hamstring_12m", "prior_side_strain_12m",
                        "prior_injury_count_12m", "months_since_last_injury"]].copy()
    athletes["split"] = athletes.bowler_id.map(split)
    athletes.to_csv(out / "athletes.csv", index=False)

    work_out = work.drop(columns=["_p_any"]).copy()
    miss = np.random.default_rng(args.seed + 3)
    active = work_out.session_type != "rest"
    work_out.loc[active & (miss.random(len(work_out)) < 0.04), "srpe"] = np.nan
    work_out.loc[active & (miss.random(len(work_out)) < 0.02), "duration_min"] = np.nan
    work_out.insert(1, "date", date_of(work_out.day))
    work_out["season_week"] = work_out.day // 7 + 1
    work_out.to_csv(out / "workload_daily.csv", index=False)

    inj[["injury_id", "bowler_id", "onset_date", "onset_day", "injury_type", "time_loss_days", "return_date",
         "definition"]].to_csv(out / "injuries.csv", index=False)

    spell_cols = ["spell_id", "bowler_id", "screen_date", "day", "season_week", "split", "injury_28d",
                  "injury_type_28d", "days_to_onset"] + [f"label_{k}_28d" for k in INJ_TYPES]
    scr[spell_cols].to_csv(out / "spells.csv", index=False)

    deliv.to_csv(out / "deliveries.csv", index=False)
    np.savez_compressed(out / "kinematic_sequences.npz", X=X.astype(np.float16),
                        delivery_id=np.array(deliv.delivery_id.tolist(), dtype="U"),
                        spell_id=np.array(deliv.spell_id.tolist(), dtype="U"),
                        channels=np.array(CHANNELS, dtype="U"), fps=FPS)

    # one small long-format sample for plotting / inspection
    samp_spells = deliv.spell_id.drop_duplicates().iloc[:3].tolist()
    rows = []
    for idx in np.where(deliv.spell_id.isin(samp_spells))[0]:
        for f in range(T):
            rows.append([deliv.delivery_id.iloc[idx], f, round(f / FPS, 4)] + [round(float(v), 2) for v in X[idx, f]])
    pd.DataFrame(rows, columns=["delivery_id", "frame", "time_s"] + CHANNELS).to_csv(
        out / "kinematic_frames_sample.csv", index=False)

    meta_model = ["age_at_screen", "maturity_offset_yrs", "level", "bowling_arm", "bowling_role", "action_type_coach",
                  "years_bowling", "height_cm", "mass_kg", "bmi", "prior_lumbar_12m", "prior_hamstring_12m",
                  "prior_side_strain_12m", "prior_injury_count_12m", "months_since_last_injury",
                  "in_season_injuries_before", "days_since_rtp"]
    model = scr[["spell_id", "bowler_id", "screen_date", "season_week", "split"]].merge(ksum, on="spell_id")
    model = model.merge(scr[["spell_id"] + wcols + meta_model + ["injury_28d", "injury_type_28d", "days_to_onset"]
                            + [f"label_{k}_28d" for k in INJ_TYPES]], on="spell_id")
    for c in wcols:
        model[c] = model[c].astype(float).round(3)
    model.to_csv(out / "model_table_spell_level.csv", index=False)

    gt_cols = [c for c in scr.columns if c.startswith("gt_")]
    gt = scr[["spell_id", "bowler_id", "oracle_risk_28d", "true_risk_28d_lumbar", "true_risk_28d_hamstring",
              "true_risk_28d_side"] + gt_cols].copy()
    for k in ["lumbar", "hamstring", "side"]:
        grp = [c for c in gt_cols if c.startswith(f"gt_{k}_")]
        gt[f"gt_{k}_dominant_group"] = gt[grp].idxmax(axis=1).str.replace(f"gt_{k}_", "", regex=False)
    lat = bowlers.set_index("bowler_id")[["_scr", "_latflex", "_hss", "_knee_ffc", "_trunk_ext", "_latflex_vel",
                                          "_fatigue_k", "_frailty", "_true_action"]]
    lat.columns = ["true_" + c.lstrip("_") for c in lat.columns]
    lat = lat.rename(columns={"true_true_action": "true_action_type"})
    gt = gt.merge(lat, left_on="bowler_id", right_index=True)
    gt.round(4).to_csv(out / "ground_truth_spells.csv", index=False)

    meta_json = dict(
        generator="generate_dataset.py v1.0", seed=args.seed, n_bowlers=args.n_bowlers,
        season_start=str(SEASON_START.date()), n_days=N_DAYS, label_horizon_days=LABEL_HORIZON,
        deliveries_per_spell=DELIVERIES_PER_SPELL, frames_per_delivery=T, fps=FPS, channels=CHANNELS,
        calibrated_intercepts={k: round(v, 3) for k, v in intercepts.items()},
        coefficients=COEF, frailty_sd=FRAILTY_SD, target_season_incidence=TARGETS,
        null_features_no_causal_effect=["bowling_arm", "years_bowling", "height_cm", "mass_kg", "bmi",
                                        "elbow_ext_mean", "release_speed_mean (only via pace)", "knee_flex_change_mean"],
    )
    (out / "generation_config.json").write_text(json.dumps(meta_json, indent=2))
    print(json.dumps({"bowlers": len(bowlers), "workload_rows": len(work_out), "injuries": len(inj),
                      "spells": len(scr), "deliveries": len(deliv), "X_shape": list(X.shape),
                      "positive_rate": round(scr.injury_28d.mean(), 3),
                      "intercepts": meta_json["calibrated_intercepts"]}, indent=1))


if __name__ == "__main__":
    main()
