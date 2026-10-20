"""
Model-guided "what-if" check of the prevention plan (counterfactual simulation).

The rules (engine.py) decide WHAT is safe and evidence-based to recommend.
This module asks C3's risk model HOW MUCH each action would change the risk for THIS
bowler, so the plan can be ranked by predicted effect:

    1. take the bowler's real inputs (profile, workload log, C2 deliveries)
    2. build one "what-if copy" per action  (e.g. trunk side-bend 52 deg -> 35 deg)
    3. score every copy with the risk model                       -> risk after action
    4. effect = risk now - risk after                                (bigger = better)
    5. greedy search for the best combination of actions            -> "full plan" risk
    6. rank actions by effect; flag effects too small to trust

Design rules
  * Only ACTIONABLE inputs are changed: overs, rest days, technique angles.
    Age, playing level and injury history are never touched.
  * Targets are REALISTIC: an angle is moved just inside the published C2 limit,
    not to an ideal 0 deg; load is brought to the safe ACWR band, not to zero.
  * Safety stays with the rules: the what-if only ranks actions. It never removes a
    referral or a "stop bowling" decision.
  * Model-agnostic: the risk model is passed in as a `scorer` function, so C4 does not
    depend on how C3 is built (XGBoost today, the XGBoost-LSTM hybrid later).
  * The simulation is RETROSPECTIVE: "if this week had followed the action". It is an
    estimate from a statistical model (association, not proven cause) - see `notes`.

Background: counterfactual explanations - Wachter, Mittelstadt & Russell (2018);
DiCE - Mothilal, Sharma & Tan (2020).
"""
from __future__ import annotations

import copy
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Callable, Optional

# A scorer takes (athlete, workloads, c2_rows) as plain dicts and returns the risk score 0-1.
Scorer = Callable[[dict, list, list], float]

MIN_EFFECT = 0.02          # changes smaller than 2 points (0-100 scale) are "too small to trust"
SAFE_ACWR = 1.1            # target inside the 0.8-1.3 band (Gabbett 2016)
ANGLE_MARGIN = {           # how far inside the C2 limit a corrected angle is placed (degrees)
    "shoulder_counter_rotation_deg": 2.0,
    "trunk_lateral_flexion_deg": 5.0,
    "front_knee_flexion_release_deg": 2.0,
}
ANGLE_LIMITS = {           # fallback limits = components/c2_biomech thresholds.py (C2 is the owner)
    "shoulder_counter_rotation_deg": (30.0, "above"),
    "trunk_lateral_flexion_deg": (40.0, "above"),
    "front_knee_flexion_release_deg": (30.0, "below"),
}
ANGLE_TEXT = {
    "shoulder_counter_rotation_deg": ("Fix shoulder counter-rotation (mixed action)", "BM-SCR"),
    "trunk_lateral_flexion_deg": ("Reduce trunk side-bend at release", "BM-TLF"),
    "front_knee_flexion_release_deg": ("Correct the front-knee action at release", "BM-KNEE"),
}


@dataclass
class Action:
    id: str
    title: str
    category: str                      # workload | technique | recovery
    change: str                        # what was changed in the inputs, in plain words
    linked_rules: list[str]            # C4 rules this action belongs to
    apply: Callable[[dict, list, list], tuple[dict, list, list]] = field(repr=False)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _d(v) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def _last7(workloads: list, today: date) -> list[dict]:
    return [w for w in workloads if 0 <= (today - _d(w["session_date"])).days < 7]


def _acwr(workloads: list, today: date) -> Optional[float]:
    acute = sum(w["overs"] for w in _last7(workloads, today))
    chronic = sum(w["overs"] for w in workloads if 0 <= (today - _d(w["session_date"])).days < 28) / 4
    return acute / chronic if chronic > 0 else None


def _runs(days: list[date]) -> list[list[date]]:
    """Group sorted dates into runs of consecutive days."""
    runs: list[list[date]] = []
    for d in sorted(set(days)):
        if runs and (d - runs[-1][-1]).days == 1:
            runs[-1].append(d)
        else:
            runs.append([d])
    return runs


def _angle_status(c2_rows: list, feature: str) -> Optional[tuple[float, float, str]]:
    """Worst breached value of one C2 feature -> (value, limit, rule) or None if no breach."""
    worst = None
    for r in c2_rows:
        f = (r.get("features") or {}).get(feature)
        if not f or f.get("value") is None or not f.get("breach"):
            continue
        limit, rule = (f.get("threshold"), ANGLE_LIMITS[feature][1]) if f.get("threshold") is not None \
            else ANGLE_LIMITS[feature]
        gap = abs(f["value"] - limit)
        if worst is None or gap > abs(worst[0] - worst[1]):
            worst = (float(f["value"]), float(limit), rule)
    return worst


# ---------------------------------------------------------------------------
# candidate actions (only the ones that apply to this bowler)
# ---------------------------------------------------------------------------
def candidate_actions(workloads: list, c2_rows: list, plan: Optional[dict], today: date) -> list[Action]:
    acts: list[Action] = []
    last7 = _last7(workloads, today)
    limits = (plan or {}).get("limits", {})

    # 1. bring the week's load into the safe ACWR band
    acwr = _acwr(workloads, today)
    if acwr is not None and acwr > 1.3:
        # the 4-week average includes this week, so solve a' / ((rest + a') / 4) = SAFE_ACWR for a'
        acute = sum(w["overs"] for w in last7)
        rest = sum(w["overs"] for w in workloads if 7 <= (today - _d(w["session_date"])).days < 28)
        target = SAFE_ACWR * rest / (4 - SAFE_ACWR)
        factor = target / acute

        def scale(a, w, c, factor=factor):
            w = copy.deepcopy(w)
            for s in w:
                if 0 <= (today - _d(s["session_date"])).days < 7:
                    s["overs"] = round(s["overs"] * factor, 1)
            return a, w, c
        acts.append(Action("load_safe_band", "Bring this week's overs into the safe range", "workload",
                           f"last 7 days {acute:g} -> {acute * factor:.0f} overs (ACWR {acwr:.2f} -> {SAFE_ACWR})",
                           ["WL-SPIKE-200", "WL-SPIKE-150"], scale))

    # 2. respect the plan's daily over limit
    daily = limits.get("daily_limit_overs")
    if daily and any(s["overs"] > daily for s in last7):
        def cap(a, w, c, daily=daily):
            w = copy.deepcopy(w)
            for s in w:
                if 0 <= (today - _d(s["session_date"])).days < 7:
                    s["overs"] = min(s["overs"], daily)
            return a, w, c
        acts.append(Action("load_daily_cap", f"Keep to the daily limit of {daily:g} overs", "workload",
                           f"every day in the last 7 days capped at {daily:g} overs",
                           ["TR-MOD", "TR-HIGH", "WL-OVERLIMIT"], cap))

    # 3. add rest days to break runs of 3+ bowling days
    days = [_d(s["session_date"]) for s in last7 if s["overs"] > 0]
    long_runs = [r for r in _runs(days) if len(r) >= 3]
    if long_runs:
        drop = {r[len(r) // 2] for r in long_runs}           # rest in the middle of each run

        def rest(a, w, c, drop=drop):
            return a, [s for s in copy.deepcopy(w) if _d(s["session_date"]) not in drop], c
        acts.append(Action("rest_day", "Add a rest day inside the run of bowling days", "recovery",
                           f"{len(drop)} bowling day(s) turned into rest ({', '.join(d.isoformat() for d in sorted(drop))})",
                           ["WL-CONSEC", "WL-DAYS7", "RC-JUNIOR-REST"], rest))

    # 4. technique: move each breached angle just inside its limit
    for feat in ANGLE_LIMITS:
        st = _angle_status(c2_rows, feat)
        if not st:
            continue
        value, limit, rule = st
        target = limit - ANGLE_MARGIN[feat] if rule == "above" else limit + ANGLE_MARGIN[feat]
        title, rule_id = ANGLE_TEXT[feat]

        def fix(a, w, c, feat=feat, target=target, limit=limit, rule=rule):
            c = copy.deepcopy(c)
            for r in c:
                f = (r.get("features") or {}).get(feat)
                if f and f.get("value") is not None:
                    bad = f["value"] > limit if rule == "above" else f["value"] < limit
                    if bad:
                        f["value"], f["breach"] = target, False
            return a, w, c
        acts.append(Action(f"tech_{feat}", title, "technique", f"{value:g}° -> {target:g}° (limit {limit:g}°)",
                           [rule_id, "PX-LUMBAR" if rule_id != "BM-KNEE" else "PX-KNEE"], fix))
    return acts


# ---------------------------------------------------------------------------
# main entry point
# ---------------------------------------------------------------------------
def tier_of(score: float, cutoffs: dict) -> str:
    tier = "Low"
    for name in ("Moderate", "High", "Critical"):
        if score >= cutoffs[name]:
            tier = name
    return tier


def simulate(athlete: dict, workloads: list, c2_rows: list, scorer: Scorer,
             plan: Optional[dict] = None, kb: Optional[dict] = None,
             today: Optional[date] = None, model_name: str = "unknown") -> dict:
    """Score the bowler now, after each action, and after the best combination of actions."""
    t0 = time.perf_counter()
    today = today or date.today()
    cutoffs = (kb or {}).get("risk_tiers") or {"Moderate": 0.30, "High": 0.55, "Critical": 0.75}
    a0, w0, c0 = copy.deepcopy(athlete), copy.deepcopy(workloads), copy.deepcopy(c2_rows)
    base = float(scorer(a0, w0, c0))
    actions = candidate_actions(w0, c0, plan, today)
    calls = 1

    scenarios = []
    for act in actions:
        risk = float(scorer(*act.apply(a0, w0, c0)))
        calls += 1
        effect = base - risk
        scenarios.append({
            "id": act.id, "title": act.title, "category": act.category, "change": act.change,
            "linked_rules": act.linked_rules, "risk": round(risk, 4), "effect": round(effect, 4),
            "tier": tier_of(risk, cutoffs), "meaningful": effect >= MIN_EFFECT,
        })
    scenarios.sort(key=lambda s: -s["effect"])

    # greedy forward selection: keep adding the action that lowers risk most, while it still helps
    by_id = {a.id: a for a in actions}
    chosen: list[str] = []
    state = (a0, w0, c0)
    best = base
    steps = []
    while True:
        gains = []
        for aid in by_id:
            if aid in chosen:
                continue
            r = float(scorer(*by_id[aid].apply(*state)))
            calls += 1
            gains.append((best - r, aid, r))
        if not gains:
            break
        gain, aid, r = max(gains)
        if gain < MIN_EFFECT:
            break
        state = by_id[aid].apply(*state)
        chosen.append(aid)
        best = r
        steps.append({"id": aid, "title": by_id[aid].title, "risk_after": round(r, 4), "gain": round(gain, 4)})

    rule_effect: dict[str, float] = {}
    for s in scenarios:
        for rid in s["linked_rules"]:
            rule_effect[rid] = max(rule_effect.get(rid, 0.0), s["effect"])

    notes = [
        "Retrospective estimate: the risk the model gives if this week had followed the action.",
        "A statistical model shows association, not proven cause - a physiotherapist confirms the plan.",
        f"Changes under {MIN_EFFECT * 100:.0f} points are marked as too small to trust.",
    ]
    if not actions:
        notes.insert(0, "No changeable risk factor found (no load spike, rest problem or angle breach) - "
                        "the plan is maintenance only.")
    if "synthetic" in model_name:
        notes.append("The risk model is trained on synthetic data - numbers show how the method works, "
                     "not validated clinical effects.")

    return {
        "bowler_id": athlete.get("bowler_id"),
        "model": model_name,
        "base_risk": round(base, 4),
        "base_tier": tier_of(base, cutoffs),
        "scenarios": scenarios,
        "best_plan": {
            "steps": steps,
            "risk": round(best, 4),
            "effect": round(base - best, 4),
            "tier": tier_of(best, cutoffs),
        },
        "rule_effect": {k: round(v, 4) for k, v in rule_effect.items()},
        "min_effect": MIN_EFFECT,
        "notes": notes,
        "model_calls": calls,
        "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
    }
