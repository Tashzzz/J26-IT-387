"""
Squad-level research experiment: does model-guided allocation of workload cuts prevent more
injuries than tier-based rules, for the same amount of bowling given up?

Design
    * Data: C3's synthetic cohort (seed 2026) + C3's committed model + C4's knowledge base.
    * Every screening session runs the production path: C2 rows + log + profile -> C3 -> C4 rules.
    * Candidate next weeks come from whatif.prepare() (usual week, ECB guardrails, subsets x scales).
    * Policies
        usual       the bowler's usual week, no CricShield
        ecb         usual week inside the ECB hard limits only (daily overs, 4 days in 7, 2 in a row)
        rules       C4 rule engine (tier limits)                                   -> one point
        uniform(s)  every flagged bowler (Moderate+) keeps share s of each session  -> a curve
        model(v)    whatif tradeoff mode with exchange rate v (risk one over must buy) -> a curve
        rest        full rest week for every flagged bowler                         -> one point
      Critical tier / not returned to play -> no bowling in every policy except usual and ecb.
    * Outcome: TRUE 28-day injury probability from the generator's hazard model (oracle.py).
    * The exchange rate is chosen on the VALIDATION bowlers so that the model removes the same
      total overs as the rules; that single value is then applied to the held-out TEST bowlers.

Run (from components/c4_recommend):
    python experiments/weekplan_frontier.py --data ../../data/c3_synthetic/data
"""
from __future__ import annotations

import argparse
import json
import sys
import time
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
from c4_recommend.models import UpstreamInput, WorkloadCreate  # noqa: E402
from oracle import Oracle  # noqa: E402
from weekplan_study import athlete_model, c2_rows_all, horizon  # noqa: E402

OVER_VALUES = [0.0, 5e-5, 1e-4, 2e-4, 3e-4, 4e-4, 5e-4, 6e-4, 8e-4, 1e-3, 1.25e-3, 1.5e-3, 2e-3, 3e-3, 5e-3, 1.0]
UNIFORM = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.0]


def scale_week(week: list[dict], s: float) -> list[dict]:
    out = []
    for d in week:
        o = round(d["overs"] * s * 2) / 2
        if o < whatif.MIN_SESSION_OVERS:
            o = 0.0
        out.append({**d, "overs": o, "session_type": d["session_type"] if o > 0 else "rest"})
    return out


def run_split(split: str, src, oracle, model, kb, limit: int = 0) -> pd.DataFrame:
    spells = src.spells[src.spells.split == split]
    if limit:
        spells = spells.head(limit)
    recs = []
    t0 = time.time()
    for n, s in enumerate(spells.itertuples(), 1):
        as_of = s.screen_date.date()
        a = src.athlete(s.bowler_id, as_of)
        workloads = src.workloads(s.bowler_id, as_of)
        c2 = c2_rows_all(src, s.spell_id, s.bowler_id)
        feats, notes, summ = F.build_features(c2, workloads, a, as_of)
        c3 = contract_view(assess(model, feats, notes, summ, s.bowler_id, s.spell_id))
        upstream = UpstreamInput(c3=c3, c2=c2)
        plan = generate_plan(athlete_model(a, src.athletes.loc[s.bowler_id, "bowling_arm"]),
                             [WorkloadCreate(**w) for w in workloads], upstream, kb, today=as_of)
        ctx = whatif.prepare(a, workloads, upstream, kb, as_of=as_of, plan=plan, model=model, c3_features=F)
        flagged = plan.risk_tier != "Low"
        stop = ctx.stop_reason is not None
        zero = [{**d, "overs": 0.0, "session_type": "rest"} for d in ctx.usual]

        weeks: dict[tuple, list[dict]] = {("usual", 0): ctx.raw_usual, ("ecb", 0): ctx.usual, ("rules", 0): ctx.rules,
                                          ("rest", 0): zero if (flagged or stop) else ctx.usual}
        for u in UNIFORM:
            weeks[("uniform", u)] = zero if stop else (scale_week(ctx.usual, u) if flagged else ctx.usual)
        for v in OVER_VALUES:
            i, _ = whatif.choose(ctx, kb, "tradeoff", v)
            weeks[("model", v)] = ctx.cands[i]

        cache: dict[tuple, tuple] = {}
        for (pol, par), wk in weeks.items():
            key = tuple(d["overs"] for d in wk) + tuple(d["session_type"] for d in wk)
            if key not in cache:
                seq, match = horizon(wk, ctx.raw_usual)
                cache[key] = (oracle.risk(s.spell_id, seq, match)["risk"], sum(d["overs"] for d in wk))
            risk, overs = cache[key]
            recs.append({"split": split, "spell_id": s.spell_id, "bowler_id": s.bowler_id, "tier": plan.risk_tier,
                         "policy": pol, "param": par, "overs": overs, "true28": risk})
        if n % 100 == 0:
            print(f"  {split}: {n}/{len(spells)} ({time.time() - t0:.0f}s)")
    return pd.DataFrame(recs)


def curve(df: pd.DataFrame) -> pd.DataFrame:
    """Squad totals per (policy, param): overs kept % of usual and expected injuries per 100 sessions."""
    usual = df[df.policy == "usual"].set_index("spell_id")["overs"]
    g = df.groupby(["policy", "param"]).agg(overs=("overs", "sum"), risk=("true28", "mean")).reset_index()
    g["overs_kept_pct"] = 100 * g.overs / usual.sum()
    g["injuries_per_100"] = 100 * g.risk
    return g


def interp_model_at(c: pd.DataFrame, overs_pct: float) -> float:
    m = c[c.policy == "model"].sort_values("overs_kept_pct")
    return float(np.interp(overs_pct, m.overs_kept_pct, m.injuries_per_100))


def pick_over_value(c: pd.DataFrame) -> float:
    """Largest exchange rate (most bowling) whose overs kept do not exceed the rules' overs kept."""
    rules = c[c.policy == "rules"].overs_kept_pct.iloc[0]
    m = c[c.policy == "model"].sort_values("param")
    ok = m[m.overs_kept_pct <= rules + 1e-9]
    return float(ok.param.max()) if len(ok) else float(m.param.min())


def paired(df: pd.DataFrame, a: tuple, b: tuple, n_boot: int = 2000, seed: int = 2026) -> dict:
    A = df[(df.policy == a[0]) & (df.param == a[1])].set_index("spell_id")
    B = df[(df.policy == b[0]) & (df.param == b[1])].set_index("spell_id")
    j = A[["bowler_id", "overs", "true28"]].join(B[["overs", "true28"]], rsuffix="_b")
    usual = df[df.policy == "usual"].set_index("spell_id")["overs"]
    j["usual_overs"] = usual
    stat = lambda d: (100 * (d.true28.mean() - d.true28_b.mean()), 100 * (d.overs.sum() - d.overs_b.sum()) / d.usual_overs.sum())
    est = stat(j)
    rng = np.random.default_rng(seed)
    groups = [g for _, g in j.groupby("bowler_id")]
    bs = [stat(pd.concat([groups[k] for k in rng.integers(0, len(groups), len(groups))])) for _ in range(n_boot)]
    q = lambda k: [float(np.quantile([x[k] for x in bs], 0.025)), float(np.quantile([x[k] for x in bs], 0.975))]
    return {"injuries_per_100_diff": est[0], "injuries_per_100_diff_ci95": q(0),
            "overs_kept_diff_pct": est[1], "overs_kept_diff_ci95": q(1)}


def plot(c: pd.DataFrame, path: Path, title: str, chosen: float | None = None) -> None:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return
    fig, ax = plt.subplots(figsize=(7, 4.6), dpi=150)
    for pol, style, label in (("model", "-o", "C4 week planner (model-guided)"), ("uniform", "--s", "Same % cut for every flagged bowler")):
        m = c[c.policy == pol].sort_values("overs_kept_pct")
        ax.plot(m.overs_kept_pct, m.injuries_per_100, style, ms=4, label=label)
    for pol, mk, label in (("usual", "X", "Usual week"), ("ecb", "P", "ECB limits only"), ("rules", "D", "C4 rule engine"),
                           ("rest", "v", "Rest every flagged bowler")):
        r = c[c.policy == pol].iloc[0]
        ax.plot(r.overs_kept_pct, r.injuries_per_100, mk, ms=9, label=label)
    if chosen is not None:
        r = c[(c.policy == "model") & (c.param == chosen)].iloc[0]
        ax.plot(r.overs_kept_pct, r.injuries_per_100, "o", ms=14, mfc="none", mec="black", mew=1.5,
                label=f"Default exchange rate ({chosen:g})")
    ax.set_xlabel("Squad overs kept next week (% of usual)")
    ax.set_ylabel("Expected injuries per 100 screened bowlers\n(true 28-day risk)")
    ax.set_title(title, fontsize=10)
    ax.grid(alpha=0.3)
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=HERE.parents[2] / "data" / "c3_synthetic" / "data")
    ap.add_argument("--out", type=Path, default=HERE)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--save-sessions", action="store_true", help="also write the per-session CSV (large)")
    args = ap.parse_args()
    t0 = time.time()
    kb, model = load_kb(), get_model()
    src = SyntheticSource(args.data, seed=2026)
    oracle = Oracle(args.data)
    oracle.set_screen_days(pd.read_csv(args.data / "spells.csv"))

    val = run_split("val", src, oracle, model, kb, args.limit)
    cv = curve(val)
    v_star = pick_over_value(cv)
    print(f"Exchange rate chosen on validation bowlers: {v_star}")
    test = run_split("test", src, oracle, model, kb, args.limit)
    ct = curve(test)
    args.out.mkdir(parents=True, exist_ok=True)
    if args.save_sessions:
        pd.concat([val, test]).to_csv(args.out / "weekplan_frontier_sessions.csv", index=False)

    rules_t = ct[ct.policy == "rules"].iloc[0]
    model_t = ct[(ct.policy == "model") & (ct.param == v_star)].iloc[0]
    res = {
        "chosen_over_value": v_star,
        "val": {"sessions": int(val.spell_id.nunique()), "bowlers": int(val.bowler_id.nunique())},
        "test": {"sessions": int(test.spell_id.nunique()), "bowlers": int(test.bowler_id.nunique())},
        "test_points": {p: {"overs_kept_pct": float(r.overs_kept_pct), "injuries_per_100": float(r.injuries_per_100)}
                        for p, r in ct[ct.policy.isin(["usual", "ecb", "rules", "rest"])].set_index("policy").iterrows()},
        "test_model_at_chosen": {"overs_kept_pct": float(model_t.overs_kept_pct),
                                 "injuries_per_100": float(model_t.injuries_per_100)},
        "test_model_vs_rules_paired": paired(test, ("model", v_star), ("rules", 0)),
        "test_model_curve_at_rules_overs": interp_model_at(ct, float(rules_t.overs_kept_pct)),
        "test_uniform_curve_at_rules_overs": float(np.interp(rules_t.overs_kept_pct,
                                                             *ct[ct.policy == "uniform"].sort_values("overs_kept_pct")[["overs_kept_pct", "injuries_per_100"]].T.values)),
        "curves_test": ct.to_dict("records"),
        "curves_val": cv.to_dict("records"),
        "runtime_s": round(time.time() - t0, 1),
    }
    usual_inj = res["test_points"]["usual"]["injuries_per_100"]
    res["test_prevented_vs_usual"] = {
        "rules": usual_inj - float(rules_t.injuries_per_100),
        "model": usual_inj - float(model_t.injuries_per_100),
    }
    (args.out / "weekplan_frontier_results.json").write_text(json.dumps(res, indent=2, default=float), encoding="utf-8")
    plot(ct, args.out / "weekplan_frontier_test.png",
         f"Held-out C3 test bowlers ({res['test']['bowlers']} bowlers, {res['test']['sessions']} sessions)\n"
         f"true risk from the generator hazard; exchange rate picked on validation bowlers", v_star)
    print(json.dumps({k: res[k] for k in ("chosen_over_value", "test_points", "test_model_at_chosen",
                                          "test_model_vs_rules_paired", "test_model_curve_at_rules_overs",
                                          "test_uniform_curve_at_rules_overs", "test_prevented_vs_usual")}, indent=1))
    print(ct[ct.policy.isin(["model", "uniform"])][["policy", "param", "overs_kept_pct", "injuries_per_100"]].to_string())
    print(f"Done in {res['runtime_s']} s")


if __name__ == "__main__":
    main()
