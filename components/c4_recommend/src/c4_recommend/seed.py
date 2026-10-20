"""
Demo data so C4 works before C3's model is ready (risk register #1).

Three SYNTHETIC bowlers (codes DEMO01-03, not real participants):
  DEMO01  U19 club    - workload spike + shoulder counter-rotation breach -> High
  DEMO02  Senior prov - steady load, no breaches                          -> Low
  DEMO03  U15 school  - lumbar injury 6 weeks ago, sore, side-bend breach -> Critical + referral
Workload dates are relative to today so the ACWR is always "live".
Upstream inputs use the C3/C2 contract formats (sample_data/*.json).

Run:  python -m c4_recommend.seed
"""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

from . import store

SAMPLE = Path(__file__).resolve().parent / "sample_data"


def _d(days_ago: int) -> str:
    return (date.today() - timedelta(days=days_ago)).isoformat()


def _year(age: int) -> int:
    return date.today().year - age


def _upstream(code: str) -> dict:
    return json.loads((SAMPLE / f"{code}_upstream.json").read_text(encoding="utf-8"))


def seed() -> None:
    store.reset_db()

    # DEMO01 - usual ~15-19 overs/week, then a 34-over week with 3 days in a row
    a = store.create_athlete({
        "bowler_id": "DEMO01", "birth_year": _year(17), "dominant_arm": "right", "playing_level": "club",
        "injury_history": [{"site": "hamstring", "injury_date": _d(300), "returned_to_play": True,
                            "notes": "Grade 1 strain last season"}]})
    for days_ago, overs, kind, spell, rpe, sore in [
            (27, 6, "nets", 4, 6, 1), (24, 7, "training", 4, 6, 1), (20, 6, "nets", 4, 6, 2), (17, 8, "match", 5, 7, 2),
            (13, 7, "training", 4, 6, 1), (10, 7, "nets", 4, 6, 2),
            (6, 9, "nets", 5, 7, 3), (5, 8, "training", 5, 7, 3), (4, 10, "match", 6, 8, 4), (1, 7, "nets", 5, 8, 5)]:
        store.add_workload(a, {"session_date": _d(days_ago), "session_type": kind, "overs": overs, "spells": 2,
                               "longest_spell_overs": spell, "rpe": rpe, "soreness": sore})
    store.save_upstream(a, _upstream("DEMO01"))

    # DEMO02 - steady senior load
    b = store.create_athlete({"bowler_id": "DEMO02", "birth_year": _year(24), "dominant_arm": "left",
                              "playing_level": "provincial", "injury_history": []})
    for days_ago in (27, 25, 22, 20, 18, 15, 13, 11, 8, 6, 4, 1):
        store.add_workload(b, {"session_date": _d(days_ago), "session_type": "training", "overs": 8, "spells": 2,
                               "longest_spell_overs": 5, "rpe": 6, "soreness": 1})
    store.save_upstream(b, _upstream("DEMO02"))

    # DEMO03 - back at nets after a lumbar injury, soreness rising
    c = store.create_athlete({
        "bowler_id": "DEMO03", "birth_year": _year(14), "dominant_arm": "right", "playing_level": "school",
        "injury_history": [{"site": "lumbar", "injury_date": _d(42), "returned_to_play": False,
                            "notes": "Low back pain, imaging pending"}]})
    for days_ago, overs, sore in [(26, 6, 2), (23, 6, 3), (12, 4, 4), (6, 5, 5), (5, 6, 6), (4, 6, 7), (2, 5, 7)]:
        store.add_workload(c, {"session_date": _d(days_ago), "session_type": "nets", "overs": overs, "spells": 2,
                               "longest_spell_overs": 4, "rpe": 7, "soreness": sore})
    store.save_upstream(c, _upstream("DEMO03"))

    print(f"Seeded 3 synthetic demo bowlers into {store.DB_PATH}")


if __name__ == "__main__":
    seed()
