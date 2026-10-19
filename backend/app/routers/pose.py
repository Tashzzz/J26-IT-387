"""C1 router (owner: Nethmi).

Pose estimation + keypoint reliability. Logic lives in components/c1_pose.

Endpoints (all under /pose)
    GET  /pose/ping                       health check
    POST /pose/process                    upload one bowling video + bowling arm
                                          -> run_pipeline -> detection rate, overlay URL, keypoints URL
    GET  /pose/runs/{run_id}/overlay      skeleton overlay video (H.264 MP4, plays in the app)
    GET  /pose/runs/{run_id}/keypoints    C1 -> C2 contract JSON (contracts/c1_keypoints.schema.json)
    GET  /pose/reliability                ICC per keypoint and per body region for each camera setup

Uploaded videos are bowler footage, so each run is saved under data/c1_runs/<run_id>/,
which is git-ignored (ethics: never commit videos or data/).
"""

import json
import re
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

ROOT = Path(__file__).resolve().parents[3]
C1_DIR = ROOT / "components" / "c1_pose"
RUNS_DIR = ROOT / "data" / "c1_runs"
RELIABILITY_JSON = C1_DIR / "experiments" / "c1_reliability.json"

# The C1 modules import each other as plain modules ("from export import ..."),
# so their folder goes on the import path, the same way running the scripts does.
sys.path.insert(0, str(C1_DIR / "src" / "c1_pose"))

VIDEO_TYPES = (".mp4", ".mov", ".m4v")
RUN_ID = re.compile(r"^[0-9a-f]{12}$")

# Same body regions and order as reliability.py (keypoints.REGION).
REGION_ORDER = ["head", "shoulder", "elbow", "wrist_hand", "hip", "knee", "ankle_foot"]
REGION_LABEL = {"head": "Head", "shoulder": "Shoulders", "elbow": "Elbows", "wrist_hand": "Wrists & hands",
                "hip": "Hips", "knee": "Knees", "ankle_foot": "Ankles & feet"}

router = APIRouter()


@router.get("/ping")
def ping():
    return {"component": "C1", "status": "ok"}


def _clip_id(filename: Optional[str]) -> str:
    """Upload name -> safe clip id (letters, digits, _ and -), used as video_id in the JSON."""
    stem = Path(filename or "").stem
    return re.sub(r"[^A-Za-z0-9_-]+", "_", stem).strip("_")[:60] or "upload"


def _web_playable(src: Path) -> Path:
    """OpenCV writes the overlay as mp4v, which phones and browsers cannot play.
    Re-encode it to H.264 with the ffmpeg that comes with imageio-ffmpeg, with the long side
    at most 1280 px so a 4K phone clip stays small enough to stream to the app.
    If that is not possible, the original file is kept."""
    try:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return src
    dst = src.with_name(src.stem + "_web.mp4")
    fit = "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'"
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-i", str(src), "-vf", fit, "-c:v", "libx264",
           "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
           "-an", str(dst)]
    done = subprocess.run(cmd, capture_output=True)
    return dst if done.returncode == 0 and dst.exists() else src


def _run_dir(run_id: str) -> Path:
    run_dir = RUNS_DIR / run_id
    if not RUN_ID.match(run_id) or not run_dir.is_dir():
        raise HTTPException(status_code=404, detail="This result was not found. Please process the video again.")
    return run_dir


@router.post("/process")
def process(
    video: UploadFile = File(..., description="Bowling video (MP4 or MOV), only the bowler in the frame"),
    bowling_arm: str = Form(..., description="left or right"),
    angle: Optional[str] = Form(None, description="front, rear, semi_side or side"),
    distance_m: Optional[float] = Form(None, description="camera distance in metres"),
):
    from pipeline import PipelineError, run_pipeline

    suffix = Path(video.filename or "").suffix.lower()
    if suffix not in VIDEO_TYPES:
        raise HTTPException(status_code=422, detail="Please upload an MP4 or MOV video.")

    run_id = uuid.uuid4().hex[:12]
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    video_path = run_dir / f"{_clip_id(video.filename)}{suffix}"
    with open(video_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    conditions = {k: v for k, v in {"angle": angle, "distance_m": distance_m}.items() if v is not None}
    try:
        result = run_pipeline(video_path, run_dir, model="lite", bowling_arm=bowling_arm, conditions=conditions)
    except PipelineError as e:
        shutil.rmtree(run_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        shutil.rmtree(run_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Pose estimation failed on the server ({type(e).__name__}). "
                                                    "Please try another video.")

    overlay = _web_playable(Path(result["overlay_path"]))
    (run_dir / "result.json").write_text(json.dumps({**result, "overlay_path": str(overlay)}))

    with open(result["json_path"]) as f:
        frames = len(json.load(f).get("frames", []))

    return {
        "run_id": run_id,
        "clip_id": result["clip_id"],
        "bowling_arm": bowling_arm.strip().lower(),
        "frames": frames,
        "detection_rate": round(result["detection_rate"], 3),
        "processing_seconds": round(result["processing_seconds"], 1),
        "overlay_url": f"/pose/runs/{run_id}/overlay",
        "keypoints_url": f"/pose/runs/{run_id}/keypoints",
    }


@router.get("/runs/{run_id}/overlay")
def overlay(run_id: str):
    result = json.loads((_run_dir(run_id) / "result.json").read_text())
    return FileResponse(result["overlay_path"], media_type="video/mp4")


@router.get("/runs/{run_id}/keypoints")
def keypoints(run_id: str):
    result = json.loads((_run_dir(run_id) / "result.json").read_text())
    return FileResponse(result["json_path"], media_type="application/json")


def _setup(group: str) -> dict:
    """"B01_semi_side_5m" -> bowler B01, angle semi_side, distance 5 m."""
    m = re.match(r"^(?P<bowler>[^_]+)_(?P<angle>.+)_(?P<distance>[\d.]+)m$", group)
    if not m:
        return {"bowler": None, "angle": None, "distance_m": None}
    return {"bowler": m["bowler"], "angle": m["angle"], "distance_m": float(m["distance"])}


@router.get("/reliability")
def reliability():
    """Pilot ICC results from reliability.py, grouped by body region for the app."""
    from keypoints import KEYPOINT_NAMES, REGION

    if not RELIABILITY_JSON.exists():
        raise HTTPException(status_code=404, detail="No reliability results yet (run reliability.py).")
    data = json.loads(RELIABILITY_JSON.read_text())
    region_of = {name: REGION[i] for i, name in enumerate(KEYPOINT_NAMES)}

    setups = []
    for group, kps in data["groups"].items():
        regions = []
        for region in REGION_ORDER:
            items = [{"keypoint": k, **v} for k, v in kps.items() if region_of.get(k) == region]
            iccs = [i["icc"] for i in items if i.get("icc") is not None]
            regions.append({
                "region": region,
                "label": REGION_LABEL[region],
                "mean_icc": round(sum(iccs) / len(iccs), 3) if iccs else None,
                "usable": sum(bool(i.get("usable")) for i in items),
                "total": len(items),
                "keypoints": items,
            })
        setups.append({
            "group": group,
            **_setup(group),
            "usable": sum(bool(v.get("usable")) for v in kps.values()),
            "total": len(kps),
            "regions": regions,
        })

    return {"icc_type": data["icc_type"], "gate": data["gate"], "setups": setups}
