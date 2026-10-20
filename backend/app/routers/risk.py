"""C3 router (owner: Rizma).

Injury-risk score + two-level SHAP explanation. Logic lives in components/c3_risk.

Endpoints (all under /risk)
    GET  /ping                          health check + whether the model is loaded
    GET  /model                         model card: version, training data, thresholds, metrics

    Key function 1 - risk classifier, key function 2 - explanation
    GET  /athletes                      bowlers from the shared athlete registry (C4) + their latest C3 result
    POST /athletes/{id}/assess          score one session from the bowler's profile, workload log and
                                        latest C2 rows; saves it and hands it to C4 for the prevention plan
    GET  /athletes/{id}/history         earlier assessments (longitudinal trend)
    GET  /assessments/{aid}             one saved assessment with all factors
    POST /predict                       stateless: profile + workload + C2 rows inline -> C3 JSON
                                        (contracts/c3_risk.schema.json), nothing saved

When the model has not been trained yet, or the ML libraries are not installed, the C3
endpoints answer 503 with the command to fix it - the rest of the backend keeps working.
"""

import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app import cloud

# Use the installed package (pip install -e components/c3_risk); fall back to the
# monorepo source folder so the API also runs without installing it.
try:
    import c3_risk  # noqa: F401
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "components" / "c3_risk" / "src"))

from c3_risk import store  # noqa: E402
from c3_risk.schemas import AssessRequest, PredictRequest  # noqa: E402

router = APIRouter()


def _model():
    """Load the model lazily so a missing model or library never stops the whole API."""
    try:
        from c3_risk.model import ModelNotReady, get_model
    except ImportError as e:
        raise HTTPException(503, f"C3 needs numpy, pandas, scikit-learn and xgboost: pip install -e components/c3_risk ({e})")
    try:
        return get_model()
    except ModelNotReady as e:
        raise HTTPException(503, str(e))


def _service():
    _model()
    from c3_risk import service
    return service


@router.get("/ping")
def ping():
    try:
        from c3_risk.model import get_model
        m = get_model()
        return {"component": "C3", "status": "ok", "model_loaded": True, "model": m.version}
    except Exception as e:  # noqa: BLE001 - ping must always answer
        return {"component": "C3", "status": "ok", "model_loaded": False, "detail": str(e)}


@router.get("/model")
def model_card():
    m = _model()
    card = dict(m.card)
    card.pop("feature_medians", None)
    return card


@router.get("/athletes")
def athletes():
    service = _service()
    try:
        return service.athletes()
    except service.C4Unavailable as e:
        raise HTTPException(503, str(e))


@router.post("/athletes/{athlete_id}/assess")
def assess(athlete_id: int, body: AssessRequest | None = None):
    service = _service()
    body = body or AssessRequest()
    c2 = [r.model_dump(mode="json") for r in body.c2] if body.c2 is not None else None
    try:
        result = service.assess_athlete(athlete_id, c2, body.as_of, body.session_id, body.drop_unreliable,
                                        body.send_to_c4)
    except KeyError:
        raise HTTPException(404, f"Athlete {athlete_id} not found")
    except service.C4Unavailable as e:
        raise HTTPException(503, str(e))
    cloud.c3_assessment(store.get(result["id"]) or result)
    if result.get("sent_to_c4"):
        cloud.c4_upstream(athlete_id)
    return result


@router.get("/athletes/{athlete_id}/history")
def history(athlete_id: int, limit: int = 20):
    service = _service()
    try:
        athlete, _, _ = service.athlete_inputs(athlete_id)
    except KeyError:
        raise HTTPException(404, f"Athlete {athlete_id} not found")
    return store.history(athlete["bowler_id"], max(1, min(limit, 100)))


@router.get("/assessments/{assessment_id}")
def get_assessment(assessment_id: int):
    a = store.get(assessment_id)
    if not a:
        raise HTTPException(404, "Assessment not found")
    return a


@router.post("/predict")
def predict(body: PredictRequest):
    service = _service()
    for r in body.c2:
        if r.bowler_id != body.athlete.bowler_id:
            raise HTTPException(422, f"C2 row {r.video_id} is for bowler {r.bowler_id}, not {body.athlete.bowler_id}")
    return service.run(body.athlete.model_dump(mode="json"), [w.model_dump(mode="json") for w in body.workloads],
                       [r.model_dump(mode="json") for r in body.c2], body.as_of, body.session_id, body.drop_unreliable)
