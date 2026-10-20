"""C2 router (owner: Samarasinghe).

Endpoints
    GET  /features/ping         health check
    GET  /features/thresholds   published limits used for mapping (shown in the app)
    POST /features/compute      body = C1 keypoints JSON (contracts/c1_keypoints.schema.json)
                                -> C2 feature row (contracts/c2_features.schema.json)
                                   + per-frame angle series for the app charts
    GET  /features/demo         same output for a synthetic delivery with known angles
                                (labelled synthetic; for testing the app before real data)

Optional query params on /compute: bfc_frame, ffc_frame, release_frame (manual events),
include_series (default true).
"""

import sys
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Body, HTTPException

from app import cloud

# Use the installed package (pip install -e components/c2_biomech); fall back to the
# monorepo source folder so the API also runs without installing it.
try:
    import c2_biomech  # noqa: F401
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "components" / "c2_biomech" / "src"))

from c2_biomech.features import compute_features  # noqa: E402
from c2_biomech.loader import from_c1_json  # noqa: E402
from c2_biomech.thresholds import THRESHOLDS  # noqa: E402

router = APIRouter()


@router.get("/ping")
def ping():
    return {"component": "C2", "status": "ok"}


@router.get("/thresholds")
def thresholds():
    return THRESHOLDS


def _run(c1: dict, overrides: dict, include_series: bool):
    try:
        delivery = from_c1_json(c1)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Invalid C1 input: {e}")
    row, series = compute_features(delivery, overrides)
    if include_series:
        # astype(object) first: on float columns pandas turns None back into NaN, and NaN is not valid JSON
        row["series"] = series.astype(object).where(series.notna(), None).to_dict(orient="list")
    return row


@router.post("/compute")
def compute(
    c1: dict = Body(..., description="C1 keypoints JSON for one delivery"),
    bfc_frame: Optional[int] = None,
    ffc_frame: Optional[int] = None,
    release_frame: Optional[int] = None,
    include_series: bool = True,
):
    overrides = {"bfc_frame": bfc_frame, "ffc_frame": ffc_frame, "release_frame": release_frame}
    row = _run(c1, overrides, include_series)
    cloud.c2_row(row)
    return row


@router.get("/demo")
def demo(include_series: bool = True):
    from c2_biomech.synthetic import make_delivery

    data = make_delivery()
    truth = data.pop("_truth")
    row = _run(data, {}, include_series)
    row["synthetic"] = True
    row["true_values"] = truth
    return row
