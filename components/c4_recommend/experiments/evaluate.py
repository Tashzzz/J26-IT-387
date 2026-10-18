"""
Evaluation harness (Proposal 4.3.3).

Step 1  python experiments/evaluate.py
        -> writes evaluation/labelling_sheet.csv with the engine's output for
           12 representative athlete cases + empty expert columns.
Step 2  Give the sheet to a physiotherapist / coach. They fill in
        expert_tier (Low/Moderate/High/Critical) and expert_referral (yes/no)
        WITHOUT looking at the engine columns (cover them / hide the columns).
Step 3  python experiments/evaluate.py
        -> computes Cohen's kappa for tier and referral agreement + latency.

Run from components/c4_recommend:   python experiments/evaluate.py
"""
from __future__ import annotations

import csv
import statistics
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from c4_recommend.engine import generate_plan, load_kb  # noqa: E402
from c4_recommend.models import AthleteCreate, InjuryRecord, UpstreamInput, WorkloadCreate  # noqa: E402

SHEET = Path(__file__).with_name("labelling_sheet.csv")
TODAY = date.today()
KB = load_kb()


def ath(age, injuries=()):
    return AthleteCreate(bowler_id="CASE", birth_year=TODAY.year - age, dominant_arm="right", playing_level="club",
                         injury_history=[InjuryRecord(site=s, injury_date=TODAY - timedelta(days=d)) for s, d in injuries])


def wl(base=5, recent=5, recent_days=(6, 3), soreness=1):
    days = [(d, base) for d in (27, 24, 20, 17, 13, 10)] + [(d, recent) for d in recent_days]
    return [WorkloadCreate(session_date=TODAY - timedelta(days=d), session_type="nets", overs=o, soreness=soreness) for d, o in days]


FEAT = {"scr": "shoulder_counter_rotation_deg", "tlf": "trunk_lateral_flexion_deg", "knee": "front_knee_flexion_release_deg"}


def up(score=None, flags=()):
    """flags: (short_name, value, threshold, reliable)"""
    feats = {FEAT[f]: {"value": v, "threshold": t, "breach": True, "reliable": r} for f, v, t, r in flags}
    data = {"c2": [{"video_id": "CASE_D01", "bowler_id": "CASE", "features": feats}] if feats else []}
    if score is not None:
        level = "high" if score >= 0.55 else "medium" if score >= 0.3 else "low"
        data["c3"] = {"bowler_id": "CASE", "session_id": "CASE_s", "risk_score": score, "risk_level": level}
    return UpstreamInput(**data)


CASES = [
    ("C01", "U19, steady load, no flags, model risk 12%", ath(17), wl(), up(0.12)),
    ("C02", "Senior, steady load, model risk 35%", ath(24), wl(8, 8), up(0.35)),
    ("C03", "U19, ACWR ~1.8 spike, model risk 48%", ath(17), wl(5, 12), up(0.48)),
    ("C04", "U19, ACWR > 2 spike, model risk 30%", ath(18), wl(5, 20), up(0.30)),
    ("C05", "U15, SCR 38 deg (moderate), model risk 52%", ath(14), wl(), up(0.52, [("scr", 38, 30, True)])),
    ("C06", "U19, trunk side-bend 52 deg + SCR 42 deg (both severe), risk 66%", ath(17), wl(), up(0.66, [("tlf", 52, 40, True), ("scr", 42, 30, True)])),
    ("C07", "Senior, lumbar injury 5 weeks ago, model risk 40%", ath(23, [("lumbar", 35)]), wl(), up(0.40)),
    ("C08", "U19, soreness 8/10 this week, model risk 25%", ath(17), wl(soreness=8), up(0.25)),
    ("C09", "U19, model risk 79%, front knee flag", ath(16), wl(), up(0.79, [("knee", 22, 30, True)])),
    ("C10", "U19, C3 offline, spike + SCR breach", ath(17), wl(5, 12), up(None, [("scr", 40, 30, True)])),
    ("C11", "Senior, under-loaded after break, model risk 20%", ath(26), wl(8, 2, (4,)), up(0.20)),
    ("C12", "U13, 4 days in a row bowling, model risk 33%", ath(12), wl(3, 3, (4, 3, 2, 1)), up(0.33)),
]


def cohen_kappa(a: list[str], b: list[str]) -> float:
    labels = sorted(set(a) | set(b))
    n = len(a)
    po = sum(x == y for x, y in zip(a, b)) / n
    pe = sum((a.count(l) / n) * (b.count(l) / n) for l in labels)
    return 1.0 if pe == 1 else (po - pe) / (1 - pe)


def run_engine():
    rows = []
    for cid, desc, a, w, u in CASES:
        p = generate_plan(a, w, u, KB)
        rows.append({"case_id": cid, "description": desc, "engine_tier": p.risk_tier,
                     "engine_referral": "yes" if p.referral.required else "no",
                     "engine_top_action": p.recommendations[0].title if p.recommendations else "",
                     "expert_tier": "", "expert_referral": "", "expert_comment": ""})
    return rows


def latency(n=500):
    a, w, u = CASES[5][2], CASES[5][3], CASES[5][4]
    t = []
    for _ in range(n):
        s = time.perf_counter(); generate_plan(a, w, u, KB); t.append((time.perf_counter() - s) * 1000)
    t.sort()
    return statistics.mean(t), t[int(0.95 * n)]


def main():
    engine_rows = run_engine()
    if SHEET.exists():
        with open(SHEET, newline="", encoding="utf-8") as fh:
            sheet = list(csv.DictReader(fh))
        labelled = [r for r in sheet if r["expert_tier"].strip()]
    else:
        sheet, labelled = [], []

    if not labelled:
        with open(SHEET, "w", newline="", encoding="utf-8") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(engine_rows[0]))
            wr.writeheader(); wr.writerows(engine_rows)
        print(f"Wrote {SHEET.name} with {len(engine_rows)} cases. Ask a physiotherapist to fill expert_tier / expert_referral, then re-run.")
    else:
        eng = {r["case_id"]: r for r in engine_rows}
        et = [eng[r["case_id"]]["engine_tier"] for r in labelled]
        xt = [r["expert_tier"].strip().capitalize() for r in labelled]
        er = [eng[r["case_id"]]["engine_referral"] for r in labelled]
        xr = [r["expert_referral"].strip().lower() for r in labelled]
        print(f"Expert-labelled cases: {len(labelled)}")
        print(f"Tier agreement:     {sum(a == b for a, b in zip(et, xt))}/{len(et)}   Cohen's kappa = {cohen_kappa(et, xt):.2f}")
        print(f"Referral agreement: {sum(a == b for a, b in zip(er, xr))}/{len(er)}   Cohen's kappa = {cohen_kappa(er, xr):.2f}")
        missed = [r["case_id"] for r, e in zip(labelled, er) if r["expert_referral"].strip().lower() == "yes" and e == "no"]
        print(f"Missed referrals (expert yes, engine no): {missed or 'none'}")

    mean, p95 = latency()
    print(f"Latency over 500 runs: mean {mean:.2f} ms, p95 {p95:.2f} ms (NFR target < 3000 ms)")
    print("\nEngine output per case:")
    for r in engine_rows:
        print(f"  {r['case_id']}  {r['engine_tier']:<9} referral={r['engine_referral']:<3}  {r['engine_top_action']:<38} | {r['description']}")


if __name__ == "__main__":
    main()
