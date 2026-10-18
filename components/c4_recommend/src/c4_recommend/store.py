"""
Local SQLite storage for athletes, workloads, upstream inputs, plans (FR10) and
physiotherapist feedback (FR11).

The architecture uses SQLite on the device side with Firebase cloud sync
(team convention: deliveries/{video_id}/c4). This module is the local store;
syncing plans to Firebase only needs these functions re-implemented.
"""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

# Default: <repo>/data/c4_recommend.db  (data/ is git-ignored - athlete data never goes to GitHub)
DB_PATH = Path(os.environ.get("CRICSHIELD_C4_DB", Path(__file__).resolve().parents[4] / "data" / "c4_recommend.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS athletes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    session_date TEXT NOT NULL,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS upstream (
    athlete_id INTEGER PRIMARY KEY REFERENCES athletes(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    generated_at TEXT NOT NULL,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
);
"""


@contextmanager
def conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init_db() -> None:
    with conn() as c:
        c.executescript(SCHEMA)


def reset_db() -> None:
    with conn() as c:
        c.executescript("DROP TABLE IF EXISTS feedback; DROP TABLE IF EXISTS plans; DROP TABLE IF EXISTS upstream;"
                        "DROP TABLE IF EXISTS workloads; DROP TABLE IF EXISTS athletes;")
    init_db()


# --- athletes ----------------------------------------------------------------
def list_athletes() -> list[dict]:
    with conn() as c:
        return [{"id": r["id"], **json.loads(r["data"])} for r in c.execute("SELECT * FROM athletes ORDER BY id")]


def get_athlete(aid: int) -> dict | None:
    with conn() as c:
        r = c.execute("SELECT * FROM athletes WHERE id=?", (aid,)).fetchone()
        return {"id": r["id"], **json.loads(r["data"])} if r else None


def create_athlete(data: dict) -> int:
    with conn() as c:
        return c.execute("INSERT INTO athletes(data) VALUES (?)", (json.dumps(data, default=str),)).lastrowid


def update_athlete(aid: int, data: dict) -> None:
    with conn() as c:
        c.execute("UPDATE athletes SET data=? WHERE id=?", (json.dumps(data, default=str), aid))


# --- workloads ---------------------------------------------------------------
def list_workloads(aid: int) -> list[dict]:
    with conn() as c:
        rows = c.execute("SELECT * FROM workloads WHERE athlete_id=? ORDER BY session_date DESC, id DESC", (aid,))
        return [{"id": r["id"], "athlete_id": aid, **json.loads(r["data"])} for r in rows]


def add_workload(aid: int, data: dict) -> int:
    with conn() as c:
        return c.execute("INSERT INTO workloads(athlete_id, session_date, data) VALUES (?,?,?)",
                         (aid, str(data["session_date"]), json.dumps(data, default=str))).lastrowid


def delete_workload(wid: int) -> bool:
    with conn() as c:
        return c.execute("DELETE FROM workloads WHERE id=?", (wid,)).rowcount > 0


# --- upstream (Component 2 + 3 outputs) --------------------------------------
def save_upstream(aid: int, data: dict) -> None:
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO upstream(athlete_id, data, received_at) VALUES (?,?,?)",
                  (aid, json.dumps(data, default=str), datetime.now().isoformat()))


def get_upstream(aid: int) -> dict | None:
    with conn() as c:
        r = c.execute("SELECT * FROM upstream WHERE athlete_id=?", (aid,)).fetchone()
        return {**json.loads(r["data"]), "received_at": r["received_at"]} if r else None


# --- plans (FR10) ------------------------------------------------------------
def save_plan(aid: int, plan: dict) -> int:
    with conn() as c:
        return c.execute("INSERT INTO plans(athlete_id, generated_at, data) VALUES (?,?,?)",
                         (aid, str(plan["generated_at"]), json.dumps(plan, default=str))).lastrowid


def list_plans(aid: int, limit: int = 20) -> list[dict]:
    with conn() as c:
        rows = c.execute("SELECT * FROM plans WHERE athlete_id=? ORDER BY id DESC LIMIT ?", (aid, limit))
        return [{**json.loads(r["data"]), "id": r["id"]} for r in rows]


def get_plan(pid: int) -> dict | None:
    with conn() as c:
        r = c.execute("SELECT * FROM plans WHERE id=?", (pid,)).fetchone()
        return {**json.loads(r["data"]), "id": r["id"]} if r else None


# --- feedback (FR11) ---------------------------------------------------------
def add_feedback(pid: int, data: dict) -> dict:
    now = datetime.now().isoformat()
    with conn() as c:
        fid = c.execute("INSERT INTO feedback(plan_id, created_at, data) VALUES (?,?,?)",
                        (pid, now, json.dumps(data, default=str))).lastrowid
    return {"id": fid, "plan_id": pid, "created_at": now, **data}


def list_feedback(pid: int) -> list[dict]:
    with conn() as c:
        rows = c.execute("SELECT * FROM feedback WHERE plan_id=? ORDER BY id", (pid,))
        return [{"id": r["id"], "plan_id": pid, "created_at": r["created_at"], **json.loads(r["data"])} for r in rows]
