"""
What-if research study (C4 research extension).

Research questions
  RQ-W1  Does model-guided ranking change the ORDER of the plan compared with rule priority?
         -> Kendall's tau between rule order and predicted-effect order, per case.
  RQ-W2  Is the model's behaviour clinically plausible? A technique fix or a load reduction
         should never INCREASE predicted risk.  -> share of "plausible" scenarios.
  RQ-W3  Do physiotherapists prefer the model-guided plan?  -> blinded A/B sheet
         (plan order A vs B, randomised per case) for experts to fill in.

Run from components/c4_recommend (needs C3's trained model, see components/c3_risk/README.md):
    python experiments/whatif_study.py
Outputs (experiments/):
    whatif_results.csv      one row per case x action: risk now, risk after, effect
    whatif_ab_sheet.csv     blinded A/B sheet for the physiotherapist study
    whatif_ab_key.csv       which plan (A/B) is model-guided - do NOT give this to the expert
    whatif_summary.md       RQ-W1 / RQ-W2 numbers to paste into the report
"""
from __future__ import annotations

import csv
import random
import statistics
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "c3_risk" / "src"))

from c4_recommend.engine import generate_plan, load_kb  # noqa: E402
from c4_recommend.models import UpstreamInput  # noqa: E402
from c4_recommend.whatif import MIN_EFFECT, simulate  # noqa: E402

sys.path.insert(0, str(HERE))
from evaluate import CASES  # noqa: E402  (the same 12 representative cases as the expert-agreement study)

KB = load_kb()
SEED = 2026


def c3_or_exit():
    try:
        from c3_risk.explain import contract_view
        from c3_risk.model import get_model
        from c3_risk.service import run
        model = get_model()
    except Exception as e:
        sys.exit(f"C3's risk model is needed for this study: {e}\nSee components/c3_risk/README.md")
    return run, contract_view, model.version


def kendall_tau(a: list, b: list) -> float:
    """Rank agreement of two orderings of the same items (+1 same order, -1 reversed)."""
    items = [x for x in a if x in b]
    if len(items) < 2:
        return float("nan")
    pa, pb = {x: i for i, x in enumerate(a)}, {x: i for i, x in enumerate(b)}
    conc = disc = 0
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            s = (pa[items[i]] - pa[items[j]]) * (pb[items[i]] - pb[items[j]])
            conc += s > 0
            disc += s < 0
    return (conc - disc) / (conc + disc) if conc + disc else float("nan")


def main():
    run, contract_view, model_name = c3_or_exit()
    rng = random.Random(SEED)
    results, sheet, keys, taus, plausible, total = [], [], [], [], 0, 0

    for cid, desc, athlete_m, workloads_m, upstream_m in CASES:
        athlete = athlete_m.model_dump(mode="json")
        athlete["bowler_id"] = "CASE"
        workloads = [w.model_dump(mode="json") for w in workloads_m]
        c2_rows = [r.model_dump(mode="json") for r in upstream_m.c2]
        # plan built from C3's real output for these inputs (the full C3 -> C4 chain)
        c3 = contract_view(run(athlete, workloads, c2_rows))
        plan = generate_plan(athlete_m, workloads_m, UpstreamInput(c3=c3, c2=c2_rows), KB).model_dump(mode="json")
        scorer = lambda a, w, c: run(a, w, c)["risk_score"]  # noqa: E731
        wi = simulate(athlete, workloads, c2_rows, scorer, plan=plan, kb=KB, model_name=model_name)

        # rule order of each action = position of its first linked rule in the plan
        rule_pos = {r["rule_id"]: i for i, r in enumerate(plan["recommendations"])}
        rule_order = sorted(wi["scenarios"], key=lambda s: min([rule_pos.get(x, 99) for x in s["linked_rules"]]))
        rule_ids = [s["id"] for s in rule_order]
        model_ids = [s["id"] for s in wi["scenarios"]]          # already sorted by effect
        tau = kendall_tau(rule_ids, model_ids)
        if tau == tau:
            taus.append(tau)

        for s in wi["scenarios"]:
            total += 1
            plausible += s["effect"] >= -1e-6
            results.append({"case": cid, "description": desc, "plan_tier": plan["risk_tier"],
                            "base_risk": round(wi["base_risk"] * 100, 1), "category": s["category"], "action": s["title"],
                            "change": s["change"], "risk_after": round(s["risk"] * 100, 1),
                            "effect_points": round(s["effect"] * 100, 1), "meaningful": s["meaningful"]})

        if len(wi["scenarios"]) >= 2:                           # A/B only where the order can differ
            rule_txt = " > ".join(s["title"] for s in rule_order[:3])
            model_txt = " > ".join(s["title"] for s in wi["scenarios"][:3])
            flip = rng.random() < 0.5
            sheet.append({"case": cid, "description": desc,
                          "plan_A_order": model_txt if flip else rule_txt,
                          "plan_B_order": rule_txt if flip else model_txt,
                          "preferred (A/B/same)": "", "usefulness_A (1-5)": "", "usefulness_B (1-5)": "",
                          "comment": ""})
            keys.append({"case": cid, "model_guided_plan_is": "A" if flip else "B"})

    with open(HERE / "whatif_results.csv", "w", newline="", encoding="utf-8") as fh:
        wr = csv.DictWriter(fh, fieldnames=list(results[0]) if results else ["case"])
        wr.writeheader(); wr.writerows(results)
    with open(HERE / "whatif_ab_sheet.csv", "w", newline="", encoding="utf-8") as fh:
        wr = csv.DictWriter(fh, fieldnames=list(sheet[0]) if sheet else ["case"])
        wr.writeheader(); wr.writerows(sheet)

    with open(HERE / "whatif_ab_key.csv", "w", newline="", encoding="utf-8") as fh:   # keep away from the expert
        wr = csv.DictWriter(fh, fieldnames=["case", "model_guided_plan_is"])
        wr.writeheader(); wr.writerows(keys)

    meaningful = [r for r in results if r["meaningful"]]
    by_type = {}
    for r in results:
        by_type.setdefault(r["category"], []).append(r["effect_points"])
    lines = [
        "# What-if study - results",
        "",
        f"Model: `{model_name}` · run {date.today().isoformat()} · {len(CASES)} cases · {total} action scenarios",
        "",
        "| Question | Result |",
        "|---|---|",
        f"| RQ-W1 rule order vs model order (mean Kendall's tau, {len(taus)} cases) | "
        f"{statistics.mean(taus):.2f} |" if taus else "| RQ-W1 | not enough cases with 2+ actions |",
        f"| RQ-W2 plausible scenarios (fix never raises risk) | {plausible}/{total} ({plausible / total:.0%}) |"
        if total else "| RQ-W2 | no scenarios |",
        f"| Actions with a meaningful effect (>= {MIN_EFFECT * 100:.0f} points) | {len(meaningful)}/{total} |",
        f"| RQ-W3 blinded A/B sheet | `whatif_ab_sheet.csv`, {len(sheet)} cases - to be filled by physiotherapists |",
        "",
        "Mean predicted effect by action type (points on 0-100):",
        "",
    ] + [f"- {k}: {statistics.mean(v):+.1f} (n={len(v)})" for k, v in sorted(by_type.items())] + [
        "",
        "Interpretation notes: tau near 1 = the model agrees with the rule priority; lower = the model "
        "re-orders the plan (the what-if adds information). The C3 model is trained on synthetic data, so "
        "effects show how the method works, not validated clinical effects.",
    ]
    (HERE / "whatif_summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
