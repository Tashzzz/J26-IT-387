"""Integration test: the shared FastAPI backend serves C2 correctly."""

import sys
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

BACKEND = Path(__file__).resolve().parents[3] / "backend"
sys.path.insert(0, str(BACKEND))
from app.routers import features  # noqa: E402

from c2_biomech.synthetic import make_delivery  # noqa: E402

app = FastAPI()
app.include_router(features.router, prefix="/features")
client = TestClient(app)


def test_compute_returns_c2_row_and_series():
    data = make_delivery()
    data.pop("_truth")
    r = client.post("/features/compute", json=data)
    assert r.status_code == 200
    body = r.json()
    assert body["events"] == {"release_frame": 42, "bfc_frame": 15, "ffc_frame": 30}
    assert body["features"]["shoulder_counter_rotation_deg"]["breach"] is True
    assert len(body["series"]["t"]) == 60


def test_compute_rejects_bad_input_with_422():
    r = client.post("/features/compute", json={"video_id": "x", "fps": 60, "bowling_arm": "right",
                                               "frames": []})
    assert r.status_code == 422
    assert "no frames" in r.json()["detail"]


def test_demo_is_labelled_synthetic():
    body = client.get("/features/demo?include_series=false").json()
    assert body["synthetic"] is True and "series" not in body
