"""Command line: generate a plan from contract JSON files.

    python -m c4_recommend --c3 ../../contracts/samples/c3_sample.json --birth-year 2009

Prints the plan in the c4 contract shape. Workload is optional (--workload file.json
with a list of sessions).
"""
import argparse
import json
from pathlib import Path

from .engine import generate_plan
from .models import AthleteCreate, UpstreamInput, WorkloadCreate


def main() -> None:
    ap = argparse.ArgumentParser(description="CricShield C4 recommendation engine")
    ap.add_argument("--c3", type=Path, help="C3 risk JSON (contracts/c3_risk.schema.json)")
    ap.add_argument("--c2", type=Path, nargs="*", default=[], help="C2 feature row JSON file(s)")
    ap.add_argument("--workload", type=Path, help="JSON list of workload sessions")
    ap.add_argument("--birth-year", type=int, default=2008)
    ap.add_argument("--full", action="store_true", help="print the full plan, not only the contract view")
    a = ap.parse_args()

    c3 = json.loads(a.c3.read_text()) if a.c3 else None
    c2 = [json.loads(p.read_text()) for p in a.c2]
    bowler = (c3 or (c2[0] if c2 else {})).get("bowler_id", "B00")
    athlete = AthleteCreate(bowler_id=bowler, birth_year=a.birth_year, dominant_arm="right", playing_level="club")
    workloads = [WorkloadCreate(**w) for w in json.loads(a.workload.read_text())] if a.workload else []
    plan = generate_plan(athlete, workloads, UpstreamInput(c3=c3, c2=c2))
    if a.full:
        print(plan.model_dump_json(indent=2))
    else:
        print(json.dumps({"bowler_id": plan.bowler_id, "session_id": plan.session_id,
                          "risk_level": plan.risk_level, "risk_tier": plan.risk_tier,
                          "summary": plan.summary, "plan": plan.plan}, indent=2))


if __name__ == "__main__":
    main()
