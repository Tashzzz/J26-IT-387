# C3 – ML risk classifier and SHAP explainability

**Owner:** Rizma A.C.F. (IT23263444)
**Input contracts:** `contracts/c2_features.schema.json` (C2 rows) + the athlete profile and workload log kept by C4
**Output contract:** `contracts/c3_risk.schema.json` (sample: `contracts/samples/c3_sample.json`)
**API:** `backend/app/routers/risk.py` → `/risk/*`  ·  **App screen:** `app/app/risk/`

C3 turns "this bowler's angles, workload and history" into a calibrated risk score and an explanation
a coach can check: which factors pushed the risk up, by how much, and how sure we are of the inputs.

```
C2 rows (per delivery) ─┐
workload log (C4) ──────┼─► features ─► XGBoost (additive, monotone) ─► calibrated probability ─► risk score (0–1, C4 scale)
athlete profile (C4) ───┘                        │
                                                 └─► TreeSHAP ─► level 1: modality ─► level 2: factor ─► narrative + JSON for C4
```

> ⚠️ **Development model.** No real injury labels exist yet (risk register #4), so the model is trained on a
> **synthetic, literature-informed dataset** (`scripts/generate_synthetic.py`). Every output is labelled
> `synthetic_model: true`. Results show the pipeline works – not real-world accuracy.

## Key function 1 – Risk classifier

| | |
|---|---|
| Input | C2 feature rows for the session's analysed deliveries (shoulder counter-rotation, trunk side-bend, front-knee angles + `reliable` flags), C4 workload log (overs per session), C4 athlete profile (age, level, dated injury history) |
| Processing | 32 features: per-session mean / peak / change-per-ball / share past the published limit for each C2 angle; acute and chronic load, acute:chronic and EWMA ratios, week-to-week change, bowling days, rest days, matches; age, level, injuries in 6/12 months, estimated days since return. **XGBoost with depth-1 trees (additive) and monotone constraints** (clinically agreed direction for each factor), class-weighted, Platt-calibrated on held-out validation bowlers |
| Output | `probability_28d` (time-loss injury in the next 4 weeks), `risk_score` on the 0–1 scale C4 uses (alert probability → 0.30, 2× squad rate → 0.55, 4× → 0.75), `risk_level` low/medium/high, `risk_tier` |
| Metric | Bowler-grouped 5-fold CV AUC **0.77 ± 0.07**; held-out test (29 bowlers) AUC 0.89 [0.77–0.97], recall 0.89 at the recall-weighted alert threshold, precision 0.16 (`experiments/c3_xgb_fusion_metrics.md`). Response time ≈ 5 ms per assessment (NFR < 5 s) |
| Without it | C4 falls back to guideline rules; nobody combines technique, load and history into one number |

## Key function 2 – Explanation

| | |
|---|---|
| Input | Trained model + one session's features |
| Processing | Exact TreeSHAP → rescaled to risk-score points (factors add up to the score; within ±1 for C4) → **level 1** technique / workload / athlete history → **level 2** named factors (C2 and C4 names, so C4's rules recognise them) → one-sentence explanation + top-3 lines with squad-typical values and published limits; caveats for unreliable camera views and thin data |
| Output | Risk screen (gauge, narrative, modality bars, factor bars, all factors behind a disclosure, factor detail, history), JSON handed to C4 |
| Metric | Agreement of the top factors with physiotherapist reasoning (target ≥ 70 %, validation study after PP1). On synthetic data SHAP is checked against the known true drivers (research notebook §6) |
| Without it | A bare number – the proposal's explainability gap |

## Design choices worth defending

- **Uses only what the contracts deliver.** C2 sends one value per angle per delivery, not frame sequences, so the
  production model fuses those values. The **XGBoost–LSTM hybrid** (LSTM concept encoder → named features) is in the
  research notebook, where it reached CV AUC 0.74 and its concept head reproduced C2's angles with R² 0.99; the
  C2-feature version there scored 0.71, and the production model here reaches 0.77. The LSTM goes live when C2 also hands over angle series.
- **Additive + monotone = explanations that make sense.** Depth-1 trees mean each factor's contribution depends only on
  its own value; monotone constraints stop quirks like "fewer matches raised the risk". This *improved* CV AUC
  (0.737 unconstrained depth 2 → 0.753 monotone → 0.767 additive monotone).
- **Class weights, not SMOTE.** SMOTE was evaluated as the proposal planned: it lowered CV AUC and distorted the SHAP
  shares (athlete history 43 % vs a true 19 %), so class weighting is used.
- **One score scale for the whole team.** `risk_score` uses C4's tier cut-offs (`knowledge_base.json`); the honest
  probability is shown next to it (`probability_28d`, squad average, relative risk). A test fails if the cut-offs drift.
- **Reliability-aware.** C2 values marked `reliable: false` are used but flagged in the explanation ("check it on video");
  `drop_unreliable=true` leaves them out.
- **Robust to real-life inputs.** Trained with 1–12 deliveries per session, missing C2 angles and short workload logs,
  so it copes with one filmed ball or a new bowler; every gap is listed in `data_quality`.

## Run

```bash
cd components/c3_risk
python -m venv .venv
.venv\Scripts\activate                     # Windows
pip install -r requirements.txt
pip install -e .

# 1. synthetic development data (≈ 4 min) – or copy the data/ folder from cricshield_synthetic_v1.zip to data/c3_synthetic/data
python scripts/generate_synthetic.py --out ../../data/c3_synthetic/data
# 2. train (≈ 30 s) -> models/ (git-ignored) + experiments/c3_xgb_fusion_metrics.md
python -m c3_risk train --data ../../data/c3_synthetic/data
# 3. try it
python -m c3_risk predict                 # scores contracts/samples/c2_sample.json
python -m pytest                          # 74 tests (the training test runs when the synthetic data is present)
```

The API runs as part of the shared backend (`backend/README.md`): open http://localhost:8000/docs → **C3 risk**.
Without a trained model the C3 endpoints answer 503 with the command above; the rest of the backend keeps working.

| Endpoint | What |
|---|---|
| `GET /risk/ping` · `GET /risk/model` | health, model card (training data, thresholds, metrics) |
| `GET /risk/athletes` | bowlers from the shared registry + their latest C3 result |
| `POST /risk/athletes/{id}/assess` | score from profile + workload log + latest C2 rows, save, hand to C4 (`send_to_c4`) |
| `GET /risk/athletes/{id}/history` · `GET /risk/assessments/{aid}` | longitudinal history, one full assessment |
| `POST /risk/predict` | stateless: everything inline, nothing saved |

## Layout

```
src/c3_risk/
  spec.py        features, factor names (C2 / C4 vocabulary), monotone directions, labels, references
  features.py    contract-shaped inputs -> feature row (same code for training and serving)
  model.py       load / predict / TreeSHAP, risk-score scale, levels, tiers
  explain.py     two-level SHAP, narrative, contract JSON
  train.py       synthetic data -> contract shapes -> CV, fit, calibration, thresholds, model card
  store.py       SQLite history (data/c3_risk.db, git-ignored)
  service.py     assessment + read/write bridge to C4's athlete registry
  schemas.py     request validation (422 on garbage input)
scripts/generate_synthetic.py   synthetic development dataset
experiments/    backend model metrics + research notebook (XGBoost–LSTM hybrid, Colab)
models/         trained model files (created locally, never committed)
tests/          unit, known-answer, monotonicity, contract, API / integration, training
```
