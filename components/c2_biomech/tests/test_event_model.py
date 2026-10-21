"""Event model (event_model/): the rule baseline finds known events on synthetic clips.

Synthetic clips only check that the code works; they are never used as results.
"""

import sys
from pathlib import Path

import numpy as np
import pytest

EVENT_MODEL = Path(__file__).resolve().parents[1] / "event_model"
sys.path.insert(0, str(EVENT_MODEL))

from make_synthetic import make_clip  # noqa: E402
from rule_baseline import detect  # noqa: E402
from train_evaluate import decode  # noqa: E402


@pytest.mark.parametrize("arm", ["R", "L"])
def test_rule_baseline_finds_synthetic_events(arm):
    rng = np.random.default_rng(3)
    for _ in range(5):
        df, truth = make_clip(rng, arm, fps=60)
        found = detect(df, arm, 60)
        assert found["bfc"] < found["ffc"] < found["br"]
        for e in ("bfc", "ffc", "br"):
            assert abs(found[e] - truth[e]) <= 3, (e, found, truth)


def test_decode_keeps_event_order():
    n = 50
    proba = np.zeros((n, 4))
    proba[:, 0] = 1.0
    proba[40, 1] = 0.9  # BFC peak placed AFTER the others on purpose
    proba[20, 2] = 0.9
    proba[30, 3] = 0.9
    ev = decode(proba)
    assert ev["br"] == 30
    assert ev["ffc"] == 20
    assert ev["bfc"] < ev["ffc"] < ev["br"]
