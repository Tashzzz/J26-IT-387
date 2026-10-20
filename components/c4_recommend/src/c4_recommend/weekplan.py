"""
Week planner: model-guided counterfactual workload planning (C4 research, layer 2).

Layer 1 (whatif.py, "Model check") re-scores each action of the CURRENT week's plan with C3.
This layer looks FORWARD: it chooses the NEXT week's bowling by simulating candidate weeks.

Research question
    Can C3's trained injury-risk model be used to *choose* a bowler's next week of bowling -
    instead of fixed rule-based cuts per risk tier - so that overs are only taken away where the
    model predicts they buy real protection?

Why this is more than if-then rules
    The rule engine (engine.py) gives every High-tier bowler the same limits (2 bowling days,
    40 % of the daily limit) whatever is driving the risk. Here every possible week is SIMULATED:
    the planned sessions are added to the workload log, C3's own feature code recomputes the load
    features (ACWR, EWMA ratio, rest days, days in a row ...) and C3's trained model scores the
    result, followed by a return to the usual week (look-ahead), so a plan that rests now but
    causes a load spike on return is not rewarded. This is a counterfactual / actionable-recourse
    approach applied to training-load prescription.

Method (one call to `week_plan`)
    1. usual week     the bowler's own pattern from the last 4 weeks (weekdays, overs, nets/match)
    2. guardrails     hard limits the model can never override: ECB daily overs by age group,
                      max 4 bowling days in 7, max 2 in a row, NO bowling at Critical tier or
                      before return to play
    3. candidates     every subset of the usual bowling days x volume (100 % ... 40 %), plus a
                      rest week and the rule engine's own week, all inside the guardrails
    4. simulation     each candidate (+ the usual week after it) is scored day by day by C3;
                      risk_14d = predicted chance of injury over the 14 days, with risk accruing
                      per delivery bowled (C3's calibrated 28-day probability for that day's
                      state, spread over the bowler's usual 28-day deliveries)
    5. selection      tradeoff (default): maximise  risk removed - over_value x overs given up,
                      one exchange rate for the whole squad (0.15 points of 14-day risk per
                      over, chosen on C3's validation bowlers - experiments/whatif_frontier.py).
                      keep_bowling / lower_risk anchor to the rule plan; state = ablation.
    6. technique      separate long-term what-if: predicted risk if each breached C2 angle were
                      brought back to its published limit (technique cannot change in a week)

Evaluation (experiments/weekplan_study.py, weekplan_frontier.py)
    Held-out C3 test bowlers; every plan is scored with the TRUE hazard of the generator that
    produced C3's training data (experiments/oracle.py), not with C3 itself.

Assumptions (shown to the user)
    * Technique (C2 angles) is unchanged during the planned week; the week after is the usual week.
    * C3 is trained on synthetic, literature-informed data; predicted risk changes are model
      estimates of association, not proven causal effects. A physiotherapist makes the final call.
"""
from __future__ import annotations

import copy
import itertools
import math
import statistics
import sys
import time
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Optional

from .models import (AthleteCreate, UpstreamInput, WeekPlanDay, WeekPlanOption, WeekPlanResult,
                     WeekPlanTechnique, WorkloadCreate)

C3_SRC = Path(__file__).resolve().parents[3] / "c3_risk" / "src"

SCALES = (1.0, 0.85, 0.7, 0.55, 0.4)        # share of the usual overs kept on a bowling day
MAX_DAYS_IN_7 = 4                           # ECB directive (knowledge_base: Low-tier max days)
MAX_CONSECUTIVE = 2                         # ECB directive: at most 2 bowling days in a row
NEAR_MIN_TOLERANCE = 0.02                   # risk-score points; "as good as the best" band
# tradeoff mode: an over is only cut if it buys at least 0.15 percentage points of predicted 14-day
# injury risk. Chosen on C3's VALIDATION bowlers (experiments/weekplan_frontier.py) as the rate at which the
# model gives up no more squad overs than the rule engine; evaluated once on the held-out test bowlers.
DEFAULT_OVER_VALUE = 0.0015
MIN_SESSION_OVERS = 1.0                     # smaller planned sessions are dropped (not a real session)
TEMPLATE_WEEKS = 4
WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

TECHNIQUE_LIMITS = {   # C2 published limits (same as c3_risk.spec.C2_INPUTS)
    "shoulder_counter_rotation_deg": ("above", 30.0, "Shoulder counter-rotation"),
    "trunk_lateral_flexion_deg": ("above", 40.0, "Trunk side-bend at release"),
    "front_knee_flexion_release_deg": ("below", 30.0, "Front-knee bend at release"),
}


class WeekPlanUnavailable(RuntimeError):
    """The C3 model (or the C3 package) is not available on this computer."""


# ---------------------------------------------------------------------------
# C3 access
# ---------------------------------------------------------------------------
def _c3():
    try:
        import c3_risk  # noqa: F401
    except ImportError:
        if str(C3_SRC) not in sys.path:
            sys.path.insert(0, str(C3_SRC))
    try:
        from c3_risk import features as c3_features
        from c3_risk.model import ModelNotReady, get_model
    except Exception as e:  # pragma: no cover - depends on the install
        raise WeekPlanUnavailable(f"C3 package not available ({e}). Install it: pip install -e components/c3_risk") from e
    try:
        return get_model(), c3_features
    except ModelNotReady as e:
        raise WeekPlanUnavailable(str(e)) from e


# ---------------------------------------------------------------------------
# Plain dicts in the C4 workload shape (works with pydantic models or dicts)
# ---------------------------------------------------------------------------
def _g(obj: Any, key: str, default=None):
    return obj.get(key, default) if isinstance(obj, dict) else getattr(obj, key, default)


def _as_date(v: Any) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def _sessions(workloads, as_of: date) -> list[dict]:
    out = []
    for w in workloads:
        d = _as_date(_g(w, "session_date"))
        if d <= as_of:
            out.append({"session_date": d, "session_type": str(_g(w, "session_type", "nets")),
                        "overs": float(_g(w, "overs", 0) or 0)})
    return out


def _athlete_dict(athlete) -> dict:
    if isinstance(athlete, dict):
        return athlete
    return athlete.model_dump(mode="python")


# ---------------------------------------------------------------------------
# 1. Usual week
# ---------------------------------------------------------------------------
def usual_week(workloads, as_of: date) -> list[dict]:
    """The bowler's own weekly pattern, projected onto the 7 days after `as_of`.

    For each weekday, the last 4 occurrences are checked: if he bowled on at least 2 of them,
    the usual session is the median overs of those days and the most common session type.
    With less than 2 weeks of log, last week is simply repeated.
    """
    per_day: dict[date, list] = {}
    for s in _sessions(workloads, as_of):
        if s["overs"] > 0:
            per_day.setdefault(s["session_date"], []).append(s)
    first = min(per_day) if per_day else as_of
    history_days = (as_of - first).days + 1
    week = []
    for k in range(1, 8):
        d = as_of + timedelta(days=k)
        if history_days >= 14:
            past = [d - timedelta(days=7 * j) for j in range(1, TEMPLATE_WEEKS + 1)]
            past = [p for p in past if p >= first]
            bowled = [p for p in past if p in per_day]
            need = max(1, math.ceil(len(past) / 2))
        else:
            bowled = [d - timedelta(days=7)] if (d - timedelta(days=7)) in per_day else []
            need = 1
        if len(bowled) >= need and bowled:
            overs = statistics.median(sum(x["overs"] for x in per_day[p]) for p in bowled)
            kinds = Counter(x["session_type"] for p in bowled for x in per_day[p])
            week.append({"date": d, "session_type": kinds.most_common(1)[0][0], "overs": round(overs * 2) / 2})
        else:
            week.append({"date": d, "session_type": "rest", "overs": 0.0})
    return week


# ---------------------------------------------------------------------------
# 2. Guardrails (hard safety limits - never traded for volume)
# ---------------------------------------------------------------------------
def trailing_run(workloads, as_of: date) -> int:
    """Bowling days in a row ending on `as_of` (they count towards the next days' run)."""
    bowled = {s["session_date"] for s in _sessions(workloads, as_of) if s["overs"] > 0}
    run, d = 0, as_of
    while d in bowled:
        run += 1
        d -= timedelta(days=1)
    return run


def recent_bowling_days(workloads, as_of: date) -> set[date]:
    return {s["session_date"] for s in _sessions(workloads, as_of)
            if s["overs"] > 0 and (as_of - s["session_date"]).days < 7}


def apply_guardrails(week: list[dict], daily_cap: float, stop: bool, run_before: int = 0,
                     past_days: Optional[set] = None) -> list[dict]:
    """Return a copy of `week` that respects the hard limits.

    * stop             -> no bowling at all (Critical tier / not returned to play)
    * daily_cap        -> overs per day capped at the ECB daily limit for the age group
    * max 2 in a row   -> the smaller session of a 3-day run is dropped (runs continue from the log)
    * max 4 in any 7   -> rolling window including the last days of the log; smallest sessions dropped
    """
    out = [dict(d) for d in week]
    for d in out:
        if stop or d["overs"] < MIN_SESSION_OVERS:
            d["overs"] = 0.0
        d["overs"] = min(d["overs"], daily_cap)
        if d["overs"] <= 0:
            d["overs"], d["session_type"] = 0.0, "rest"

    # max 2 consecutive bowling days (counting the run that ends on as_of)
    run = run_before
    for i, d in enumerate(out):
        if d["overs"] > 0:
            run += 1
            if run > MAX_CONSECUTIVE:
                d["overs"], d["session_type"] = 0.0, "rest"
                run = 0
        else:
            run = 0

    # max 4 bowling days in any 7-day window (log days count too)
    past = sorted(past_days or [])
    for i in range(len(out)):
        win_end = out[i]["date"]
        win_start = win_end - timedelta(days=6)
        while True:
            planned = [j for j in range(i + 1) if out[j]["overs"] > 0 and out[j]["date"] >= win_start]
            logged = [p for p in past if win_start <= p <= win_end]
            if len(planned) + len(logged) <= MAX_DAYS_IN_7 or not planned:
                break
            drop = min(planned, key=lambda j: (out[j]["session_type"] == "match", out[j]["overs"], -j))
            out[drop]["overs"], out[drop]["session_type"] = 0.0, "rest"
    return out


# ---------------------------------------------------------------------------
# 3. Candidate weeks
# ---------------------------------------------------------------------------
def candidate_weeks(usual: list[dict], guard: dict) -> list[list[dict]]:
    bowling = [i for i, d in enumerate(usual) if d["overs"] > 0]
    seen, out = set(), []
    subsets = [s for r in range(len(bowling), -1, -1) for s in itertools.combinations(bowling, r)]
    for keep in subsets:
        for scale in SCALES:
            week = []
            for i, d in enumerate(usual):
                o = round(d["overs"] * scale * 2) / 2 if i in keep else 0.0
                week.append({"date": d["date"], "session_type": d["session_type"] if o > 0 else "rest", "overs": o})
            week = apply_guardrails(week, **guard)
            key = tuple(d["overs"] for d in week)
            if key not in seen:
                seen.add(key)
                out.append(week)
            if not keep:
                break
    return out


# ---------------------------------------------------------------------------
# 4. Simulation with C3
# ---------------------------------------------------------------------------
class Simulator:
    """Scores planned weeks with the trained C3 model (batched).

    For every candidate the planned week is followed by the usual week again (look-ahead), so a
    plan that rests now but causes a load spike on return is not rewarded. Two numbers per plan:
      * daily risk score  C3's 0-1 score for the bowler's state on each planned day (display, tiers)
      * risk_14d          expected probability of an injury over the 14 days (plan week + return
                          week): C3's calibrated 28-day probability for each day's state, spread
                          over the balls a bowler usually bowls in 28 days, times the balls planned
                          that day (exposure: risk accrues per delivery bowled, none on rest days)
    """

    def __init__(self, model, c3_features, athlete: dict, workloads, c2_rows, as_of: date):
        self.model, self.F = model, c3_features
        self.athlete, self.as_of = athlete, as_of
        self.log = _sessions(workloads, as_of)
        self.c2 = [r.model_dump(mode="python") if hasattr(r, "model_dump") else r for r in c2_rows]
        self.kin, self.kin_notes, _ = c3_features.kinematic_features(self.c2)

    def _row(self, sessions: list[dict], day: date, kin: Optional[dict] = None) -> dict:
        w, _, _ = self.F.workload_features(sessions, day)
        a, _, _ = self.F.athlete_features(self.athlete, day)
        merged = {**(kin or self.kin), **w, **a}
        return {n: merged.get(n, float("nan")) for n in self.F.FEATURE_NAMES}

    def scores(self, rows: list[dict]) -> list[float]:
        return [self.model.score(float(p)) for p in self.model.probability(rows)]

    def now(self, kin: Optional[dict] = None) -> float:
        return self.scores([self._row(self.log, self.as_of, kin)])[0]

    def weeks(self, weeks: list[list[dict]]) -> list[list[float]]:
        """Daily risk score for each planned week (7 values per week)."""
        return [e["daily"] for e in self.evaluate(weeks)]

    def evaluate(self, weeks: list[list[dict]], follow: Optional[list[dict]] = None) -> list[dict]:
        follow = follow if follow is not None else (weeks[0] if weeks else [])
        n_days = 7 + (7 if follow else 0)
        rows, balls = [], []
        for week in weeks:
            seq = list(week) + [{**d, "date": d["date"] + timedelta(days=7)} for d in (follow or [])]
            planned = []
            for d in seq:
                if d["overs"] > 0:
                    planned.append({"session_date": d["date"], "session_type": d["session_type"], "overs": d["overs"]})
                rows.append(self._row(self.log + list(planned), d["date"]))
                balls.append(d["overs"] * 6)
        if not rows:
            return []
        probs = [float(p) for p in self.model.probability(rows)]
        usual_balls_28 = max(6.0, 4 * sum(d["overs"] * 6 for d in (follow or weeks[0])))
        out = []
        for i in range(len(weeks)):
            p = probs[i * n_days:(i + 1) * n_days]
            b = balls[i * n_days:(i + 1) * n_days]
            surv = 1.0
            for pt, bt in zip(p, b):
                surv *= 1 - min(1.0, pt / usual_balls_28 * bt)
            out.append({"daily": [self.model.score(x) for x in p[:7]], "risk_14d": 1 - surv})
        return out


# ---------------------------------------------------------------------------
# 5. Selection + result
# ---------------------------------------------------------------------------
def _option(week, ev, usual_overs, label) -> WeekPlanOption:
    total = sum(d["overs"] for d in week)
    daily = ev["daily"]
    return WeekPlanOption(
        label=label,
        days=[WeekPlanDay(session_date=d["date"], weekday=WEEKDAY[d["date"].weekday()], session_type=d["session_type"],
                        overs=d["overs"]) for d in week],
        total_overs=round(total, 1),
        bowling_days=sum(1 for d in week if d["overs"] > 0),
        matches=sum(1 for d in week if d["overs"] > 0 and d["session_type"] == "match"),
        overs_kept_pct=round(100 * total / usual_overs, 0) if usual_overs > 0 else 100.0,
        peak_risk=round(max(daily), 3),
        end_risk=round(daily[-1], 3),
        daily_risk=[round(x, 3) for x in daily],
        risk_14d=round(ev["risk_14d"], 4),
    )


def rule_week(usual: list[dict], daily_limit: float, max_days: int, stop: bool, run_before: int = 0,
              acwr: Optional[float] = None, chronic_weekly: float = 0.0) -> list[dict]:
    """The rule engine's plan as a concrete week: its tier limits applied to the usual week.

    daily limit + max bowling days per week (by tier), 2-in-a-row, and the WL-SPIKE rules
    (ACWR > 1.5: hold the week at 1.3 x the usual weekly overs). Critical -> no bowling.
    """
    week = apply_guardrails(usual, daily_cap=daily_limit, stop=stop or max_days == 0, run_before=run_before)
    keep = sorted([i for i, d in enumerate(week) if d["overs"] > 0],
                  key=lambda i: (week[i]["session_type"] != "match", -week[i]["overs"], i))
    for i in keep[max_days:]:
        week[i]["overs"], week[i]["session_type"] = 0.0, "rest"
    if acwr is not None and acwr > 1.5 and chronic_weekly > 0:
        total = sum(d["overs"] for d in week)
        cap = round(chronic_weekly * 1.3, 1)
        if total > cap:
            for d in week:
                d["overs"] = round(d["overs"] * cap / total * 2) / 2
                if d["overs"] < MIN_SESSION_OVERS:
                    d["overs"], d["session_type"] = 0.0, "rest"
    return week


def select(cands: list[list[dict]], evals: list[dict], usual_idx: int, rules_idx: int, mode: str,
           state_target: float = 0.30, over_value: float = DEFAULT_OVER_VALUE) -> tuple[int, str]:
    """Pick the plan.

    tradeoff      (default) best balance of predicted risk removed vs overs given up, at one exchange
                  rate for the whole squad: maximise (risk_usual - risk_plan) - over_value x overs given up.
                  Overs are only cut where the model predicts they buy real protection.
    keep_bowling  most overs whose predicted 14-day risk is no higher than the rule plan's
    lower_risk    lowest predicted 14-day risk with at least as many overs as the rule plan
    state         (ablation) most overs whose peak daily C3 score is under the Moderate cut-off
    """
    vol = [sum(x["overs"] for x in w) for w in cands]
    matches = [sum(1 for x in w if x["overs"] > 0 and x["session_type"] == "match") for w in cands]
    r14 = [e["risk_14d"] for e in evals]
    eps = 1e-9
    if mode == "state":
        peak = [max(e["daily"]) for e in evals]
        best = lambda idx: max(idx, key=lambda i: (vol[i], matches[i], -peak[i]))
        if peak[usual_idx] < state_target:
            return usual_idx, "no_change"
        ok = [i for i in range(len(cands)) if peak[i] < state_target]
        if ok:
            return best(ok), "optimised"
        floor = min(peak)
        return best([i for i in range(len(cands)) if peak[i] <= floor + NEAR_MIN_TOLERANCE]), "optimised"
    if mode == "tradeoff":
        gain = [(r14[usual_idx] - r14[i]) - over_value * (vol[usual_idx] - vol[i]) for i in range(len(cands))]
        top = max(gain)
        i = max([j for j in range(len(cands)) if gain[j] >= top - eps], key=lambda j: (vol[j], matches[j]))
    elif mode == "lower_risk":
        ok = [i for i in range(len(cands)) if vol[i] >= vol[rules_idx] - eps]
        i = min(ok, key=lambda i: (round(r14[i], 6), -vol[i], -matches[i]))
    else:  # keep_bowling
        ok = [i for i in range(len(cands)) if r14[i] <= r14[rules_idx] + eps]
        i = max(ok, key=lambda i: (vol[i], matches[i], -r14[i]))
    if [d["overs"] for d in cands[i]] == [d["overs"] for d in cands[usual_idx]]:
        return i, "no_change"
    if [d["overs"] for d in cands[i]] == [d["overs"] for d in cands[rules_idx]]:
        return i, "rule_plan_kept"
    return i, "optimised"


def _technique_whatif(sim: Simulator, base_now: float) -> list[WeekPlanTechnique]:
    out = []
    for feat, (rule, limit, label) in TECHNIQUE_LIMITS.items():
        vals = [(_g(r["features"].get(feat) or {}, "value")) for r in sim.c2 if feat in r.get("features", {})]
        vals = [v for v in vals if v is not None]
        if not vals:
            continue
        breached = [v for v in vals if (v > limit if rule == "above" else v < limit)]
        if not breached:
            continue
        rows = copy.deepcopy(sim.c2)
        for r in rows:
            f = r.get("features", {}).get(feat)
            if f and f.get("value") is not None:
                v = f["value"]
                f["value"] = min(v, limit) if rule == "above" else max(v, limit)
                f["breach"] = False
        kin, _, _ = sim.F.kinematic_features(rows)
        after = sim.now(kin)
        out.append(WeekPlanTechnique(
            feature=feat, label=label, limit=limit,
            current=round(max(breached) if rule == "above" else min(breached), 1),
            breached_deliveries=len(breached), deliveries=len(vals),
            risk_now=round(base_now, 3), risk_if_corrected=round(after, 3),
            change=round(after - base_now, 3)))
    return sorted(out, key=lambda t: t.change)


def _days_text(opt: WeekPlanOption) -> str:
    days = [f"{d.weekday} {d.overs:g}" for d in opt.days if d.overs > 0]
    return ", ".join(days) if days else "no bowling"


def _sentence(usual: WeekPlanOption, rules: WeekPlanOption, rec: WeekPlanOption, status: str, mode: str,
              stop_reason: Optional[str], over_value: float) -> str:
    pct = lambda x: f"{x * 100:.1f}%"
    if stop_reason:
        return f"No bowling this week: {stop_reason}. The model is never used to override this safety rule."
    if status == "no_change":
        tail = (f" Cutting overs would buy little protection (less than {over_value * 100:.2f} points of risk per over)."
                if mode == "tradeoff" else "")
        return (f"Keep your usual week ({_days_text(usual)} overs). Predicted chance of injury over the next 2 weeks: "
                f"{pct(usual.risk_14d)}.{tail}")
    if status == "rule_plan_kept":
        return (f"Follow the rule plan ({_days_text(rules)} overs): it is the best option the model can find, "
                f"chance of injury over the next 2 weeks {pct(rules.risk_14d)} instead of {pct(usual.risk_14d)} "
                "for your usual week.")
    return (f"Bowl {rec.total_overs:g} overs this week ({_days_text(rec)}) instead of your usual {usual.total_overs:g} "
            f"({_days_text(usual)}). The model predicts your chance of injury over the next 2 weeks falls from "
            f"{pct(usual.risk_14d)} to {pct(rec.risk_14d)}. The rule plan would be {rules.total_overs:g} overs "
            f"({pct(rules.risk_14d)}).")


class Context:
    """Everything the selection step needs for one bowler (candidates already scored by C3)."""
    pass


def prepare(athlete, workloads: list, upstream, kb: dict, as_of: Optional[date] = None, plan=None,
            model=None, c3_features=None) -> Context:
    """Guardrails, usual week, rule week, candidate weeks and their C3 evaluation."""
    ctx = Context()
    as_of = as_of or date.today()
    if model is None or c3_features is None:
        model, c3_features = _c3()
    a = _athlete_dict(athlete)
    up = upstream if isinstance(upstream, UpstreamInput) else UpstreamInput(**(upstream or {}))
    if plan is None:
        from .engine import generate_plan
        ath = athlete if isinstance(athlete, AthleteCreate) else AthleteCreate(**{"dominant_arm": "right", **a})
        wls = [w if isinstance(w, WorkloadCreate) else WorkloadCreate(**w) for w in workloads]
        plan = generate_plan(ath, wls, up, kb, today=as_of)
    c2_rows = [r for r in up.c2 if r.bowler_id == a["bowler_id"]]
    sim = Simulator(model, c3_features, a, workloads, c2_rows, as_of)

    age = as_of.year - int(a["birth_year"])
    group = next((n for n, g in kb["limits"]["age_groups"].items() if age <= g["max_age"]), "Senior")
    daily_cap = float(kb["limits"]["age_groups"][group]["daily_limit"])
    not_returned = [i for i in a.get("injury_history", []) or []
                    if not _g(i, "returned_to_play", True) and _as_date(_g(i, "injury_date")) <= as_of]
    stop_reason = ("Critical risk tier - physiotherapist clearance first" if plan.risk_tier == "Critical" else
                   "not yet returned to play after injury" if not_returned else None)
    run_before = trailing_run(workloads, as_of)
    guard = {"daily_cap": daily_cap, "stop": False, "run_before": run_before,
             "past_days": recent_bowling_days(workloads, as_of)}
    raw = usual_week(workloads, as_of)
    usual = apply_guardrails(raw, **guard)
    rules = rule_week(usual, plan.limits.daily_limit_overs, plan.limits.max_bowling_days_per_week,
                      stop=stop_reason is not None, run_before=run_before,
                      acwr=plan.metrics.get("acwr"), chronic_weekly=plan.metrics.get("chronic_weekly_overs") or 0.0)
    cands, seen = [], set()
    for c in [usual, rules] + candidate_weeks(usual, guard):
        key = tuple(d["overs"] for d in c)
        if key not in seen:
            seen.add(key)
            cands.append(c)
    ctx.__dict__.update(
        as_of=as_of, model=model, athlete=a, plan=plan, sim=sim, group=group, daily_cap=daily_cap,
        stop_reason=stop_reason, raw_usual=raw, usual=usual, rules=rules, cands=cands,
        rules_idx=[tuple(d["overs"] for d in c) for c in cands].index(tuple(d["overs"] for d in rules)),
        evals=sim.evaluate(cands, follow=usual))
    return ctx


def choose(ctx: Context, kb: dict, mode: str = "tradeoff", over_value: float = DEFAULT_OVER_VALUE) -> tuple[int, str]:
    if ctx.stop_reason:
        return ctx.rules_idx, "safety_stop"
    return select(ctx.cands, ctx.evals, 0, ctx.rules_idx, mode, kb["risk_tiers"]["Moderate"], over_value)


def week_plan(athlete: AthleteCreate | dict, workloads: list, upstream: UpstreamInput | dict | None,
            kb: dict, as_of: Optional[date] = None, plan=None, model=None, c3_features=None,
            mode: str = "tradeoff", over_value: float = DEFAULT_OVER_VALUE) -> WeekPlanResult:
    """Model-guided next-week plan for one bowler (see module docstring).

    plan        the rule engine's PreventionPlan for the same inputs (generated here if not given)
    mode        tradeoff (default) | keep_bowling | lower_risk | state (ablation) - see select()
    over_value  tradeoff exchange rate: predicted 14-day risk (probability) one over must buy
    """
    t0 = time.perf_counter()
    ctx = prepare(athlete, workloads, upstream, kb, as_of, plan, model, c3_features)
    idx, status = choose(ctx, kb, mode, over_value)
    model, sim, plan, a = ctx.model, ctx.sim, ctx.plan, ctx.athlete
    cands, evals, usual, rules, rules_idx = ctx.cands, ctx.evals, ctx.usual, ctx.rules, ctx.rules_idx
    daily_cap, group, stop_reason, tier = ctx.daily_cap, ctx.group, ctx.stop_reason, plan.risk_tier
    risk_now = sim.now()
    usual_overs = sum(d["overs"] for d in usual)

    usual_opt = _option(usual, evals[0], usual_overs, "Usual week")
    rules_opt = _option(rules, evals[rules_idx], usual_overs, "Rule plan")
    rec_opt = _option(cands[idx], evals[idx], usual_overs, "Recommended week")
    # alternatives on the risk / volume frontier for the coach to compare
    order = sorted(range(len(cands)), key=lambda i: (-sum(d["overs"] for d in cands[i]), evals[i]["risk_14d"]))
    frontier, best_risk = [], math.inf
    for i in order:
        if evals[i]["risk_14d"] < best_risk - 1e-9:
            best_risk = evals[i]["risk_14d"]
            frontier.append(i)
    alts = [_option(cands[i], evals[i], usual_overs, f"Option {n + 1}")
            for n, i in enumerate([i for i in frontier if i not in (0, idx, rules_idx)][:4])]

    technique = _technique_whatif(sim, risk_now)
    assumptions = [
        "Technique (C2 angles) is assumed unchanged during the planned week; the week after is assumed to be "
        "your usual week again.",
        "Risk changes are estimates from the C3 model" + (" (trained on synthetic, literature-informed data)"
                                                          if model.card.get("synthetic") else "") +
        " - they show association, not proven cause. A physiotherapist makes the final decision.",
        f"Hard limits that the model cannot override: {daily_cap:g} overs a day ({group}, ECB), "
        f"at most {MAX_DAYS_IN_7} bowling days in 7 and {MAX_CONSECUTIVE} in a row, no bowling at Critical tier "
        "or before return to play.",
    ] + [n for n in sim.kin_notes]
    return WeekPlanResult(
        bowler_id=a["bowler_id"], as_of=ctx.as_of, model=model.version, synthetic_model=bool(model.card.get("synthetic")),
        risk_now=round(risk_now, 3), tier=tier, mode=mode, over_value=over_value, status=status,
        usual=usual_opt, rule_plan=rules_opt, recommended=rec_opt,
        risk_reduction=round(usual_opt.risk_14d - rec_opt.risk_14d, 4),
        overs_saved_vs_rules=round(rec_opt.total_overs - rules_opt.total_overs, 1),
        alternatives=alts, technique=technique,
        explanation=_sentence(usual_opt, rules_opt, rec_opt, status, mode, stop_reason, over_value),
        referral_advised=plan.referral.required or stop_reason is not None,
        candidates_evaluated=len(cands), assumptions=assumptions,
        latency_ms=round((time.perf_counter() - t0) * 1000, 1),
    )
