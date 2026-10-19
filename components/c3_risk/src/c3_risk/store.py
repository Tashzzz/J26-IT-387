"""Local SQLite history of C3 risk assessments (proposal FR: log historical risk scores
and explanations per athlete for longitudinal review).

Same approach as C4's store: a local database in data/ (git-ignored, athlete data never
goes to GitHub); Firebase sync only needs these functions re-implemented.
"""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

DB_PATH = Path(os.environ.get("CRICSHIELD_C3_DB", Path(__file__).resolve().parents[4] / "data" / "c3_risk.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id INTEGER,
    bowler_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    as_of TEXT NOT NULL,
    created_at TEXT NOT NULL,
    risk_score REAL NOT NULL,
    risk_level TEXT NOT NULL,
    data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assess_bowler ON assessments(bowler_id, id);
"""


def _path() -> Path:
    return Path(os.environ.get("CRICSHIELD_C3_DB", DB_PATH))


@contextmanager
def conn():
    p = _path()
    p.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(p)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init_db() -> None:
    with conn() as c:
        c.executescript(SCHEMA)


def save(result: dict, athlete_id: Optional[int] = None) -> int:
    init_db()
    with conn() as c:
        return c.execute(
            "INSERT INTO assessments(athlete_id, bowler_id, session_id, as_of, created_at, risk_score, risk_level, data)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (athlete_id, result["bowler_id"], result["session_id"], result["inputs"]["as_of"],
             datetime.now().isoformat(timespec="seconds"), result["risk_score"], result["risk_level"],
             json.dumps(result, default=str))).lastrowid


def _row(r: sqlite3.Row, full: bool) -> dict:
    d = json.loads(r["data"])
    if full:
        return {**d, "id": r["id"], "athlete_id": r["athlete_id"], "created_at": r["created_at"]}
    return {"id": r["id"], "athlete_id": r["athlete_id"], "bowler_id": r["bowler_id"], "session_id": r["session_id"],
            "as_of": r["as_of"], "created_at": r["created_at"], "risk_score": r["risk_score"],
            "risk_level": r["risk_level"], "risk_tier": d.get("risk_tier"), "probability_28d": d.get("probability_28d"),
            "model": d.get("model"),
            "top_factors": [{"feature": f["feature"], "label": f.get("label"), "shap": f["shap"]} for f in d.get("top_factors", [])]}


def history(bowler_id: str, limit: int = 20) -> list[dict]:
    init_db()
    with conn() as c:
        rows = c.execute("SELECT * FROM assessments WHERE bowler_id=? ORDER BY id DESC LIMIT ?", (bowler_id, limit))
        return [_row(r, full=False) for r in rows]


def get(aid: int) -> Optional[dict]:
    init_db()
    with conn() as c:
        r = c.execute("SELECT * FROM assessments WHERE id=?", (aid,)).fetchone()
        return _row(r, full=True) if r else None


def latest(bowler_id: str) -> Optional[dict]:
    h = history(bowler_id, 1)
    return h[0] if h else None


def reset() -> None:
    with conn() as c:
        c.executescript("DROP TABLE IF EXISTS assessments;")
    init_db()
