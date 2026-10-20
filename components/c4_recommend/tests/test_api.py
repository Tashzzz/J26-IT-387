"""Integration test: the shared FastAPI backend serves C4, plus garbage-input checks."""
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

BACKEND = Path(__file__).resolve().parents[3] / "backend"
sys.path.insert(0, str(BACKEND))
from app.routers import recommend  # noqa: E402

app = FastAPI()
app.include_router(recommend.router, prefix="/recommend")
client = TestClient(app)
R = "/recommend"


@pytest.fixture(autouse=True, scope="module")
def reset():
    client.post(f"{R}/demo/reset")


def test_ping_and_seed():
    assert client.get(f"{R}/ping").json()["component"] == "C4"
    assert [a["bowler_id"] for a in client.get(f"{R}/athletes").json()] == ["DEMO01", "DEMO02", "DEMO03"]


def test_demo_tiers():
    tiers = [client.post(f"{R}/athletes/{i}/plan").json()["risk_tier"] for i in (1, 2, 3)]
    assert tiers == ["High", "Low", "Critical"]


def test_end_to_end_profile_workload_c3_plan_feedback():
    a = client.post(f"{R}/athletes", json={"bowler_id": "B07", "birth_year": date.today().year - 16,
                                           "dominant_arm": "right", "playing_level": "school"}).json()
    for d in (20, 15, 10, 3, 2, 1):
        assert client.post(f"{R}/athletes/{a['id']}/workloads", json={
            "session_date": (date.today() - timedelta(days=d)).isoformat(),
            "session_type": "nets", "overs": 6, "soreness": 2}).status_code == 201
    r = client.post(f"{R}/athletes/{a['id']}/upstream", json={
        "c3": {"bowler_id": "B07", "session_id": "B07_s1", "risk_score": 0.62, "risk_level": "high",
               "top_factors": [{"feature": "acute_chronic_workload_ratio", "modality": "workload", "shap": 0.2}]},
        "c2": [{"video_id": "B07_D01_side_10m", "bowler_id": "B07", "features": {
            "front_knee_flexion_release_deg": {"value": 22, "threshold": 30, "breach": True, "reliable": True}}}]})
    assert r.status_code == 202
    plan = client.post(f"{R}/athletes/{a['id']}/plan").json()
    assert plan["risk_tier"] == "High" and plan["id"]
    assert len(client.get(f"{R}/athletes/{a['id']}/plans").json()) == 1
    fb = client.post(f"{R}/plans/{plan['id']}/feedback", json={
        "reviewer": "Coach A", "role": "coach", "decision": "modify", "usefulness": 4,
        "rule_id": "TR-HIGH", "comment": "Allow 8 overs", "modified_action": "Max 8 overs/day"})
    assert fb.status_code == 201
    assert client.get(f"{R}/plans/{plan['id']}").json()["feedback"][0]["usefulness"] == 4


def test_upstream_for_wrong_bowler_rejected():
    r = client.post(f"{R}/athletes/1/upstream", json={"c3": {
        "bowler_id": "B99", "session_id": "x", "risk_score": 0.5, "risk_level": "medium"}})
    assert r.status_code == 422


@pytest.mark.parametrize("payload", [
    {"session_date": "2026-01-01", "session_type": "nets", "overs": -5},
    {"session_date": "2026-01-01", "session_type": "nets", "overs": 500},
    {"session_date": "2026-01-01", "session_type": "nets", "overs": "ten"},
    {"session_date": "not-a-date", "session_type": "nets", "overs": 4},
    {"session_date": "2099-01-01", "session_type": "nets", "overs": 4},
    {"session_date": "2026-01-01", "session_type": "football", "overs": 4},
    {"session_date": "2026-01-01", "session_type": "nets", "overs": 4, "soreness": 42},
    {},
])
def test_bad_workload_rejected(payload):
    assert client.post(f"{R}/athletes/1/workloads", json=payload).status_code == 422


@pytest.mark.parametrize("c3", [
    {"bowler_id": "DEMO01", "session_id": "s", "risk_score": 5, "risk_level": "high"},
    {"bowler_id": "DEMO01", "session_id": "s", "risk_score": -0.2, "risk_level": "low"},
    {"bowler_id": "DEMO01", "session_id": "s", "risk_score": "high", "risk_level": "high"},
    {"bowler_id": "DEMO01", "session_id": "s", "risk_score": 0.5, "risk_level": "extreme"},
    {"bowler_id": "DEMO01", "session_id": "s", "risk_score": 0.5, "risk_level": "medium",
     "top_factors": [{"feature": "acwr", "shap": 9}]},
    {"bowler_id": "Kavindu Perera", "session_id": "s", "risk_score": 0.5, "risk_level": "medium"},
])
def test_bad_c3_rejected(c3):
    assert client.post(f"{R}/athletes/1/upstream", json={"c3": c3}).status_code == 422


def test_bad_athlete_rejected():
    assert client.post(f"{R}/athletes", json={"bowler_id": "B08", "birth_year": 2024,
                                              "dominant_arm": "right", "playing_level": "club"}).status_code == 422


def test_unknown_athlete_404():
    assert client.post(f"{R}/athletes/9999/plan").status_code == 404


def test_modify_feedback_requires_action():
    pid = client.post(f"{R}/athletes/1/plan").json()["id"]
    r = client.post(f"{R}/plans/{pid}/feedback", json={"reviewer": "Physio", "role": "physiotherapist",
                                                       "decision": "modify"})
    assert r.status_code == 422


def test_stateless_from_c3_with_team_sample():
    import json
    c3 = json.loads((Path(__file__).resolve().parents[3] / "contracts/samples/c3_sample.json").read_text())
    r = client.post(f"{R}/from-c3", json={
        "athlete": {"bowler_id": "B03", "birth_year": 2009, "dominant_arm": "right", "playing_level": "club"},
        "upstream": {"c3": c3}})
    assert r.status_code == 200 and r.json()["risk_source"] == "c3"


def test_whatif_endpoint_ranks_actions_or_fails_safely():
    """200 with ranked scenarios when C3's model is available, otherwise a clear 503 - never a crash."""
    r = client.post(f"{R}/athletes/3/whatif")
    assert r.status_code in (200, 503)
    if r.status_code == 503:
        assert "C3" in r.json()["detail"] or "model" in r.json()["detail"]
        return
    body = r.json()
    assert body["bowler_id"] == "DEMO03"
    effects = [s["effect"] for s in body["scenarios"]]
    assert effects == sorted(effects, reverse=True)
    assert body["best_plan"]["risk"] <= body["base_risk"]
    assert body["referral_required"] is True          # what-if never removes a referral
    assert client.post(f"{R}/athletes/9999/whatif").status_code == 404
