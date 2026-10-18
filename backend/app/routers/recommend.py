"""C4 router (owner: Rathnayaka).

Personalised, explainable prevention plans. Logic lives in components/c4_recommend.

Endpoints (all under /recommend)
    GET  /ping                              health check
    GET  /knowledge-base                    rules + sources (every rule is traceable)

    Key function 2 - athlete profile, workload log, dashboard
    GET  /athletes                          list athlete profiles (anonymised codes)
    POST /athletes                          create profile
    GET  /athletes/{id}                     get profile
    PUT  /athletes/{id}                     update profile
    GET  /athletes/{id}/workloads           workload log
    POST /athletes/{id}/workloads           log a session
    DELETE /workloads/{wid}                 delete a session

    Integration - C3 / C2 hand their outputs to C4
    POST /athletes/{id}/upstream            body {c3: <c3_risk JSON>, c2: [<c2 feature rows>]}
    GET  /athletes/{id}/upstream            what C4 last received

    Key function 1 - recommendation engine
    POST /athletes/{id}/plan                generate + save plan (uses stored upstream)
    GET  /athletes/{id}/plans               plan history (FR10)
    GET  /plans/{pid}                       one plan + its feedback
    POST /plans/{pid}/feedback              coach / physio feedback or override (FR11)
    POST /from-c3                           stateless: profile + workload + C3/C2 JSON -> plan

    POST /demo/reset                        reseed the 3 synthetic demo bowlers
"""

import sys
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException

# Use the installed package (pip install -e components/c4_recommend); fall back to the
# monorepo source folder so the API also runs without installing it.
try:
    import c4_recommend  # noqa: F401
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "components" / "c4_recommend" / "src"))

from c4_recommend import store  # noqa: E402
from c4_recommend.engine import generate_plan, load_kb  # noqa: E402
from c4_recommend.models import (  # noqa: E402
    Athlete, AthleteCreate, Feedback, FeedbackCreate, PreventionPlan,
    StatelessRequest, UpstreamInput, Workload, WorkloadCreate,
)

router = APIRouter()
KB = load_kb()
store.init_db()
if not store.list_athletes():
    from c4_recommend.seed import seed
    seed()


def _athlete_or_404(aid: int) -> dict:
    a = store.get_athlete(aid)
    if not a:
        raise HTTPException(404, f"Athlete {aid} not found")
    return a


@router.get("/ping")
def ping():
    return {"component": "C4", "status": "ok", "engine_version": KB["version"], "rules": len(KB["rules"])}


@router.get("/knowledge-base")
def knowledge_base():
    return KB


# --- athletes ----------------------------------------------------------------
@router.get("/athletes", response_model=list[Athlete])
def list_athletes():
    return store.list_athletes()


@router.post("/athletes", response_model=Athlete, status_code=201)
def create_athlete(body: AthleteCreate):
    if any(a["bowler_id"] == body.bowler_id for a in store.list_athletes()):
        raise HTTPException(409, f"Bowler {body.bowler_id} already exists")
    aid = store.create_athlete(body.model_dump(mode="json"))
    return {"id": aid, **body.model_dump()}


@router.get("/athletes/{aid}", response_model=Athlete)
def get_athlete(aid: int):
    return _athlete_or_404(aid)


@router.put("/athletes/{aid}", response_model=Athlete)
def update_athlete(aid: int, body: AthleteCreate):
    _athlete_or_404(aid)
    store.update_athlete(aid, body.model_dump(mode="json"))
    return {"id": aid, **body.model_dump()}


# --- workloads ---------------------------------------------------------------
@router.get("/athletes/{aid}/workloads", response_model=list[Workload])
def list_workloads(aid: int):
    _athlete_or_404(aid)
    return store.list_workloads(aid)


@router.post("/athletes/{aid}/workloads", response_model=Workload, status_code=201)
def add_workload(aid: int, body: WorkloadCreate):
    _athlete_or_404(aid)
    wid = store.add_workload(aid, body.model_dump(mode="json"))
    return {"id": wid, "athlete_id": aid, **body.model_dump()}


@router.delete("/workloads/{wid}", status_code=204)
def delete_workload(wid: int):
    if not store.delete_workload(wid):
        raise HTTPException(404, "Workload entry not found")


# --- integration -------------------------------------------------------------
@router.post("/athletes/{aid}/upstream", status_code=202)
def receive_upstream(aid: int, body: UpstreamInput):
    a = _athlete_or_404(aid)
    for code in ([body.c3.bowler_id] if body.c3 else []) + [r.bowler_id for r in body.c2]:
        if code != a["bowler_id"]:
            raise HTTPException(422, f"Input is for bowler {code}, but athlete {aid} is {a['bowler_id']}")
    store.save_upstream(aid, body.model_dump(mode="json"))
    return {"accepted": True}


@router.get("/athletes/{aid}/upstream")
def get_upstream(aid: int):
    _athlete_or_404(aid)
    return store.get_upstream(aid) or {"c3": None, "c2": []}


# --- plans -------------------------------------------------------------------
def _build(aid: int, upstream: Optional[UpstreamInput]) -> PreventionPlan:
    a = _athlete_or_404(aid)
    athlete = AthleteCreate(**{k: v for k, v in a.items() if k != "id"})
    workloads = [WorkloadCreate(**{k: v for k, v in w.items() if k not in ("id", "athlete_id")})
                 for w in store.list_workloads(aid)
                 if date.fromisoformat(str(w["session_date"])) <= date.today()]
    if upstream is None:
        stored = store.get_upstream(aid) or {}
        upstream = UpstreamInput(**{k: v for k, v in stored.items() if k in ("c3", "c2")})
    return generate_plan(athlete, workloads, upstream, KB)


@router.post("/athletes/{aid}/plan", response_model=PreventionPlan)
def create_plan(aid: int):
    plan = _build(aid, None)
    plan.id = store.save_plan(aid, plan.model_dump(mode="json"))
    return plan


@router.get("/athletes/{aid}/plans", response_model=list[PreventionPlan])
def plan_history(aid: int):
    _athlete_or_404(aid)
    return store.list_plans(aid)


@router.get("/plans/{pid}")
def get_plan(pid: int):
    p = store.get_plan(pid)
    if not p:
        raise HTTPException(404, "Plan not found")
    return {**p, "feedback": store.list_feedback(pid)}


@router.post("/plans/{pid}/feedback", response_model=Feedback, status_code=201)
def add_feedback(pid: int, body: FeedbackCreate):
    if not store.get_plan(pid):
        raise HTTPException(404, "Plan not found")
    if body.decision == "modify" and not body.modified_action:
        raise HTTPException(422, "modified_action is required when decision is 'modify'")
    return store.add_feedback(pid, body.model_dump())


@router.post("/from-c3", response_model=PreventionPlan)
def from_c3(body: StatelessRequest):
    """No database. Teammates can post C3/C2 JSON with a profile and get the plan back."""
    return generate_plan(body.athlete, body.workloads, body.upstream, KB)


@router.post("/demo/reset")
def demo_reset():
    from c4_recommend.seed import seed
    seed()
    return {"reset": True, "athletes": len(store.list_athletes())}
