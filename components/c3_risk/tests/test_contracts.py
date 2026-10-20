"""The C3 contract stays backward compatible with what C4 already sends and reads."""
import json

import jsonschema
import pytest

from helpers import REPO

CONTRACTS = REPO / "contracts"
SCHEMA = json.loads((CONTRACTS / "c3_risk.schema.json").read_text(encoding="utf-8"))


def test_team_c3_sample_matches_schema():
    jsonschema.validate(json.loads((CONTRACTS / "samples" / "c3_sample.json").read_text(encoding="utf-8")), SCHEMA)


@pytest.mark.parametrize("code", ["DEMO01", "DEMO02", "DEMO03"])
def test_c4_demo_inputs_still_valid(code):
    """C4's demo files were written against the first draft of the schema - they must still validate."""
    path = REPO / "components" / "c4_recommend" / "src" / "c4_recommend" / "sample_data" / f"{code}_upstream.json"
    jsonschema.validate(json.loads(path.read_text(encoding="utf-8"))["c3"], SCHEMA)


def test_c3_sample_accepted_by_c4():
    c4 = pytest.importorskip("c4_recommend.models", reason="C4 package not importable")
    c3 = c4.C3Risk(**json.loads((CONTRACTS / "samples" / "c3_sample.json").read_text(encoding="utf-8")))
    assert c3.risk_level == "high" and c3.top_factors[0].feature == "shoulder_counter_rotation_deg"
