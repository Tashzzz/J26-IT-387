"""Week planner (weekplan.py): guardrails, usual week, selection and the C3 round trip."""
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

from c4_recommend import weekplan as whatif
from c4_recommend.engine import generate_plan, load_kb
from c4_recommend.models import AthleteCreate, InjuryRecord, UpstreamInput, WorkloadCreate

KB = load_kb()
TODAY = date.today()
AS_OF = TODAY - timedelta(days=1)
D = lambda k: AS_OF + timedelta(days=k)


def week(*overs, types=None):
    return [{"date": D(i + 1), "session_type": (types or {}).get(i, "nets") if o else "rest", "overs": float(o)}
            for i, o in enumerate(overs)]


# ---------------------------------------------------------------------------
# guardrails (hard limits the model can never trade away)
# ---------------------------------------------------------------------------
def test_guardrails_daily_cap_and_stop():
    w = whatif.apply_guardrails(week(30, 0, 5, 0, 0, 0, 0), daily_cap=18, stop=False)
    assert [d["overs"] for d in w][:3] == [18, 0, 5]
    assert all(d["overs"] == 0 for d in whatif.apply_guardrails(week(5, 5, 5, 0, 0, 0, 0), daily_cap=18, stop=True))


def test_guardrails_two_in_a_row_counts_the_log():
    w = whatif.apply_guardrails(week(4, 4, 4, 4, 0, 0, 0), daily_cap=18, stop=False)
    overs = [d["overs"] for d in w]
    assert overs[2] == 0                                   # third day in a row dropped
    w = whatif.apply_guardrails(week(4, 4, 0, 0, 0, 0, 0), daily_cap=18, stop=False, run_before=1)
    assert [d["overs"] for d in w][:2] == [4, 0]           # yesterday + today already 1 in a row


def test_guardrails_max_four_days_in_seven_includes_logged_days():
    past = {AS_OF, AS_OF - timedelta(days=2), AS_OF - timedelta(days=4)}
    w = whatif.apply_guardrails(week(4, 0, 6, 0, 3, 0, 0), daily_cap=18, stop=False, past_days=past)
    for i in range(7):
        end = D(i + 1)
        planned = sum(1 for d in w if d["overs"] > 0 and end - timedelta(days=6) <= d["date"] <= end)
        logged = sum(1 for p in past if end - timedelta(days=6) <= p <= end)
        assert planned + logged <= whatif.MAX_DAYS_IN_7


def test_guardrails_keep_matches_first():
    w = whatif.apply_guardrails(week(3, 0, 3, 0, 8, 0, 0, types={4: "match"}), daily_cap=18, stop=False,
                                past_days={AS_OF, AS_OF - timedelta(days=2)})
    assert w[4]["overs"] == 8 and w[4]["session_type"] == "match"


# ---------------------------------------------------------------------------
# usual week
# ---------------------------------------------------------------------------
def test_usual_week_repeats_the_weekly_pattern():
    log = []
    for wk in range(4):
        for off, o, kind in ((1, 5, "nets"), (3, 6, "nets"), (5, 8, "match")):
            d = AS_OF - timedelta(days=7 * wk) - timedelta(days=7) + timedelta(days=off)
            log.append(WorkloadCreate(session_date=d, session_type=kind, overs=o))
    u = whatif.usual_week(log, AS_OF)
    assert [d["overs"] for d in u] == [5, 0, 6, 0, 8, 0, 0]
    assert u[4]["session_type"] == "match"


def test_usual_week_empty_log():
    assert all(d["overs"] == 0 for d in whatif.usual_week([], AS_OF))


# ---------------------------------------------------------------------------
# selection
# ---------------------------------------------------------------------------
def _cands(*vols):
    return [week(v, 0, 0, 0, 0, 0, 0) for v in vols]


def test_select_tradeoff_only_cuts_when_an_over_buys_enough_risk():
    cands = _cands(10, 6, 0)
    evals = [{"risk_14d": r, "daily": [0.2] * 7} for r in (0.050, 0.030, 0.028)]
    # 4 overs buy 0.020 (0.005/over); 6 more overs buy only 0.002
    assert whatif.select(cands, evals, 0, 1, "tradeoff", over_value=0.0015) == (1, "rule_plan_kept")
    assert whatif.select(cands, evals, 0, 1, "tradeoff", over_value=0.01)[1] == "no_change"
    assert whatif.select(cands, evals, 0, 1, "tradeoff", over_value=0.0)[0] == 2


def test_select_rule_anchored_modes():
    cands = _cands(10, 6, 8, 0)
    evals = [{"risk_14d": r, "daily": [0.2] * 7} for r in (0.05, 0.03, 0.03, 0.02)]
    i, status = whatif.select(cands, evals, 0, 1, "keep_bowling")
    assert i == 2 and status == "optimised"               # same risk as the rule plan, 2 more overs
    i, _ = whatif.select(cands, evals, 0, 1, "lower_risk")
    assert i == 2                                          # >= rule overs, lowest risk (tie -> more overs)


# ---------------------------------------------------------------------------
# end to end with the committed C3 model
# ---------------------------------------------------------------------------
def _c3_ready():
    try:
        whatif._c3()
        return True
    except whatif.WeekPlanUnavailable:
        return False


needs_c3 = pytest.mark.skipif(not _c3_ready(), reason="C3 model / package not available")


def _inputs(spike=False, age=17, injuries=None, score=None):
    athlete = AthleteCreate(bowler_id="WI01", birth_year=TODAY.year - age, dominant_arm="right",
                            playing_level="club", injury_history=injuries or [])
    log = []
    for wk in range(5, 0, -1):
        for off, kind in ((1, "nets"), (3, "nets"), (5, "match")):
            d = AS_OF - timedelta(days=7 * wk) + timedelta(days=off)
            if d <= AS_OF:
                big = spike and wk == 1
                log.append(WorkloadCreate(session_date=d, session_type=kind, overs=(12 if big else 5), soreness=2))
    feats = {"shoulder_counter_rotation_deg": {"value": 41.0, "threshold": 30.0, "breach": True, "reliable": True},
             "trunk_lateral_flexion_deg": {"value": 44.0, "threshold": 40.0, "breach": True, "reliable": True}}
    c2 = [{"video_id": f"WI01_D{i:02d}_side_10m", "bowler_id": "WI01", "features": feats} for i in range(1, 4)]
    up = {"c2": c2}
    if score is not None:
        up["c3"] = {"bowler_id": "WI01", "session_id": "WI01_s", "risk_score": score,
                    "risk_level": "high" if score >= 0.55 else "medium" if score >= 0.3 else "low"}
    return athlete, log, UpstreamInput(**up)


@needs_c3
@pytest.mark.parametrize("mode", ["tradeoff", "keep_bowling", "lower_risk", "state"])
def test_week_plan_end_to_end(mode):
    a, log, up = _inputs(spike=True, score=0.6)
    plan = generate_plan(a, log, up, KB, today=AS_OF)
    r = whatif.week_plan(a, log, up, KB, as_of=AS_OF, plan=plan, mode=mode)
    assert r.tier == plan.risk_tier and r.candidates_evaluated > 5
    rec, rules, usual = r.recommended, r.rule_plan, r.usual
    cap = KB["limits"]["age_groups"]["U19"]["daily_limit"]
    assert all(d.overs <= cap for d in rec.days)
    assert rec.bowling_days <= whatif.MAX_DAYS_IN_7
    assert all(len(o.daily_risk) == 7 and 0 <= o.risk_14d <= 1 for o in (rec, rules, usual))
    if mode == "tradeoff":
        assert rec.risk_14d <= usual.risk_14d + 1e-9
    if mode == "keep_bowling":
        assert rec.risk_14d <= rules.risk_14d + 1e-9 and rec.total_overs >= rules.total_overs
    if mode == "lower_risk":
        assert rec.total_overs >= rules.total_overs and rec.risk_14d <= rules.risk_14d + 1e-9
    assert r.explanation and r.assumptions and r.latency_ms < 3000       # NFR: < 3 s


@needs_c3
def test_week_plan_critical_means_no_bowling():
    a, log, up = _inputs(spike=True, score=0.9)
    r = whatif.week_plan(a, log, up, KB, as_of=AS_OF)
    assert r.tier == "Critical" and r.status == "safety_stop" and r.referral_advised
    assert r.recommended.total_overs == 0


@needs_c3
def test_week_plan_not_returned_to_play_means_no_bowling():
    inj = [InjuryRecord(site="hamstring", injury_date=AS_OF - timedelta(days=10), returned_to_play=False)]
    a, log, up = _inputs(score=0.35, injuries=inj)
    r = whatif.week_plan(a, log, up, KB, as_of=AS_OF)
    assert r.status == "safety_stop" and r.recommended.total_overs == 0


@needs_c3
def test_technique_what_if_lowers_risk_when_angles_corrected():
    a, log, up = _inputs(score=0.5)
    r = whatif.week_plan(a, log, up, KB, as_of=AS_OF)
    labels = {t.feature for t in r.technique}
    assert "shoulder_counter_rotation_deg" in labels
    assert all(t.change <= 1e-9 for t in r.technique)      # monotone C3: correcting a breach never raises risk


@needs_c3
def test_week_plan_api():
    pytest.importorskip("fastapi")
    pytest.importorskip("httpx")
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend"))
    from app.routers import recommend
    app = FastAPI()
    app.include_router(recommend.router, prefix="/recommend")
    client = TestClient(app)
    a, log, up = _inputs(spike=True, score=0.6)
    body = {"athlete": a.model_dump(mode="json"), "workloads": [w.model_dump(mode="json") for w in log],
            "upstream": up.model_dump(mode="json")}
    res = client.post("/recommend/week-plan", json=body)
    assert res.status_code == 200, res.text
    assert res.json()["mode"] == "tradeoff"
    assert client.post("/recommend/week-plan?mode=nonsense", json=body).status_code == 422
