"""Copies every C1-C4 result to Firestore (cloud backup), next to the local files / SQLite.

The local stores stay the source the API reads from, so the backend still works offline or on a
computer without the Firebase key. Every write is also queued here and sent to Firestore by one
background thread: a slow or failed upload never slows down or breaks a request, it is only logged.

Firestore layout
    deliveries/{video_id}/components/c1      C1 run: detection rate, reliability, keypoints JSON
    deliveries/{video_id}/components/c2      C2 feature row (+ angle series)
                                             (team convention, contracts/README.md)
    athletes/{id}                            C4 athlete profile
    athletes/{id}/workloads/{wid}            C4 workload log
    athletes/{id}/upstream/latest            C3 + C2 inputs C4 last received
    athletes/{id}/plans/{pid}                C4 prevention plans
    athletes/{id}/plans/{pid}/feedback/{fid} coach / physio feedback
    risk_assessments/{id}                    C3 assessments (with athlete_id, bowler_id)

Bowler videos are NOT uploaded (ethics: footage stays on the processing computer).
Set FIREBASE_SYNC=0 in .env (or the environment) to switch syncing off. It is always off under
pytest, so no test (backend or component) ever writes to the real project.
"""

import json
import logging
import math
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Callable

from app.firebase import FirebaseNotConfigured, db

log = logging.getLogger("cricshield.cloud")

# One worker keeps the writes in order (e.g. a delete after its create).
_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="firestore-sync")
_warned = False


def enabled() -> bool:
    if "pytest" in sys.modules:
        return False
    return os.getenv("FIREBASE_SYNC", "1").strip().lower() not in ("0", "false", "no", "off")


def clean(obj: Any) -> Any:
    """Make data Firestore-safe: NaN/inf -> None, dates -> text, and lists that contain lists
    (Firestore does not allow them, e.g. keypoint landmarks) -> a JSON string."""
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        if any(isinstance(x, (list, tuple)) for x in obj):
            return json.dumps(obj, default=str)
        return [clean(x) for x in obj]
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    if obj is None or isinstance(obj, (str, int, float, bool, datetime)):
        return obj
    return str(obj)


def _run(job: Callable[[], None], what: str) -> None:
    global _warned
    try:
        job()
    except FirebaseNotConfigured as e:
        if not _warned:
            log.warning("Firestore sync skipped: %s", e)
            _warned = True
    except Exception:
        log.exception("Firestore sync failed: %s", what)


def _submit(job: Callable[[], None], what: str) -> None:
    if enabled():
        _pool.submit(_run, job, what)


def save(path: str, data: dict) -> None:
    """Queue a document write. `path` is 'collection/doc/collection/doc...'."""
    doc = {**clean(data), "synced_at": datetime.now(timezone.utc)}
    _submit(lambda: db().document(path).set(doc), f"save {path}")


def delete(path: str) -> None:
    _submit(lambda: db().document(path).delete(), f"delete {path}")


def delete_collection(path: str) -> None:
    """Delete a collection with all documents and their sub-collections."""
    _submit(lambda: db().recursive_delete(db().collection(path)), f"delete {path}")


def flush(timeout: float = 120) -> None:
    """Wait until everything queued so far is written (used by the backfill script)."""
    _pool.submit(lambda: None).result(timeout=timeout)


# --- per component ------------------------------------------------------------
def _c4_store():
    from c4_recommend import store
    return store


def c1_run(run_id: str, summary: dict, c1_json: dict) -> None:
    video_id = c1_json.get("video_id") or summary.get("clip_id") or run_id
    save(f"deliveries/{video_id}/components/c1", {
        **summary,
        "video_id": video_id,
        "bowler_id": c1_json.get("bowler_id"),
        "conditions": c1_json.get("conditions"),
        "keypoints_json": json.dumps(c1_json),  # full C1 -> C2 contract, as text (<1 MB per delivery)
        "created_at": datetime.now(timezone.utc),
    })


def c2_row(row: dict) -> None:
    video_id = row.get("video_id")
    if video_id and not row.get("synthetic"):
        save(f"deliveries/{video_id}/components/c2", {**row, "created_at": datetime.now(timezone.utc)})


def c3_assessment(result: dict) -> None:
    if result.get("id") is not None:
        save(f"risk_assessments/{result['id']}", result)


def c4_athlete(aid: int) -> None:
    a = _c4_store().get_athlete(aid)
    if a:
        save(f"athletes/{aid}", a)


def c4_workload(aid: int, workload: dict) -> None:
    save(f"athletes/{aid}/workloads/{workload['id']}", workload)


def c4_workload_deleted(wid: int, aid: int) -> None:
    delete(f"athletes/{aid}/workloads/{wid}")


def c4_upstream(aid: int) -> None:
    up = _c4_store().get_upstream(aid)
    if up:
        save(f"athletes/{aid}/upstream/latest", up)


def c4_plan(aid: int, plan: dict) -> None:
    save(f"athletes/{aid}/plans/{plan['id']}", {**plan, "athlete_id": aid})


def c4_feedback(aid: int, feedback: dict) -> None:
    save(f"athletes/{aid}/plans/{feedback['plan_id']}/feedback/{feedback['id']}", feedback)


def c4_everything() -> int:
    """Copy the whole C4 database (athletes, workloads, upstream, plans, feedback). Returns athletes."""
    store = _c4_store()
    athletes = store.list_athletes()
    for a in athletes:
        aid = a["id"]
        save(f"athletes/{aid}", a)
        for w in store.list_workloads(aid):
            c4_workload(aid, w)
        c4_upstream(aid)
        for p in store.list_plans(aid, limit=10_000):
            c4_plan(aid, p)
            for f in store.list_feedback(p["id"]):
                c4_feedback(aid, f)
    return len(athletes)
