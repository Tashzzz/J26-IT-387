"""Training on the real synthetic dataset (skipped when the dataset is not on this computer)."""
import os
from pathlib import Path

import pytest

from helpers import REPO

DATA = Path(os.environ.get("CRICSHIELD_SYNTH_DATA", REPO / "data" / "c3_synthetic" / "data"))


@pytest.mark.skipif(not (DATA / "spells.csv").exists(), reason=f"synthetic dataset not found at {DATA}")
def test_train_on_synthetic_dataset(tmp_path):
    from c3_risk.train import train
    card = train(DATA, tmp_path / "model", n_boot=50, verbose=False)
    assert (tmp_path / "model" / "c3_xgb.json").exists()
    m = card["metrics"]
    assert m["cv_auc_mean"] > 0.65 and m["test"]["auc"] > 0.65          # well above chance
    t = card["thresholds"]["probability"]
    assert 0 < t["alert"] < t["high"] < t["critical"] < 1
