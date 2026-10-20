"""Copy everything already saved on this computer to Firestore (one-off backfill).

Run from the backend folder:
    python -m app.sync_all

New results are synced automatically by the API (app/cloud.py); this is for the data that existed
before syncing was added, or after working offline. Safe to run again: documents are overwritten,
not duplicated. C2 rows are not stored locally, so they reach Firestore only when /features/compute runs.
"""

import json
import logging

from app import cloud
from app.firebase import db
from app.routers import pose, recommend, risk  # noqa: F401 - puts the component packages on the import path


def c1_runs() -> int:
    from reliability_lookup import summary as reliability_summary

    n = 0
    for result_file in sorted(pose.RUNS_DIR.glob("*/result.json")):
        run_id = result_file.parent.name
        result = json.loads(result_file.read_text())
        try:
            with open(result["json_path"]) as f:
                c1_json = json.load(f)
        except (OSError, KeyError, ValueError):
            print(f"  skipped C1 run {run_id}: keypoints file missing")
            continue
        cloud.c1_run(run_id, {
            "run_id": run_id,
            "clip_id": result.get("clip_id"),
            "bowling_arm": c1_json.get("bowling_arm"),
            "frames": len(c1_json.get("frames", [])),
            "detection_rate": round(result.get("detection_rate", 0), 3),
            "processing_seconds": round(result.get("processing_seconds", 0), 1),
            "overlay_url": f"/pose/runs/{run_id}/overlay",
            "keypoints_url": f"/pose/runs/{run_id}/keypoints",
            "reliability": reliability_summary(c1_json.get("reliability")),
        }, c1_json)
        n += 1
    return n


def c3_assessments() -> int:
    from c3_risk import store

    store.init_db()
    with store.conn() as c:
        ids = [r["id"] for r in c.execute("SELECT id FROM assessments ORDER BY id")]
    for aid in ids:
        cloud.c3_assessment(store.get(aid))
    return len(ids)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    db()  # fail now with a clear message if the key or .env is missing
    print(f"C1 runs:           {c1_runs()}")
    print(f"C3 assessments:    {c3_assessments()}")
    print(f"C4 athletes:       {cloud.c4_everything()} (with workloads, inputs, plans, feedback)")
    print("Uploading...")
    cloud.flush(timeout=600)
    print("Done - see Firebase console > Firestore Database.")


if __name__ == "__main__":
    main()
