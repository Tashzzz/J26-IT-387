"""What the API calls: assess one bowler session, and the bridge to C4's athlete registry.

C4 owns the athlete profiles, the workload log and the "upstream" inbox where C2 rows and
the C3 result are kept for the prevention plan (components/c4_recommend/store.py). C3 only
READS profiles / workloads / C2 rows from there and WRITES its own result into the inbox
after validating it with C4's own input model - the same thing
POST /recommend/athletes/{id}/upstream does.
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path
from typing import Any, Optional

from . import store
from .explain import assess as _assess
from .explain import contract_view
from .features import build_features
from .model import get_model

C4_SRC = Path(__file__).resolve().parents[3] / "c4_recommend" / "src"


def run(athlete: Any, workloads: list, c2_rows: list, as_of: Optional[date] = None,
        session_id: Optional[str] = None, drop_unreliable: bool = False) -> dict:
    """Features -> calibrated risk -> two-level SHAP -> narrative (contract JSON + extras)."""
    model = get_model()
    as_of = as_of or date.today()
    feats, notes, summary = build_features(c2_rows, workloads, athlete, as_of, drop_unreliable)
    bowler = athlete["bowler_id"] if isinstance(athlete, dict) else athlete.bowler_id
    return _assess(model, feats, notes, summary, bowler, session_id)


# ---------------------------------------------------------------------------
# C4 bridge
# ---------------------------------------------------------------------------
class C4Unavailable(RuntimeError):
    pass


def _c4():
    try:
        import c4_recommend  # noqa: F401
    except ImportError:
        if str(C4_SRC) not in sys.path:
            sys.path.insert(0, str(C4_SRC))
    try:
        from c4_recommend import store as c4_store
        from c4_recommend.models import UpstreamInput
    except Exception as e:  # pragma: no cover
        raise C4Unavailable(f"C4 athlete registry not available ({e}).") from e
    return c4_store, UpstreamInput


def athletes() -> list[dict]:
    c4_store, _ = _c4()
    c4_store.init_db()
    out = []
    for a in c4_store.list_athletes():
        out.append({"athlete_id": a["id"], "bowler_id": a["bowler_id"], "playing_level": a.get("playing_level"),
                    "birth_year": a.get("birth_year"), "latest": store.latest(a["bowler_id"])})
    return out


def athlete_inputs(aid: int) -> tuple[dict, list[dict], list[dict]]:
    c4_store, _ = _c4()
    a = c4_store.get_athlete(aid)
    if not a:
        raise KeyError(aid)
    up = c4_store.get_upstream(aid) or {}
    return a, c4_store.list_workloads(aid), up.get("c2", []) or []


def send_to_c4(aid: int, result: dict, c2_rows: list) -> None:
    """Store the C3 result in C4's inbox, keeping the C2 rows C4 already has."""
    c4_store, UpstreamInput = _c4()
    body = UpstreamInput(c3=contract_view(result), c2=c2_rows)      # C4's own validation
    c4_store.save_upstream(aid, body.model_dump(mode="json"))


def assess_athlete(aid: int, c2_override: Optional[list] = None, as_of: Optional[date] = None,
                   session_id: Optional[str] = None, drop_unreliable: bool = False,
                   send: bool = True) -> dict:
    athlete, workloads, c2_rows = athlete_inputs(aid)
    if c2_override is not None:
        c2_rows = c2_override
    c2_rows = [r for r in c2_rows if r.get("bowler_id") == athlete["bowler_id"]]
    result = run(athlete, workloads, c2_rows, as_of, session_id, drop_unreliable)
    result["id"] = store.save(result, aid)
    result["athlete_id"] = aid
    result["sent_to_c4"] = False
    if send:
        try:
            send_to_c4(aid, result, c2_rows)
            result["sent_to_c4"] = True
        except Exception as e:  # keep the assessment even if the hand-off fails
            result["data_quality"].append(f"Could not hand the result to C4: {e}")
    return result
