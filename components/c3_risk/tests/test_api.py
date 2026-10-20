"""System tests through the shared FastAPI backend: C3 endpoints, the hand-off to C4, bad input."""
import json
import sys
import time

import jsonschema
import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from helpers import REPO, TODAY, athlete, c2_row, steady_log  # noqa: E402

sys.path.insert(0, str(REPO / "backend"))
from app.routers import recommend, risk  # noqa: E402

app = FastAPI()
app.include_router(risk.router, prefix="/risk")
app.include_router(recommend.router, prefix="/recommend")
client = TestClient(app)
SCHEMA = json.loads((REPO / "contracts" / "c3_risk.schema.json").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True, scope="module")
def demo_bowlers():
    client.post("/recommend/demo/reset")


def test_ping_and_model_card():
    p = client.get("/risk/ping").json()
    assert p["component"] == "C3" and p["model_loaded"]
    card = client.get("/risk/model").json()
    assert card["synthetic"] and "feature_medians" not in card and card["thresholds"]["score"]["medium"] == 0.3


def test_athletes_come_from_the_shared_registry():
    codes = [a["bowler_id"] for a in client.get("/risk/athletes").json()]
    assert codes == ["DEMO01", "DEMO02", "DEMO03"]


def test_assess_saves_history_and_hands_off_to_c4():
    t0 = time.perf_counter()
    r = client.post("/risk/athletes/3/assess", json={})
    elapsed = time.perf_counter() - t0
    assert r.status_code == 200 and elapsed < 5.0           # NFR: score + narrative within 5 s
    body = r.json()
    jsonschema.validate(body, SCHEMA)
    assert body["bowler_id"] == "DEMO03" and body["sent_to_c4"]
    up = client.get("/recommend/athletes/3/upstream").json()
    assert up["c3"]["risk_score"] == body["risk_score"] and up["c3"]["model"] == body["model"]
    assert len(up["c2"]) == 1                                # C2 rows C4 already had are kept
    plan = client.post("/recommend/athletes/3/plan").json()
    assert plan["risk_source"] == "c3" and plan["risk_score"] == body["risk_score"]
    hist = client.get("/risk/athletes/3/history").json()
    assert hist[0]["id"] == body["id"] and hist[0]["risk_level"] == body["risk_level"]
    one = client.get(f"/risk/assessments/{body['id']}").json()
    assert one["all_factors"] and one["athlete_id"] == 3
    latest = {a["bowler_id"]: a["latest"] for a in client.get("/risk/athletes").json()}
    assert latest["DEMO03"]["id"] == body["id"]


def test_assess_without_handoff_and_with_own_c2_rows():
    before = client.get("/recommend/athletes/2/upstream").json()
    rows = [c2_row(code="DEMO02", n=i, scr=45, tlf=50) for i in (1, 2, 3)]
    r = client.post("/risk/athletes/2/assess", json={"c2": rows, "send_to_c4": False}).json()
    assert not r["sent_to_c4"] and r["inputs"]["kinematics"]["deliveries"] == 3
    assert client.get("/recommend/athletes/2/upstream").json() == before


def test_stateless_predict_with_team_samples():
    c2 = json.loads((REPO / "contracts" / "samples" / "c2_sample.json").read_text(encoding="utf-8"))
    body = {"athlete": athlete(code="B03"), "workloads": steady_log(), "c2": [c2]}
    r = client.post("/risk/predict", json=body)
    assert r.status_code == 200
    jsonschema.validate(r.json(), SCHEMA)
    assert r.json()["inputs"]["kinematics"]["deliveries"] == 1


@pytest.mark.parametrize("body,field", [
    ({"athlete": {"bowler_id": "Ann Smith", "birth_year": TODAY.year - 17}}, "bowler_id"),     # a name, not a code
    ({"athlete": athlete(age=90)}, "birth_year"),
    ({"athlete": athlete(), "workloads": [{"session_date": TODAY.isoformat(), "session_type": "nets", "overs": 500}]}, "overs"),
    ({"athlete": athlete(), "workloads": [{"session_date": TODAY.isoformat(), "session_type": "gym", "overs": 3}]}, "session_type"),
    ({"athlete": athlete(), "as_of": "2999-01-01"}, "as_of"),
    ({"athlete": athlete(), "c2": [{"video_id": "x", "bowler_id": "T01", "features": {"shoulder_counter_rotation_deg": {"value": "big"}}}]}, "value"),
])
def test_garbage_input_rejected(body, field):
    r = client.post("/risk/predict", json=body)
    assert r.status_code == 422 and field in json.dumps(r.json())


def test_c2_rows_for_another_bowler_rejected():
    r = client.post("/risk/predict", json={"athlete": athlete(code="T01"), "c2": [c2_row(code="T99", scr=30)]})
    assert r.status_code == 422 and "T99" in r.json()["detail"]


def test_unknown_athlete_and_assessment():
    assert client.post("/risk/athletes/999/assess", json={}).status_code == 404
    assert client.get("/risk/athletes/999/history").status_code == 404
    assert client.get("/risk/assessments/99999").status_code == 404


def test_missing_model_gives_503_with_instructions(monkeypatch, tmp_path):
    from c3_risk import model
    monkeypatch.setattr(model, "DEFAULT_MODEL_DIR", tmp_path / "empty")
    model.reset_cache()
    try:
        r = client.post("/risk/athletes/1/assess", json={})
        assert r.status_code == 503 and "python -m c3_risk train" in r.json()["detail"]
        assert client.get("/risk/ping").json()["model_loaded"] is False
    finally:
        monkeypatch.undo()
        model.reset_cache()
