"""
Research experiment: rule-based vs model-guided (what-if) next-week plans.

Data (all from this repository - no hand-made demo cases)
    * C3's synthetic development cohort (components/c3_risk/scripts/generate_synthetic.py,
      seed 2026, 200 bowlers, 24-week season) - the exact data C3's committed model was trained on
    * C3's trained model (components/c3_risk/models/c3_xgb.json + model_card.json)
    * C4's knowledge base and rule engine (src/c4_recommend)
    Only the held-out TEST bowlers are used by default (C3 never saw them in training).

For every screening session the pipeline runs end to end, exactly as in the app:
    C2 rows + workload log + profile -> C3 risk + SHAP -> C4 rule plan -> C4 what-if plan

Policies compared for the 7 days after the session (weeks 2-4: usual week again for everyone)
    usual        the bowler's own usual week (what happens without CricShield)
    rules        C4 rule engine limits applied to the usual week (daily limit and bowling days
                 per tier, 2-in-a-row, spike cap 1.3 x chronic, Critical = no bowling)
    whatif       C4 model-guided plan (src/c4_recommend/weekplan.py)
    rest         naive baseline: full rest week for every bowler at Moderate tier or above

Outcome: TRUE injury probability from the generator's hazard model (experiments/oracle.py),
so the policies are not judged by the same model that chose the what-if plan.

Run (from components/c4_recommend):
    python ../c3_risk/scripts/generate_synthetic.py --out ../../data/c3_synthetic/data   # once, ~4 min
    python experiments/weekplan_study.py --data ../../data/c3_synthetic/data
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "c3_risk" / "src"))
sys.path.insert(0, str(HERE))

from c3_risk import features as F  # noqa: E402
from c3_risk.explain import assess, contract_view  # noqa: E402
from c3_risk.model import get_model  # noqa: E402
from c3_risk.train import SyntheticSource  # noqa: E402
from c4_recommend import weekplan as whatif  # noqa: E402
from c4_recommend.engine import generate_plan, load_kb  # noqa: E402
from c4_recommend.models import AthleteCreate, UpstreamInput, WorkloadCreate  # noqa: E402
from oracle import Oracle  # noqa: E402

POLICIES = ["usual", "ecb", "rules", "whatif", "whatif_keep", "whatif_state", "rest"]
TIERS = ["Low", "Moderate", "High", "Critical"]


# ---------------------------------------------------------------------------
# Inputs in contract shape
# ---------------------------------------------------------------------------
def c2_rows_all(src: SyntheticSource, spell_id: str, bowler: str) -> list[dict]:
    """All analysed deliveries of the screening spell, C2 contract shape (deterministic)."""
    rows = []
    for r in src._deliv[spell_id].itertuples():
        feats = {
            "shoulder_counter_rotation_deg": {"value": float(r.shoulder_counter_rotation_deg), "threshold": 30.0,
                                              "breach": bool(r.shoulder_counter_rotation_deg > 30), "reliable": True},
            "trunk_lateral_flexion_deg": {"value": float(r.lateral_flexion_at_br_deg), "threshold": 40.0,
                                          "breach": bool(r.lateral_flexion_at_br_deg > 40), "reliable": True},
            "front_knee_flexion_ffc_deg": {"value": float(r.front_knee_flexion_ffc_deg), "threshold": None,
                                           "breach": False, "reliable": True},
            "front_knee_flexion_release_deg": {"value": float(r.front_knee_flexion_br_deg), "threshold": 30.0,
                                               "breach": bool(r.front_knee_flexion_br_deg < 30), "reliable": True},
        }
        rows.append({"video_id": f"{bowler}_D{int(r.delivery_no):02d}_side_10m", "bowler_id": bowler, "features": feats})
    return rows


def athlete_model(a: dict, arm: str) -> AthleteCreate:
    return AthleteCreate(bowler_id=a["bowler_id"], birth_year=a["birth_year"],
                         dominant_arm="left" if arm == "L" else "right",
                         playing_level=a["playing_level"], injury_history=a["injury_history"])


# ---------------------------------------------------------------------------
# Policies
# ---------------------------------------------------------------------------
def rest_week(usual: list[dict], tier: str) -> list[dict]:
    if tier == "Low":
        return [dict(d) for d in usual]
    return [{**d, "overs": 0.0, "session_type": "rest"} for d in usual]


def horizon(week: list[dict], usual: list[dict], days: int = 28) -> tuple[list[float], list[bool]]:
    """Week 1 = policy, weeks 2-4 = the usual week again (everyone returns to normal)."""
    seq = list(week) + [usual[i % 7] for i in range(days - 7)]
    return [d["overs"] * 6 for d in seq], [d["session_type"] == "match" and d["overs"] > 0 for d in seq]


def summary(week: list[dict]) -> dict:
    return {"overs": sum(d["overs"] for d in week), "days": sum(d["overs"] > 0 for d in week),
            "matches": sum(d["overs"] > 0 and d["session_type"] == "match" for d in week)}


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------
def boot_ci(df: pd.DataFrame, fn, n: int = 2000, seed: int = 2026) -> list[float]:
    rng = np.random.default_rng(seed)
    groups = {b: g for b, g in df.groupby("bowler_id")}
    ids = list(groups)
    vals = []
    for _ in range(n):
        s = pd.concat([groups[b] for b in rng.choice(ids, len(ids))])
        vals.append(fn(s))
    return [float(np.quantile(vals, 0.025)), float(np.quantile(vals, 0.975))]


def spearman(x, y) -> float:
    return float(pd.Series(x).rank().corr(pd.Series(y).rank()))


def auc(y, s) -> float:
    from sklearn.metrics import roc_auc_score
    return float(roc_auc_score(y, s))


# ---------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=HERE.parents[2] / "data" / "c3_synthetic" / "data")
    ap.add_argument("--split", default="test", choices=["test", "val", "train", "all"])
    ap.add_argument("--limit", type=int, default=0, help="only the first N sessions (quick check)")
    ap.add_argument("--out", type=Path, default=HERE)
    args = ap.parse_args()

    t_start = time.time()
    kb = load_kb()
    model = get_model()
    src = SyntheticSource(args.data, seed=2026)
    oracle = Oracle(args.data)
    spells = src.spells.copy()
    oracle.set_screen_days(pd.read_csv(args.data / "spells.csv"))
    check = oracle.check(pd.read_csv(args.data / "spells.csv"))
    print(f"Oracle check: {check}")
    if args.split != "all":
        spells = spells[spells.split == args.split]
    if args.limit:
        spells = spells.head(args.limit)
    print(f"{len(spells)} sessions from {spells.bowler_id.nunique()} bowlers ({args.split} split)")

    rows, examples = [], []
    for n, s in enumerate(spells.itertuples(), 1):
        as_of = s.screen_date.date()
        a = src.athlete(s.bowler_id, as_of)
        workloads = src.workloads(s.bowler_id, as_of)
        c2 = c2_rows_all(src, s.spell_id, s.bowler_id)

        # C3 -> C4 rules (exactly the production path)
        feats, notes, summ = F.build_features(c2, workloads, a, as_of)
        c3 = contract_view(assess(model, feats, notes, summ, s.bowler_id, s.spell_id))
        upstream = UpstreamInput(c3=c3, c2=c2)
        plan = generate_plan(athlete_model(a, src.athletes.loc[s.bowler_id, "bowling_arm"]),
                             [WorkloadCreate(**w) for w in workloads], upstream, kb, today=as_of)
        run = lambda mode: whatif.week_plan(a, workloads, upstream, kb, as_of=as_of, plan=plan, model=model,
                                          c3_features=F, mode=mode)
        wi, wi_keep, wi_state = run("tradeoff"), run("keep_bowling"), run("state")
        days = lambda r: [{"date": d.session_date, "session_type": d.session_type, "overs": d.overs} for d in r]

        usual = whatif.usual_week(workloads, as_of)
        weeks = {
            "usual": usual,
            "ecb": days(wi.usual.days),
            "rules": days(wi.rule_plan.days),
            "whatif": days(wi.recommended.days),
            "whatif_keep": days(wi_keep.recommended.days),
            "whatif_state": days(wi_state.recommended.days),
            "rest": rest_week(usual, plan.risk_tier),
        }
        sim = whatif.Simulator(model, F, a, workloads, c2, as_of)
        pred = sim.evaluate([weeks[p] for p in POLICIES], follow=usual)
        row = {"spell_id": s.spell_id, "bowler_id": s.bowler_id, "as_of": as_of.isoformat(),
               "tier": plan.risk_tier, "c3_risk_score": c3["risk_score"], "injury_28d": int(s.injury_28d),
               "whatif_status": wi.status, "whatif_keep_status": wi_keep.status, "referral_rules": plan.referral.required,
               "referral_whatif": wi.referral_advised,
               "whatif_pred14_usual": wi.usual.risk_14d, "whatif_pred14_plan": wi.recommended.risk_14d, "candidates": wi.candidates_evaluated,
               "whatif_ms": wi.latency_ms, "technique_best_change": wi.technique[0].change if wi.technique else 0.0}
        for p, d in zip(POLICIES, pred):
            seq, match = horizon(weeks[p], usual)
            o = oracle.risk(s.spell_id, seq, match)
            sm = summary(weeks[p])
            row.update({f"{p}_overs": sm["overs"], f"{p}_days": sm["days"], f"{p}_matches": sm["matches"],
                        f"{p}_pred_peak": max(d["daily"]), f"{p}_pred14": d["risk_14d"],
                        f"{p}_true28": o["risk"], f"{p}_true7": o["risk_week1"]})
        rows.append(row)
        if len(examples) < 6 and wi.status == "optimised" and abs(row["rules_overs"] - row["whatif_overs"]) >= 2:
            examples.append({"spell": s.spell_id, "tier": plan.risk_tier, "explanation": wi.explanation,
                             "usual": [f"{d.weekday} {d.overs:g}" for d in wi.usual.days if d.overs],
                             "rules": [f"{d.weekday} {d.overs:g}" for d in wi.rule_plan.days if d.overs],
                             "whatif": [f"{d.weekday} {d.overs:g}" for d in wi.recommended.days if d.overs],
                             "true28": {p: round(row[f"{p}_true28"], 4) for p in POLICIES}})
        if n % 50 == 0:
            print(f"  {n}/{len(spells)} sessions ({time.time() - t_start:.0f}s)")

    df = pd.DataFrame(rows)
    args.out.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.out / f"weekplan_sessions_{args.split}.csv", index=False)

    # ------------------------------------------------------------- results
    flagged = df[df.tier != "Low"]
    res = {"split": args.split, "sessions": len(df), "bowlers": int(df.bowler_id.nunique()),
           "flagged_sessions": len(flagged), "oracle_check": check,
           "tiers": df.tier.value_counts().reindex(TIERS, fill_value=0).to_dict(),
           "whatif_status": df.whatif_status.value_counts().to_dict(),
           "whatif_keep_status": df.whatif_keep_status.value_counts().to_dict(), "policies": {}}

    def pol(d, p):
        u = d["usual_overs"].sum()
        return {"true_risk_28d_mean": float(d[f"{p}_true28"].mean()),
                "expected_injuries_per_100": float(100 * d[f"{p}_true28"].mean()),
                "true_risk_week1_mean": float(d[f"{p}_true7"].mean()),
                "c3_peak_risk_mean": float(d[f"{p}_pred_peak"].mean()),
                "share_below_alert_c3": float((d[f"{p}_pred_peak"] < kb["risk_tiers"]["Moderate"]).mean()),
                "overs_kept_pct": float(100 * d[f"{p}_overs"].sum() / u) if u else 100.0,
                "bowling_days_mean": float(d[f"{p}_days"].mean()),
                "matches_kept_pct": float(100 * d[f"{p}_matches"].sum() / max(1, d["usual_matches"].sum()))}

    for name, d in (("all", df), ("flagged", flagged)):
        res["policies"][name] = {p: pol(d, p) for p in POLICIES}
        base = d["usual_true28"].mean()
        for p in POLICIES[1:]:
            r = res["policies"][name][p]
            r["relative_risk_reduction_pct"] = float(100 * (base - d[f"{p}_true28"].mean()) / base)
            removed = (d["usual_overs"] - d[f"{p}_overs"]).sum()
            prevented = 100 * (base - d[f"{p}_true28"].mean()) * len(d) / 100
            r["injuries_prevented_per_1000_overs_removed"] = float(1000 * prevented / removed) if removed > 0 else None

    # paired comparisons against the rule engine (flagged sessions; bowler bootstrap)
    f = flagged
    for p in ("ecb", "whatif", "whatif_keep", "whatif_state"):
        res[f"{p}_vs_rules"] = {
            "true_risk_diff_mean": float((f[f"{p}_true28"] - f.rules_true28).mean()),
            "true_risk_diff_ci95": boot_ci(f, lambda d: (d[f"{p}_true28"] - d.rules_true28).mean()),
            "overs_kept_diff_pct_points": float(100 * (f[f"{p}_overs"].sum() - f.rules_overs.sum()) / f.usual_overs.sum()),
            "overs_kept_diff_ci95": boot_ci(f, lambda d: 100 * (d[f"{p}_overs"].sum() - d.rules_overs.sum()) / d.usual_overs.sum()),
            "sessions_lower_true_risk_pct": float(100 * (f[f"{p}_true28"] < f.rules_true28 - 1e-9).mean()),
            "sessions_higher_true_risk_pct": float(100 * (f[f"{p}_true28"] > f.rules_true28 + 1e-9).mean()),
            "sessions_more_overs_pct": float(100 * (f[f"{p}_overs"] > f.rules_overs + 1e-9).mean()),
        }
    res["whatif_vs_rules"] = res["whatif_vs_rules"]
    # does the model rank plans the way the TRUE hazard does? (counterfactual validity)
    pairs, agree, dp, dt = 0, 0, [], []
    for r in f.itertuples():
        pol = [p for p in POLICIES if p not in ("usual", "ecb")]
        for p in pol:
            dp.append(getattr(r, "usual_pred14") - getattr(r, f"{p}_pred14"))
            dt.append(getattr(r, "usual_true28") - getattr(r, f"{p}_true28"))
        for i in range(len(POLICIES)):
            for j in range(i + 1, len(POLICIES)):
                a_, b_ = POLICIES[i], POLICIES[j]
                tp = getattr(r, f"{a_}_pred14") - getattr(r, f"{b_}_pred14")
                tt = getattr(r, f"{a_}_true28") - getattr(r, f"{b_}_true28")
                if abs(tp) > 1e-6 and abs(tt) > 1e-6:
                    pairs += 1
                    agree += (tp > 0) == (tt > 0)
    res["counterfactual_validity"] = {
        "plan_pairs_compared": pairs,
        "pairwise_ordering_agreement_pct": float(100 * agree / pairs) if pairs else None,
        "spearman_pred_vs_true_reduction": spearman(dp, dt),
    }
    res["c3_on_usual_vs_label_auc"] = auc(df.injury_28d, df.c3_risk_score) if df.injury_28d.nunique() > 1 else None
    res["oracle_usual_vs_label_auc"] = auc(df.injury_28d, df.usual_true28) if df.injury_28d.nunique() > 1 else None
    res["latency_ms"] = {"mean": float(df.whatif_ms.mean()), "p95": float(df.whatif_ms.quantile(0.95)),
                         "candidates_mean": float(df.candidates.mean())}
    res["by_tier"] = {t: {p: {"true_risk_28d_mean": float(g[f"{p}_true28"].mean()),
                              "overs_kept_pct": float(100 * g[f"{p}_overs"].sum() / max(1e-9, g.usual_overs.sum()))}
                          for p in POLICIES} | {"sessions": len(g)}
                      for t, g in df.groupby("tier")}
    res["examples"] = examples
    res["runtime_s"] = round(time.time() - t_start, 1)
    (args.out / f"weekplan_results_{args.split}.json").write_text(json.dumps(res, indent=2, default=str), encoding="utf-8")
    write_markdown(res, args.out / f"weekplan_results_{args.split}.md", model)
    print(json.dumps({k: res[k] for k in ("sessions", "flagged_sessions", "whatif_status", "whatif_vs_rules",
                                          "whatif_keep_vs_rules", "whatif_state_vs_rules",
                                          "counterfactual_validity")}, indent=1))
    print(f"Done in {res['runtime_s']} s -> {args.out}")


def _f(v, d=2) -> str:
    return "n/a" if v is None else f"{v:.{d}f}"


def write_markdown(res: dict, path: Path, model) -> None:
    P = res["policies"]["flagged"]
    A = res["policies"]["all"]
    cv = res["counterfactual_validity"]
    name = {"usual": "Usual week (no CricShield)", "ecb": "ECB hard limits only", "rules": "C4 rule engine",
            "whatif": "C4 week planner – trade-off (proposed)",
            "whatif_keep": "C4 week planner – same risk as rules, most overs",
            "whatif_state": "C4 week planner – peak state score (ablation)", "rest": "Full rest if flagged"}
    L = [
        f"# C4 research experiment – rule-based vs model-guided week plans (week planner) ({res['split']} split)",
        "",
        f"Generated by `experiments/weekplan_study.py`. C3 model: `{model.version}`. "
        f"{res['sessions']} screening sessions from {res['bowlers']} held-out bowlers of C3's synthetic cohort; "
        f"{res['flagged_sessions']} were flagged (Moderate tier or above).",
        "",
        "Outcome = **true** 28-day injury probability from the generator's hazard model (`experiments/oracle.py`), "
        "not C3's prediction, so the what-if plan is not graded by the model that chose it. "
        f"Oracle reproduction check: max error {res['oracle_check']['max_abs_error']:.4f} over "
        f"{res['oracle_check']['terms_checked']} recorded hazard terms.",
        "",
        "## Flagged sessions (where a plan changes anything)",
        "",
        "| Policy | Expected injuries / 100 sessions | Risk reduction vs usual | Overs kept | Matches kept | Injuries prevented per 1000 overs removed |",
        "|---|---|---|---|---|---|",
    ]
    for p in POLICIES:
        r = P[p]
        rr = "–" if p == "usual" else f"{r['relative_risk_reduction_pct']:.1f}%"
        eff = "–" if p == "usual" or r.get("injuries_prevented_per_1000_overs_removed") is None else f"{r['injuries_prevented_per_1000_overs_removed']:.2f}"
        L.append(f"| {name[p]} | {r['expected_injuries_per_100']:.2f} | {rr} | {r['overs_kept_pct']:.0f}% | "
                 f"{r['matches_kept_pct']:.0f}% | {eff} |")
    L += [
        "",
        "## Model-guided plans vs the rule engine (paired, flagged sessions, 95% CI by bowler bootstrap)",
        "",
        "| Plan | True 28-day risk vs rules (points) | Overs kept vs rules (points of usual week) | Sessions lower / higher true risk | Sessions with more bowling |",
        "|---|---|---|---|---|",
    ] + [f"| {name[p]} | {res[p + '_vs_rules']['true_risk_diff_mean'] * 100:+.2f} "
         f"[{res[p + '_vs_rules']['true_risk_diff_ci95'][0] * 100:+.2f}, {res[p + '_vs_rules']['true_risk_diff_ci95'][1] * 100:+.2f}] | "
         f"{res[p + '_vs_rules']['overs_kept_diff_pct_points']:+.1f} "
         f"[{res[p + '_vs_rules']['overs_kept_diff_ci95'][0]:+.1f}, {res[p + '_vs_rules']['overs_kept_diff_ci95'][1]:+.1f}] | "
         f"{res[p + '_vs_rules']['sessions_lower_true_risk_pct']:.0f}% / {res[p + '_vs_rules']['sessions_higher_true_risk_pct']:.0f}% | "
         f"{res[p + '_vs_rules']['sessions_more_overs_pct']:.0f}% |" for p in ("ecb", "whatif", "whatif_keep", "whatif_state")] + [
        "",
        "## Does the model rank plans like the true injury mechanism? (counterfactual validity)",
        "",
        f"* For every pair of plans for the same bowler, C3's predicted 14-day risk orders them the same way as the true "
        f"28-day risk in **{_f(cv['pairwise_ordering_agreement_pct'], 0)}%** of {cv['plan_pairs_compared']} pairs.",
        f"* Spearman correlation between predicted and true risk reduction (vs usual week): {_f(cv['spearman_pred_vs_true_reduction'])}.",
        "",
        "## All sessions",
        "",
        "| Policy | Expected injuries / 100 sessions | Overs kept |",
        "|---|---|---|",
    ] + [f"| {name[p]} | {A[p]['expected_injuries_per_100']:.2f} | {A[p]['overs_kept_pct']:.0f}% |" for p in POLICIES] + [
        "",
        "## By tier (true 28-day risk %, overs kept %)",
        "",
        "| Tier | Sessions | " + " | ".join(name[p] for p in POLICIES) + " |",
        "|---|---|" + "---|" * len(POLICIES),
    ]
    for t in TIERS:
        if t in res["by_tier"]:
            g = res["by_tier"][t]
            L.append(f"| {t} | {g['sessions']} | " + " | ".join(
                f"{100 * g[p]['true_risk_28d_mean']:.1f}% / {g[p]['overs_kept_pct']:.0f}%" for p in POLICIES) + " |")
    L += [
        "",
        f"What-if status: {res['whatif_status']}. Latency: mean {res['latency_ms']['mean']:.0f} ms, "
        f"p95 {res['latency_ms']['p95']:.0f} ms, {res['latency_ms']['candidates_mean']:.0f} candidate weeks per bowler "
        "(NFR: < 3000 ms).",
        "Sanity: C3 score vs observed injury AUC " + _f(res["c3_on_usual_vs_label_auc"]) +
        "; oracle risk vs observed injury AUC " + _f(res["oracle_usual_vs_label_auc"]) + ".",
        "",
        "## Example plans where the what-if differs from the rules",
        "",
    ]
    for e in res["examples"]:
        L += [f"* **{e['spell']}** ({e['tier']}) – usual (ECB-limited) {', '.join(e['usual'])}; rules {', '.join(e['rules']) or 'no bowling'}; "
              f"what-if {', '.join(e['whatif']) or 'no bowling'}. True 28-day risk: {e['true28']}.",
              f"  > {e['explanation']}"]
    L += [
        "",
        "## Limits of this experiment",
        "",
        "* Synthetic cohort: shows the method works when the injury mechanism is known; it is not evidence about real bowlers.",
        "* C3 was trained on data from the same generator, so real-world gains are expected to be smaller.",
        "* Technique is held fixed for the planned week; weeks 2–4 return to the usual week for every policy.",
        "* Next step: repeat with real bowler logs and physiotherapist-labelled plans (Cohen's κ, `experiments/evaluate.py`).",
    ]
    path.write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
