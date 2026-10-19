"""Two-level SHAP explanation and the clinician-style narrative.

Level 1  modality : technique (kinematics) vs workload vs athlete history (metadata)
Level 2  factor   : named factors inside each modality (e.g. shoulder counter-rotation,
                    acute:chronic workload ratio), each made of one or more model features
                    (mean / peak / change across the spell ...), listed as `components`.

Output follows contracts/c3_risk.schema.json. `shap` is reported in risk-score units
(the same 0-1 scale as risk_score), so the values add up to risk_score - base score and
stay inside the +-1 range C4 validates; `shap_logodds` keeps the raw TreeSHAP value.
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import Optional

from .model import RiskModel, is_nan, level_of, tier_of
from .spec import C2_INPUTS, FACTOR_OF, FACTORS, FEATURE_NAMES, HORIZON_DAYS, MODALITIES, MODALITY_LABEL, MODALITY_OF

KIN_FACTOR_TO_C2 = {c2: c2 for c2 in C2_INPUTS}  # kinematic factor name == C2 feature name
REASON_MIN_LOGODDS = 0.10    # a factor must move the odds by ~10 % to be called a "reason" in the sentence


def strength(logodds: float) -> str:
    a = abs(logodds)
    return "slightly " if a < REASON_MIN_LOGODDS else "strongly " if a >= 0.40 else "clearly " if a >= 0.20 else ""


# ---------------------------------------------------------------------------
# Factor values as a coach would read them
# ---------------------------------------------------------------------------
def _n(v: float, digits: int = 0) -> str:
    return f"{v:.{digits}f}"


def _plural(n: int, word: str, plural: Optional[str] = None) -> str:
    return f"{n} {word if n == 1 else (plural or word + 's')}"


def factor_value(factor: str, f: dict, ctx: dict, brief: bool = False) -> tuple[object, Optional[str]]:
    """(contract value, display text) for one factor; display None = not measured. brief: no per-ball slope."""
    g = lambda k: f.get(k)
    if factor == "shoulder_counter_rotation_deg" or factor == "trunk_lateral_flexion_deg":
        p = "scr" if factor.startswith("shoulder") else "tlf"
        if is_nan(g(f"{p}_mean")):
            return None, None
        txt = f"peak {_n(g(f'{p}_peak'))}°, average {_n(g(f'{p}_mean'))}°"
        if not brief and not is_nan(g(f"{p}_slope")):
            txt += f", {g(f'{p}_slope'):+.1f}° per ball"
        return round(g(f"{p}_peak"), 1), txt
    if factor == "front_knee_flexion_ffc_deg":
        v = g("knee_ffc_mean")
        return (None, None) if is_nan(v) else (round(v, 1), f"{_n(v)}°")
    if factor == "front_knee_flexion_release_deg":
        v = g("knee_rel_mean")
        return (None, None) if is_nan(v) else (round(v, 1), f"{_n(v)}°")
    if factor == "acute_chronic_workload_ratio":
        v = g("acwr_7_28") if not is_nan(g("acwr_7_28")) else g("ewma_ratio")
        return (None, None) if is_nan(v) else (round(v, 2), _n(v, 2))
    if factor == "workload_spike":
        v = g("differential_load_7d")
        return (None, None) if is_nan(v) else (round(v, 1), f"{v:+.0f} balls a week (smoothed)")
    if factor in ("acute_overs", "weekly_overs", "daily_overs"):
        k = {"acute_overs": "deliveries_7d", "weekly_overs": "deliveries_28d_weekly", "daily_overs": "max_daily_deliveries_7d"}[factor]
        v = g(k)
        if is_nan(v):
            return None, None
        overs = v / 6
        return round(overs, 1), f"{_n(overs)} overs" + (" a week" if factor == "weekly_overs" else "")
    if factor in ("days_bowled_7", "consecutive_days", "rest_days_7d", "matches_14d"):
        k = {"days_bowled_7": "bowling_days_7d", "consecutive_days": "consecutive_bowling_days",
             "rest_days_7d": "rest_days_7d", "matches_14d": "matches_14d"}[factor]
        v = g(k)
        return (None, None) if is_nan(v) else (int(v), str(int(v)))
    if factor == "age":
        return int(g("age")), f"{int(g('age'))} years"
    if factor == "playing_level":
        lvl = ctx.get("playing_level", "club")
        return lvl, lvl
    if factor == "injury_history":
        n = int(g("injuries_12m") or 0)
        dsr = g("days_since_return")
        if n == 0:
            return 0, "no injuries in the last 12 months"
        if not is_nan(dsr) and dsr < 120:
            return n, ("not yet returned from injury" if dsr == 0 else f"returned from injury about {int(dsr)} days ago")
        sites = [s for s, k in (("lower-back", "lumbar_12m"), ("hamstring", "hamstring_12m"), ("side-strain", "side_strain_12m"))
                 if g(k)]
        if sites:
            return n, f"{' and '.join(sites)} injury in the last 12 months"
        return n, f"{_plural(n, 'injury', 'injuries')} in the last 12 months"
    return None, None


def clause(factor: str, up: bool, f: dict, ctx: dict) -> str:
    """Short plain-English reason, used to build the one-sentence explanation."""
    g = lambda k: f.get(k)
    if factor in ("shoulder_counter_rotation_deg", "trunk_lateral_flexion_deg"):
        scr = factor.startswith("shoulder")
        p, name, lim = ("scr", "shoulder counter-rotation", 30) if scr else ("tlf", "trunk side-bend", 40)
        peak, mean, slope = g(f"{p}_peak"), g(f"{p}_mean"), g(f"{p}_slope")
        if up:
            txt = (f"{name} reached {_n(peak)}°, above the {lim}° limit" if peak > lim
                   else f"{name} averaged {_n(mean)}°")
            if not is_nan(slope) and slope > 0.3:
                txt += " and rose ball by ball (a fatigue sign)" if not scr else " and rose through the spell"
            return txt
        return (f"{name} stayed within the {lim}° limit" if peak <= lim
                else f"{name} was lower than usual for the squad ({_n(mean)}°)")
    if factor == "front_knee_flexion_ffc_deg":
        v = g("knee_ffc_mean")
        return (f"the front knee was only {_n(v)}° bent at landing" if up
                else f"a well-flexed front knee at landing ({_n(v)}°)")
    if factor == "front_knee_flexion_release_deg":
        v = g("knee_rel_mean")
        return (f"the front knee was nearly straight at release ({_n(v)}°)" if up and v < 30
                else f"front-knee bend at release was {_n(v)}°" if up else "the front knee was not locked at release")
    if factor == "acute_chronic_workload_ratio":
        v = g("acwr_7_28") if not is_nan(g("acwr_7_28")) else g("ewma_ratio")
        if up:
            if v > 1.05:
                return f"this week's bowling load is {round((v - 1) * 100)}% higher than the 4-week average"
            if v < 0.8:
                return f"bowling load is well below the usual level (ratio {_n(v, 2)}), so the body is less prepared"
            return f"the acute:chronic load ratio is {_n(v, 2)}"
        return (f"this week's load is in line with the 4-week average (ratio {_n(v, 2)})" if 0.8 <= v <= 1.3
                else f"the acute:chronic load ratio of {_n(v, 2)} lowered the estimate")
    if factor == "workload_spike":
        v = g("differential_load_7d")
        return (f"balls bowled per week jumped by about {_n(abs(v))}" if up and v > 0
                else "weekly load changed sharply" if up else "weekly load has been steady")
    if factor in ("acute_overs", "weekly_overs", "daily_overs"):
        val, _ = factor_value(factor, f, ctx)
        if factor == "acute_overs":
            return f"{_n(val)} overs were bowled in the last 7 days" if up else f"a moderate {_n(val)} overs in the last 7 days"
        if factor == "weekly_overs":
            return f"the 4-week average is {_n(val)} overs a week" if up else f"a steady base of {_n(val)} overs a week"
        return f"up to {_n(val)} overs were bowled in one day this week" if up else f"no day above {_n(val)} overs this week"
    if factor in ("days_bowled_7", "consecutive_days", "rest_days_7d", "matches_14d"):
        n, _ = factor_value(factor, f, ctx)
        if factor == "days_bowled_7":
            return f"bowling on {n} of the last 7 days" if up else f"only {n} bowling days in the last 7"
        if factor == "consecutive_days":
            return f"{n} bowling days in a row" if up else f"no long run of bowling days ({n} in a row)"
        if factor == "rest_days_7d":
            return f"only {_plural(n, 'rest day')} in the last week" if up else f"{_plural(n, 'rest day')} in the last week"
        return f"{_plural(n, 'match', 'matches')} in the last 14 days"
    if factor == "age":
        a = int(g("age"))
        return f"the bowler is {a} (a junior whose back is still maturing)" if up and a < 19 else f"the bowler's age ({a})"
    if factor == "playing_level":
        return f"{ctx.get('playing_level', 'club')}-level bowling"
    if factor == "injury_history":
        _, txt = factor_value(factor, f, ctx)
        if up:
            if txt.startswith("returned"):
                return "the bowler " + txt
            if txt.startswith("not yet"):
                return "the bowler has not yet returned from injury"
            if txt.startswith("no injuries"):
                return "of the injury history"
            return "the bowler had " + (txt if txt[0].isdigit() else "a " + txt)
        return "no recent injuries" if txt.startswith("no injuries") else "the injury history"
    return FACTORS.get(factor, {}).get("label", factor).lower()


def _join(parts: list[str]) -> str:
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:]


# ---------------------------------------------------------------------------
# Assessment
# ---------------------------------------------------------------------------
def assess(model: RiskModel, feats: dict, notes: list[str], summary: dict, bowler_id: str,
           session_id: Optional[str] = None) -> dict:
    t0 = time.perf_counter()
    ctx = {"playing_level": summary.get("athlete", {}).get("playing_level", "club")}
    e = model.explain_row(feats)
    p, p0 = e["probability"], e["base_probability"]
    score, score0 = model.score(p), model.score(p0)
    slope = model.score_slope(p, p0)
    medians = model.card.get("feature_medians", {})
    kin_quality = summary.get("kinematics", {}).get("per_feature", {})

    # ---- level 2: features -> factors ------------------------------------
    factors: dict[str, dict] = {}
    for name in FEATURE_NAMES:
        fac = FACTOR_OF[name]
        d = factors.setdefault(fac, {"feature": fac, "modality": MODALITY_OF[name], "shap_logodds": 0.0, "components": []})
        phi = e["phi"][name]
        d["shap_logodds"] += phi
        v = feats.get(name)
        d["components"].append({"feature": name, "value": None if is_nan(v) else round(float(v), 3),
                                "shap_logodds": round(phi, 4)})
    out_factors = []
    for fac, d in factors.items():
        value, display = factor_value(fac, feats, ctx)
        typical_val, typical = factor_value(fac, medians, ctx, brief=True) if medians else (None, None)
        meta = FACTORS.get(fac, {})
        shap_score = max(-1.0, min(1.0, d["shap_logodds"] * slope))
        entry = {
            "feature": fac, "label": meta.get("label", fac), "modality": d["modality"],
            "value": value, "display_value": display if display is not None else "not measured",
            "measured": display is not None,
            "shap": round(shap_score, 4), "shap_logodds": round(d["shap_logodds"], 4),
            "direction": "increases_risk" if d["shap_logodds"] > 1e-6 else "decreases_risk" if d["shap_logodds"] < -1e-6 else "neutral",
            "reference": meta.get("reference"), "squad_typical": typical if fac not in ("playing_level",) else None,
            "components": d["components"],
        }
        if fac in KIN_FACTOR_TO_C2:
            q = kin_quality.get(fac, {})
            entry["reliable"] = not q.get("unreliable")
            entry["deliveries_used"] = q.get("n", 0)
        out_factors.append(entry)
    out_factors.sort(key=lambda x: -abs(x["shap_logodds"]))

    # ---- level 1: modalities ----------------------------------------------
    mod = {m: sum(x["shap_logodds"] for x in out_factors if x["modality"] == m) for m in MODALITIES}
    up_total = sum(max(0.0, v) for v in mod.values())
    modality_attribution = [{
        "modality": m, "label": MODALITY_LABEL[m], "shap": round(max(-1.0, min(1.0, mod[m] * slope)), 4),
        "shap_logodds": round(mod[m], 4),
        "share_of_upward_push": round(max(0.0, mod[m]) / up_total, 3) if up_total > 0 else 0.0,
    } for m in MODALITIES]

    # ---- top three + narrative ---------------------------------------------
    level = level_of(score)
    alert = score >= model.alert_score
    measured = [x for x in out_factors if x["measured"]]
    raising = [x for x in measured if x["direction"] == "increases_risk"]
    lowering = [x for x in measured if x["direction"] == "decreases_risk"]
    if alert:
        top = (raising + [x for x in measured if x not in raising])[:3]
    else:
        top = measured[:3]

    strong_up = [x for x in raising if x["shap_logodds"] >= REASON_MIN_LOGODDS]
    strong_down = [x for x in lowering if -x["shap_logodds"] >= REASON_MIN_LOGODDS]
    if alert and strong_up:
        reasons = [clause(x["feature"], True, feats, ctx) for x in strong_up[:2]]
        lead = "Risk is high" if level == "high" else "Risk is above the alert level"
        sentence = f"{lead} mainly because {_join(reasons)}."
    elif not alert and strong_down:
        reasons = [clause(x["feature"], False, feats, ctx) for x in strong_down[:2]]
        sentence = f"Risk is low: {_join(reasons)}."
    elif alert:
        sentence = "Risk is above the alert level, mostly because of the squad's overall injury rate rather than one clear factor."
    else:
        sentence = "Risk is low; no single factor stands out."
    caveats = [f"{x['label']} was measured from a camera view C1/C2 mark as unreliable - check it on video."
               for x in top if x.get("reliable") is False]
    explanation = " ".join([sentence] + [f"Note: {c}" for c in caveats])

    factor_lines = []
    for x in top:
        ctx_bits = []
        if x["squad_typical"]:
            ctx_bits.append(f"squad typical {x['squad_typical']}")
        if x["reference"]:
            ctx_bits.append(x["reference"])
        verb = "raised" if x["direction"] == "increases_risk" else "lowered" if x["direction"] == "decreases_risk" else "did not change"
        how = strength(x["shap_logodds"]) if x["direction"] != "neutral" else ""
        x["strength"] = how.strip() or "moderately"
        factor_lines.append(f"{x['label']}: {x['display_value']}" + (f" ({'; '.join(ctx_bits)})" if ctx_bits else "")
                            + f". This {how}{verb} the risk.")

    if model.card.get("synthetic", False):
        notes = notes + ["Development model trained on synthetic data - the score shows how the system works, "
                         "not a validated clinical prediction."]

    thr_p = model.thr
    result = {
        # --- contract fields (contracts/c3_risk.schema.json) ---
        "bowler_id": bowler_id,
        "session_id": session_id or f"{bowler_id}_{summary.get('as_of', datetime.now().date().isoformat())}",
        "model": model.version,
        "risk_score": round(score, 4),
        "risk_level": level,
        "top_factors": [{k: x[k] for k in ("feature", "modality", "value", "shap", "label", "display_value",
                                            "direction", "strength", "shap_logodds", "reference") if k in x}
                        | ({"reliable": x["reliable"]} if "reliable" in x else {}) for x in top],
        "explanation": _cap(explanation),
        # --- optional extras (also in the schema) ---
        "risk_tier": tier_of(score),
        "alert": bool(alert),
        "probability_28d": round(p, 4),
        "base_probability_28d": round(model.base_rate, 4),
        "relative_risk": round(p / model.base_rate, 2) if model.base_rate > 0 else None,
        "horizon_days": HORIZON_DAYS,
        "base_score": round(score0, 4),
        "thresholds": {"score": {"medium": 0.30, "high": 0.55, "critical": 0.75},
                       "probability": {"medium": round(thr_p["alert"], 4), "high": round(thr_p["high"], 4),
                                       "critical": round(thr_p["critical"], 4)}},
        "modality_attribution": modality_attribution,
        "factor_lines": factor_lines,
        "all_factors": out_factors,
        "data_quality": notes,
        "inputs": summary,
        "synthetic_model": bool(model.card.get("synthetic", False)),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }
    result["latency_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    return result


def contract_view(result: dict) -> dict:
    """Only the fields C4 needs (contracts/c3_risk.schema.json required + explanation)."""
    keep = ("bowler_id", "session_id", "model", "risk_score", "risk_level", "explanation")
    out = {k: result[k] for k in keep}
    out["top_factors"] = [{k: f[k] for k in ("feature", "modality", "value", "shap")} for f in result["top_factors"]]
    return out
