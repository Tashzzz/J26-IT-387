"""Release model (event_ml.py): loads, never breaks the pipeline, and can be switched off."""
import numpy as np
import pytest

from c2_biomech import event_ml
from c2_biomech.events import detect_events
from c2_biomech.features import compute_features
from c2_biomech.loader import from_c1_json
from c2_biomech.synthetic import make_delivery as _make


def make_delivery(**kw):
    return from_c1_json(_make(**kw))


def test_model_file_ships_with_the_package():
    assert event_ml.MODEL_PATH.exists()
    assert event_ml.MODEL_PATH.with_suffix(".meta.json").exists()


def test_features_have_the_trained_shape():
    pytest.importorskip("xgboost")
    d = make_delivery()
    X, names = event_ml.features(d.points, d.bowling_arm, d.fps)
    assert X.shape == (len(d.points), len(names))
    model, meta = event_ml._load()
    assert names == meta["features"]
    assert model.num_features() == len(names)


def test_prediction_is_a_valid_frame_or_none():
    pytest.importorskip("xgboost")
    d = make_delivery()
    frame, conf = event_ml.predict_release(d.points, d.bowling_arm, d.fps)
    assert conf is None or 0.0 <= conf <= 1.0
    assert frame is None or 0 <= frame < len(d.points)


def test_unusable_frames_are_never_chosen():
    pytest.importorskip("xgboost")
    d = make_delivery()
    usable = np.zeros(len(d.points), bool)
    usable[:5] = True
    frame, _ = event_ml.predict_release(d.points, d.bowling_arm, d.fps, usable)
    assert frame is None or frame < 5


def test_switch_off_falls_back_to_the_rule(monkeypatch):
    monkeypatch.setenv("C2_RELEASE_MODEL", "off")
    d = make_delivery()
    events, method, _, _ = detect_events(d)
    assert method["release_frame"] in ("auto", "not_detected")


def test_manual_release_beats_the_model():
    d = make_delivery()
    events, method, _, _ = detect_events(d, {"release_frame": 10})
    assert events["release_frame"] == 10 and method["release_frame"] == "manual"


def test_pipeline_reports_model_info():
    row, _ = compute_features(make_delivery())
    assert row["events"]["release_frame"] is not None
