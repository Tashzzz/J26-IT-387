"""Turn contract-shaped inputs into one model feature row.

The SAME functions are used for training (synthetic data converted to the contract
shapes) and for serving (real C2 rows + the C4 profile and workload log), so the
model never sees features computed two different ways.

Inputs
  c2_rows    list of C2 feature rows (contracts/c2_features.schema.json), one per delivery
  workloads  list of sessions in the C4 workload-log shape
             {session_date, session_type: nets|training|match, overs, rpe?, soreness?}
  athlete    C4 athlete-profile shape
             {bowler_id, birth_year, playing_level, injury_history: [{site, injury_date, returned_to_play}]}

Every function returns (features, notes): notes are plain-English data-quality
messages shown in the app.
"""
from __future__ import annotations

import math
import re
from datetime import date, timedelta
from typing import Any, Iterable, Optional

from .spec import C2_INPUTS, FACTORS, FEATURE_NAMES, TYPICAL_TIME_LOSS_DAYS

NAN = float("nan")
DELIVERY_RE = re.compile(r"_D(\d+)")
MIN_HISTORY_FOR_RATIO = 7       # days of log needed before load ratios are computed
FULL_HISTORY = 28               # days of log for a fully "chronic" baseline
EWMA_WARMUP_DAYS = 120          # look-back used for the exponentially weighted loads


def _as_date(v: Any) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def _get(obj: Any, key: str, default=None):
    """Read a field from a dict or a pydantic model."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _slope(values: list[float]) -> float:
    """Least-squares change per delivery (needs >= 3 deliveries)."""
    n = len(values)
    if n < 3:
        return NAN
    xbar = (n - 1) / 2
    ybar = sum(values) / n
    num = sum((i - xbar) * (v - ybar) for i, v in enumerate(values))
    den = sum((i - xbar) ** 2 for i in range(n))
    return num / den


# ---------------------------------------------------------------------------
# Kinematics (C2 rows)
# ---------------------------------------------------------------------------
def _delivery_order(row: Any, fallback: int) -> int:
    m = DELIVERY_RE.search(str(_get(row, "video_id", "")))
    return int(m.group(1)) if m else fallback


def kinematic_features(c2_rows: Iterable[Any], drop_unreliable: bool = False) -> tuple[dict, list[str], dict]:
    """Aggregate per-delivery C2 values over the session.

    For each C2 feature: mean, peak (largest), slope across deliveries (fatigue drift)
    and share of deliveries past the published limit. Values that C1/C2 marked
    `reliable: false` are used unless drop_unreliable=True, but they are counted so the
    explanation can carry a "check on video" caveat.
    """
    rows = sorted(list(c2_rows), key=lambda r: _delivery_order(r, 0))
    feats: dict = {}
    notes: list[str] = []
    summary = {"deliveries": len(rows), "per_feature": {}}

    for c2_name, cfg in C2_INPUTS.items():
        p = cfg["prefix"]
        vals, breaches, unreliable = [], [], 0
        for r in rows:
            f = (_get(r, "features") or {}).get(c2_name)
            if f is None:
                continue
            v = _get(f, "value")
            if v is None or (isinstance(v, float) and math.isnan(v)):
                continue
            reliable = _get(f, "reliable", True)
            if reliable is False:
                unreliable += 1
                if drop_unreliable:
                    continue
            vals.append(float(v))
            b = _get(f, "breach")
            if b is None and cfg["threshold"] is not None:
                b = v > cfg["threshold"] if cfg["rule"] == "above" else v < cfg["threshold"]
            breaches.append(bool(b))
        summary["per_feature"][c2_name] = {"n": len(vals), "unreliable": unreliable}
        if p == "knee_ffc":
            feats["knee_ffc_mean"] = sum(vals) / len(vals) if vals else NAN
            continue
        if p == "knee_rel":
            feats["knee_rel_mean"] = sum(vals) / len(vals) if vals else NAN
            feats["knee_rel_breach_share"] = sum(breaches) / len(breaches) if breaches else NAN
            continue
        feats[f"{p}_mean"] = sum(vals) / len(vals) if vals else NAN
        feats[f"{p}_peak"] = max(vals) if vals else NAN
        feats[f"{p}_slope"] = _slope(vals)
        feats[f"{p}_breach_share"] = sum(breaches) / len(breaches) if breaches else NAN

    if not rows:
        notes.append("No delivery analysed by C2 yet - technique factors are unknown, so the score "
                     "uses workload and athlete history only.")
    elif len(rows) < 3:
        notes.append(f"Only {len(rows)} delivery analysed - technique averages are less certain and the "
                     "change-across-the-spell factors need at least 3 deliveries.")
    for c2_name, s in summary["per_feature"].items():
        if s["unreliable"]:
            what = "were left out" if drop_unreliable else "are used but should be checked on video"
            label = FACTORS.get(c2_name, {}).get("label", c2_name)
            notes.append(f"{label}: {s['unreliable']} value(s) come from a camera view C1/C2 mark as unreliable "
                         f"and {what}.")
    return feats, notes, summary


# ---------------------------------------------------------------------------
# Workload (C4 workload log)
# ---------------------------------------------------------------------------
def workload_features(workloads: Iterable[Any], as_of: date) -> tuple[dict, list[str], dict]:
    """Acute / chronic bowling load, load ratios, spikes and rest from the session log.

    Deliveries = overs x 6. Days with no logged session count as rest days.
    """
    sessions = []
    for w in workloads:
        d = _as_date(_get(w, "session_date"))
        if d > as_of:
            continue
        sessions.append((d, float(_get(w, "overs", 0) or 0) * 6.0, str(_get(w, "session_type", "nets"))))

    keys = ["deliveries_7d", "deliveries_28d_weekly", "acwr_7_28", "ewma_ratio", "differential_load_7d",
            "bowling_days_7d", "matches_14d", "max_daily_deliveries_7d", "rest_days_7d", "consecutive_bowling_days"]
    if not sessions:
        return ({k: NAN for k in keys},
                ["No workload sessions logged - workload factors are unknown."],
                {"sessions": 0, "history_days": 0})

    first = max(min(s[0] for s in sessions), as_of - timedelta(days=EWMA_WARMUP_DAYS - 1))
    n = (as_of - first).days + 1
    deliv = [0.0] * n
    logged = [False] * n
    match = [False] * n
    for d, balls, kind in sessions:
        i = (d - first).days
        if i < 0:
            continue
        deliv[i] += balls
        logged[i] = True
        match[i] = match[i] or kind == "match"
    history_days = min(n, (as_of - min(s[0] for s in sessions)).days + 1)

    last = lambda arr, k: arr[max(0, n - k):]
    d7 = sum(last(deliv, 7))
    f: dict = {"deliveries_7d": d7}
    if history_days >= MIN_HISTORY_FOR_RATIO:
        window = min(FULL_HISTORY, history_days)
        weekly = sum(last(deliv, window)) / (window / 7)
        f["deliveries_28d_weekly"] = weekly
        f["acwr_7_28"] = d7 / weekly if weekly > 0 else NAN
        a = c = deliv[0]
        for x in deliv[1:]:
            a += (2 / 8) * (x - a)
            c += (2 / 29) * (x - c)
        f["ewma_ratio"] = a / c if c > 0 else NAN
    else:
        f["deliveries_28d_weekly"] = f["acwr_7_28"] = f["ewma_ratio"] = NAN

    if history_days >= 14:
        sum7 = [sum(deliv[max(0, i - 6): i + 1]) for i in range(n)]
        diff = 0.0
        for i in range(n):
            change = sum7[i] - (sum7[i - 7] if i >= 7 else 0.0)
            diff = change if i == 0 else diff + (2 / 8) * (change - diff)
        f["differential_load_7d"] = diff
    else:
        f["differential_load_7d"] = NAN

    bowled = [x > 0 for x in deliv]
    f["bowling_days_7d"] = float(sum(last(bowled, 7)))
    f["matches_14d"] = float(sum(last(match, 14)))
    f["max_daily_deliveries_7d"] = max(last(deliv, 7))
    f["rest_days_7d"] = float(sum(1 for x in last(logged, 7) if not x))
    end = n - 1 if bowled[-1] or n < 2 else n - 2     # run ending today, or yesterday if not bowled today
    run = 0
    while end - run >= 0 and bowled[end - run]:
        run += 1
    f["consecutive_bowling_days"] = float(run)

    notes = []
    if history_days < MIN_HISTORY_FOR_RATIO:
        notes.append(f"Only {history_days} day(s) of workload history - load ratios need at least "
                     f"{MIN_HISTORY_FOR_RATIO} days and are left out.")
    elif history_days < 21:
        notes.append(f"Only {history_days} days of workload history (21+ recommended) - the acute:chronic "
                     "ratio is approximate.")
    return f, notes, {"sessions": len(sessions), "history_days": history_days}


# ---------------------------------------------------------------------------
# Athlete profile (C4 athlete registry)
# ---------------------------------------------------------------------------
def athlete_features(athlete: Any, as_of: date) -> tuple[dict, list[str], dict]:
    notes: list[str] = []
    birth_year = int(_get(athlete, "birth_year"))
    level = str(_get(athlete, "playing_level", "club")).lower()
    f: dict = {
        "age": float(as_of.year - birth_year),
        "level_school": float(level == "school"),
        "level_club": float(level == "club"),
        "level_higher": float(level not in ("school", "club")),
    }

    injuries = []
    for i in _get(athlete, "injury_history", []) or []:
        d = _as_date(_get(i, "injury_date"))
        if d <= as_of:
            injuries.append((d, str(_get(i, "site", "other")), bool(_get(i, "returned_to_play", True))))
    last12 = [x for x in injuries if (as_of - x[0]).days <= 365]
    f["lumbar_12m"] = float(any(s == "lumbar" for _, s, _r in last12))
    f["hamstring_12m"] = float(any(s == "hamstring" for _, s, _r in last12))
    f["side_strain_12m"] = float(any(s == "side_strain" for _, s, _r in last12))
    f["injuries_12m"] = float(len(last12))
    f["injuries_6m"] = float(sum(1 for d, _s, _r in last12 if (as_of - d).days <= 182))

    if last12:
        d, site, returned = max(last12, key=lambda x: x[0])
        days = (as_of - d).days
        f["months_since_last_injury"] = round(days / 30.44, 2)
        if not returned:
            f["days_since_return"] = 0.0
            notes.append(f"The profile shows a {site.replace('_', ' ')} injury from {d.isoformat()} without return "
                         "to play - the bowler should not bowl until cleared. The score assumes normal bowling.")
        else:
            est = days - TYPICAL_TIME_LOSS_DAYS.get(site, 14)
            f["days_since_return"] = float(min(365, max(0, est)))
    else:
        f["months_since_last_injury"] = 24.0      # rule-based fill: no injury in the last 12 months
        f["days_since_return"] = 365.0
    summary = {"age": f["age"], "playing_level": level, "injuries_12m": int(f["injuries_12m"])}
    return f, notes, summary


# ---------------------------------------------------------------------------
# All together
# ---------------------------------------------------------------------------
def build_features(c2_rows: Iterable[Any], workloads: Iterable[Any], athlete: Any,
                   as_of: Optional[date] = None, drop_unreliable: bool = False) -> tuple[dict, list[str], dict]:
    """Return (feature dict in FEATURE_NAMES order, data-quality notes, input summary)."""
    as_of = as_of or date.today()
    k, nk, sk = kinematic_features(c2_rows, drop_unreliable)
    w, nw, sw = workload_features(workloads, as_of)
    a, na, sa = athlete_features(athlete, as_of)
    merged = {**k, **w, **a}
    feats = {name: merged.get(name, NAN) for name in FEATURE_NAMES}
    summary = {"as_of": as_of.isoformat(), "kinematics": sk, "workload": sw, "athlete": sa}
    return feats, nk + nw + na, summary
