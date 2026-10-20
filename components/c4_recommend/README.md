# C4 – Personalised prevention recommendations

**Owner:** Rathnayaka R. (IT23208162)
**Input contracts:** `contracts/c3_risk.schema.json` (risk + top SHAP factors) and `contracts/c2_features.schema.json` (threshold breaches)
**Output contract:** `contracts/c4_plan.schema.json` (sample: `contracts/samples/c4_sample.json`)
**API:** `backend/app/routers/recommend.py` → `/recommend/*`  ·  **App screens:** `app/app/plan/`

C4 turns "this bowler has a 68% risk" into "what this bowler should do this week, and why".

```
C3 risk + SHAP ─┐
C2 breaches ────┼─► fusion ─► risk tier ─► knowledge-base rules ─► SHAP-guided priority ─► explanations ─► referral check ─► plan
workload log ───┤                                   (23 rules, every rule cites a source)
profile ────────┘
```

## Key function 1 – Recommendation engine

| | |
|---|---|
| Input | C3 risk score + top SHAP factors, C2 threshold breaches, workload log, athlete profile |
| Processing | Fusion into one fact set → 4-tier risk (Low / Moderate / High / Critical, FR3) with safety floors → rules from an evidence-based knowledge base (`knowledge_base.json`) across 5 categories → priority boosted when C3's SHAP factors match a rule → plain-language explanation with citation → referral if critical risk, pain ≥ 7/10, recent injury + high risk, or ≥ 2 severe reliable breaches |
| Output | Prevention plan: daily over limit, spell cap, rest window, ordered actions with reasons, exercises, referral (`plan` list follows the c4 contract) |
| Metric | Rule coverage (320 combinations tested), referral boundary tests, latency (≈0.5 ms vs 3 s NFR), expert agreement (Cohen's κ, `experiments/evaluate.py`, needs physiotherapist labels) |
| Without it | Coach sees a risk number with no action; the decision falls back to experience, which is the problem stated in the proposal |

## Key function 2 – Athlete profile and dashboard

| | |
|---|---|
| Input | Athlete profile (anonymised code, birth year, arm, level, injury history), workload log (overs, spells, RPE, soreness), generated plan |
| Processing | ACWR, rest days, consecutive days, soreness from the log; plan history; coach / physio feedback with accept / modify / reject and a 1–5 usefulness score (FR11) |
| Output | Prevention-plan dashboard, "why this?" explanation screen, workload log, plan history, feedback form |
| Metric | Coach feedback score (usefulness 1–5), SUS ≥ 68 target |
| Without it | Workload and plan would live in notebooks; no record of what was advised or whether the coach agreed |

## Design choices worth defending

- **Rule-based, not a black box.** Every action links to a guideline (ECB directives, Hulin 2014, Dennis 2005, Elliott 2007, Orchard 2017…). Physiotherapists can change thresholds in `knowledge_base.json` without touching code.
- **SHAP is used, not just shown.** C3's top factors raise the priority of matching rules and are quoted in the explanation.
- **Reliability-aware.** A C2 breach marked `reliable: false` (from C1's reliability study) is shown with a caveat and never escalates risk on its own.
- **Safe when inputs are missing.** No C3 → guideline-based fallback tier. No C2 row → breaches taken from C3 factor values using C2's limits. No workload → workload rules skipped. Every gap is listed in `data_quality`.
- **Critical means stop.** At Critical tier, volume advice is suppressed (no "bowl 12 overs" next to "do not bowl") and technique work is deferred until clearance.
- **Status:** thresholds are DRAFT, anchored to published guidelines, pending the physiotherapist validation session (see `docs/decisions.md`).

## Research – two layers that use C3's trained model

| Layer | Question | Looks | Code | App |
|---|---|---|---|---|
| 1. Model check | How much would each action of the current plan lower this bowler's risk? | back (this week, counterfactual) | `whatif.py` | Plan tab *Model check* card → Model check screen |
| 2. Week planner | Which week of bowling next week keeps the most overs for the protection needed? | forward (next 7 days + return week) | `weekplan.py` | Plan tab *Next week* card → Week planner screen |

Both leave safety to the rules (referrals, Critical = no bowling, ECB limits). Layer 2 is evaluated against the
**true** injury mechanism of C3's synthetic cohort (`experiments/oracle.py`), so it is not graded by C3 itself.

### Layer 1 – model check: rank plan actions by predicted effect (`whatif.py`)

The rules decide **what is safe and evidence-based** to recommend. The what-if check asks
**C3's risk model how much each action would lower the risk for this bowler**, so the plan is
ranked by predicted effect instead of only by rule priority.

```
bowler's real inputs ──► C3 model ──► risk now (63)
      │
      ├─ copy + "side-bend 52° → 35°"        ──► C3 model ──► 47   effect −15
      ├─ copy + "SCR 41° → 28°"              ──► C3 model ──► 59   effect −4
      ├─ copy + "week's overs to ACWR 1.1"   ──► C3 model ──► 59   effect −3
      └─ greedy best combination             ──► C3 model ──► 40   (High → Moderate)
```

| | |
|---|---|
| Code | `src/c4_recommend/whatif.py` · API `POST /recommend/athletes/{id}/whatif` · app: Plan tab card + **Model check** screen |
| Changes only actionable inputs | overs (to the safe ACWR band / daily limit), rest days, technique angles (just inside the C2 limit). Age, level and injury history are never changed |
| Safety | the what-if only **ranks** actions; referrals and "no bowling" decisions from the rules always stay |
| Model-agnostic | C3 is passed in as a `scorer(athlete, workloads, c2_rows)` function – works with today's XGBoost and later with the XGBoost–LSTM hybrid |
| Honest limits | retrospective ("if this week had followed the action"); a statistical model shows association, not proven cause; effects < 2 points are flagged as too small; C3 is trained on synthetic data |
| Method background | counterfactual explanations – Wachter, Mittelstadt & Russell (2018); DiCE – Mothilal, Sharma & Tan (2020) |

#### Research questions (one-year scope)

| RQ | Question | How it is measured | Script |
|---|---|---|---|
| RQ1 | Do physiotherapists agree with C4's tier and referral decisions? | Cohen's κ on 12 labelled cases | `experiments/evaluate.py` |
| RQ-W1 | Does model-guided ranking change the plan order vs rule priority? | Kendall's τ per case | `experiments/whatif_study.py` |
| RQ-W2 | Is the model's behaviour clinically plausible (a fix never raises risk)? | share of plausible scenarios | `experiments/whatif_study.py` |
| RQ-P1 | Does the week planner prevent more (true) injuries than tier rules for the overs given up? | true 28-day risk from the generator hazard, held-out C3 test bowlers, bowler bootstrap | `experiments/weekplan_study.py`, `weekplan_frontier.py` |
| RQ-P2 | Does C3 order candidate weeks like the true mechanism? | pairwise ordering agreement, Spearman | `experiments/weekplan_study.py` |
| RQ-W3 | Do experts prefer the model-guided plan? | blinded A/B sheet (`whatif_ab_sheet.csv`, key kept separately) + usefulness 1–5 | `experiments/whatif_study.py` |
| RQ3 | Do plain-language explanations raise coach trust and usability? | SUS ≥ 68, Likert trust questions | app feedback + questionnaire |

First run (20 Oct 2026, synthetic C3 model, 12 cases): τ = 0.50 (the model re-orders half of the
multi-action plans), 11/11 scenarios plausible, technique fixes had the largest mean effect
(+4.1 points) while load reductions moved the synthetic model little (+1.8) – a finding to discuss
with C3 (literature says load spikes matter strongly, Hulin et al. 2014).

```bash
python experiments/whatif_study.py      # needs C3's model (components/c3_risk/README.md)
```

### Layer 2 – week planner: model-guided next-week plan (`weekplan.py`)

The Model check (layer 1) ranks the actions of the **current** plan, looking back at this week. The week
planner looks **forward** and asks: *can C3's trained model choose a bowler's next week of bowling better than
fixed tier rules?* Every possible week is **simulated**:

```
usual week (own pattern, last 4 weeks)
   └─► ECB hard limits (overs/day by age, ≤ 4 days in 7, ≤ 2 in a row, Critical / not returned = no bowling)
         └─► ~50 candidate weeks (subsets of usual days × 100…40 % volume, rest week, the rule plan's week)
               └─► each week + the usual week after it (look-ahead) → C3 feature code → C3 trained model, day by day
                     └─► predicted chance of injury over 14 days (risk accrues per ball bowled)
                           └─► choose: keep cutting overs only while each over buys ≥ 0.15 points of risk
                                 └─► week plan + rule plan + usual week side by side, with predicted risk + plain-language reason
```

Also a long-term **technique what-if**: predicted risk if each breached C2 angle came back to its limit.
Modes: `tradeoff` (default), `keep_bowling` (same risk as the rule plan, most overs), `lower_risk`
(same overs as the rule plan, lowest risk), `state` (ablation: peak daily score, no exposure / look-ahead).

**How it is evaluated without risking real bowlers.** C3's synthetic cohort was generated from a known
injury mechanism (`c3_risk/scripts/generate_synthetic.py`). `experiments/oracle.py` re-computes that **true**
daily injury hazard for any planned week (reproduces the generator's recorded hazard terms, mean error
0.00007), so every plan is judged by the ground truth, **not by C3 itself**. The exchange rate is chosen on
C3's validation bowlers and tested once on the 29 held-out test bowlers (366 sessions).

| Held-out test bowlers (28-day true risk) | Injuries / 100 screened bowlers | Squad overs kept |
|---|---|---|
| Usual week (no CricShield) | 6.35 | 100 % |
| ECB hard limits only | 5.89 | 90 % |
| C4 rule engine | 5.77 | 87 % |
| **C4 week planner (default)** | **5.56** | 82 % |
| Rest every flagged bowler | 5.37 | 62 % |
| C4 week planner, best point of the curve | **5.32** | 59 % |

* Week planner vs rules (paired, bowler bootstrap): **−0.22 injuries / 100 [−0.57, −0.01]** for **−4.9 points of
  overs [−9.4, −1.5]** → 37 % more injuries prevented than the rules (0.80 vs 0.58 per 100).
* At exactly the rules' volume the three curves meet (5.77 rules, 5.77 planner, 5.77 uniform cut) – the gain
  comes from **where** extra cuts go: the planner's curve stays below "same % cut for everyone" and reaches a lower
  minimum than any rest policy, because it avoids the load spike when rested bowlers return.
* C3 orders pairs of plans the same way as the true mechanism in **73 %** of 1,684 pairs (Spearman 0.54) – useful
  but imperfect, which is why the hard limits stay outside the model's control.
* ≈ 85 ms per bowler (NFR < 3 s). Figure: `experiments/weekplan_frontier_test.png`; details:
  `experiments/weekplan_results_test.md`.
* **Limit:** synthetic cohort and a C3 model trained on the same generator – shows the method works when the
  mechanism is known, not real-world effect sizes. Next: real logs + physiotherapist-labelled plans.

```bash
python ../c3_risk/scripts/generate_synthetic.py --out ../../data/c3_synthetic/data   # once (~4 min, seed 2026)
python experiments/weekplan_study.py    # per-session comparison, counterfactual validity, examples (~2 min)
python experiments/weekplan_frontier.py # squad-level curve, exchange rate chosen on validation (~1.5 min)
```
API: `POST /recommend/athletes/{id}/week-plan?mode=tradeoff` (stateless: `POST /recommend/week-plan`).
App: Plan tab **Next week** card → **Week planner** screen (also Plan → More).

## Run

```bash
cd components/c4_recommend
python -m venv .venv
.venv\Scripts\activate              # Windows
pip install -r requirements.txt
pip install -e .

python -m pytest                    # 405 tests: unit, rule coverage, contracts, API, bad input, model check, week planner
python -m c4_recommend --c3 ../../contracts/samples/c3_sample.json --c2 ../../contracts/samples/c2_sample.json
python experiments/evaluate.py      # expert-agreement sheet + latency
```

The API runs as part of the shared backend (`backend/README.md`); open http://localhost:8000/docs → **C4 recommend**.
Demo data: 3 synthetic bowlers `DEMO01–03` (High / Low / Critical), reset with `POST /recommend/demo/reset`.
Local data is stored in `data/c4_recommend.db` (git-ignored).

## Layout

```
src/c4_recommend/
  models.py            contracts + validation (rejects garbage input)
  fusion.py            C3 + C2 + workload + profile -> facts
  engine.py            tiers, limits, rule evaluation, referral, plan
  explain.py           plain-language explanations
  whatif.py            research layer 1: model check (rank plan actions with C3)
  weekplan.py          research layer 2: week planner (simulate next week's options with C3)
  knowledge_base.json  rules, limits, exercises, sources
  store.py             SQLite store (athletes, workloads, plans, feedback)
  seed.py              synthetic demo bowlers
  sample_data/         demo inputs in C3/C2 contract format
experiments/evaluate.py  expert-agreement (Cohen's kappa) + latency
experiments/whatif_study.py              layer 1 study (Kendall's tau, plausibility, blinded A/B sheet)
experiments/oracle.py                    true injury hazard of the synthetic cohort (judges plans without C3)
experiments/weekplan_study.py, weekplan_frontier.py   layer 2 study (results *.md / *.json / *.png)
tests/
```
