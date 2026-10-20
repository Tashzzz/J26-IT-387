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

## Run

```bash
cd components/c4_recommend
python -m venv .venv
.venv\Scripts\activate              # Windows
pip install -r requirements.txt
pip install -e .

python -m pytest                    # 373 tests: unit, rule coverage, contracts, API, bad input
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
  knowledge_base.json  rules, limits, exercises, sources
  store.py             SQLite store (athletes, workloads, plans, feedback)
  seed.py              synthetic demo bowlers
  sample_data/         demo inputs in C3/C2 contract format
experiments/evaluate.py  expert-agreement (Cohen's kappa) + latency
tests/
```
