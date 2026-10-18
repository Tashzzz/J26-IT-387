"""C4 reads the team's C3/C2 samples and writes output that matches its own contract."""
import json
from pathlib import Path

import pytest

from c4_recommend.engine import generate_plan
from c4_recommend.models import C2Row, C3Risk, UpstreamInput
from helpers import athlete, steady_weeks

CONTRACTS = Path(__file__).resolve().parents[3] / "contracts"
jsonschema = pytest.importorskip("jsonschema")


def load(name):
    return json.loads((CONTRACTS / name).read_text(encoding="utf-8"))


def test_team_c3_sample_is_accepted():
    c3 = C3Risk(**load("samples/c3_sample.json"))
    assert c3.risk_level == "high"


def test_team_c2_sample_is_accepted():
    row = C2Row(**load("samples/c2_sample.json"))
    assert row.features["shoulder_counter_rotation_deg"].breach


def test_plan_from_team_samples_matches_c4_schema():
    c3, c2 = load("samples/c3_sample.json"), load("samples/c2_sample.json")
    plan = generate_plan(athlete(code="B03"), steady_weeks(), UpstreamInput(c3=c3, c2=[c2]))
    jsonschema.validate(plan.model_dump(mode="json"), load("c4_plan.schema.json"))
    reasons = {p["reason"] for p in plan.plan}
    assert "shoulder_counter_rotation_deg" in reasons  # C3's top factor drives a C4 action
    assert "trunk_lateral_flexion_deg" in reasons      # C2 breach drives a C4 action


def test_c4_sample_matches_schema():
    jsonschema.validate(load("samples/c4_sample.json"), load("c4_plan.schema.json"))
