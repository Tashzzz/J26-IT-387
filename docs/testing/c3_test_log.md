# C3 test log – ML risk classifier and SHAP explainability

Owner: Rizma A.C.F. (IT23263444) · Last run: 19 Oct 2026 · Model: `xgboost_fusion_v0.2.0_synthetic` (synthetic training data)

## Automated (components/c3_risk, `python -m pytest`) – 74 passed

| Level (Lecture 9) | What | Tests |
|---|---|---|
| Unit – known answers | Session mean / peak / change-per-ball / share past the limit; deliveries ordered by clip number; slope needs ≥ 3 deliveries; breach from the published limit when C2 sends no flag; acute / chronic load, ACWR, rest and consecutive days, matches; age, level, injuries in 6/12 months, estimated days since return, not-returned flag | `test_features.py` (15) |
| Missing / poor data | No C2 rows, 1–2 deliveries, unreliable camera views (used + flagged, or dropped), < 7 days of workload log, no workload, no injuries → notes in `data_quality`, never a crash | `test_features.py`, `test_model_explain.py` |
| Model | TreeSHAP adds up exactly to the prediction; score-unit SHAP adds up to `risk_score − base_score` and stays within ±1; **every monotone direction holds** (26 parametrised checks); risk-score map anchored at 0.30 / 0.55 / 0.75 and monotone; level / tier cut-offs | `test_model_explain.py` (39) |
| Integration – contracts | Output validates against `contracts/c3_risk.schema.json` and C4's own `C3Risk` model; C3 cut-offs equal C4's `knowledge_base.json`; team sample and C4's three demo inputs still validate (backward compatible) | `test_model_explain.py`, `test_contracts.py` (5) |
| API / system | `/risk` ping, model card, athletes from the shared registry, assess → saved → handed to C4 → C4 plan uses `risk_source: c3`, history, stateless predict with the team samples | `test_api.py` (14) |
| Garbage input | Real name as bowler code, age 90, 500 overs, unknown session type, future date, angle "big", C2 row for another bowler → 422 with the field named; unknown athlete / assessment → 404; model not trained → 503 with the fix | `test_api.py` |
| Performance (NFR < 5 s) | Assess round trip through the API < 5 s (measured ≈ 9 ms; scoring + SHAP + narrative ≈ 1–6 ms) | `test_api.py` |
| Training | Full training on the synthetic dataset: CV AUC and test AUC > 0.65, thresholds ordered | `test_train.py` (1, runs when the dataset is present) |

Other components after the change: C4 `python -m pytest` → **373 passed**, C2 → **50 passed**.

## Model results (synthetic data, `experiments/c3_xgb_fusion_metrics.md`)

| Metric | Value |
|---|---|
| Bowler-grouped 5-fold CV AUC | 0.767 ± 0.070 |
| Held-out test AUC (29 bowlers, 95 % bootstrap CI) | 0.892 [0.77–0.97] |
| Recall / precision at the alert threshold | 0.89 / 0.16 (40 % of sessions flagged) |
| Model choice evidence | depth-2 unconstrained 0.737 → monotone 0.753 → additive monotone 0.767 (CV AUC) |

## Manual UI test (web build, 400 × 860 phone viewport, backend on localhost)

| Step | Expected | Result |
|---|---|---|
| Open Risk tab | Bowler chips from the shared registry; "Assess injury risk" | Pass |
| Assess DEMO03 (lumbar injury, side-bend 52°) | HIGH, narrative names the injury and side-bend, caveat for the unreliable counter-rotation view, synthetic banner | Pass (score 62, ≈22 % 4-week probability, 2.7× squad average) |
| Assess DEMO02 (steady senior) | LOW, "no recent injuries and trunk side-bend stayed within the 40° limit" | Pass |
| "Show all 16 factors" | All factors, unmeasured ones at the bottom marked "not measured" | Pass |
| Tap a factor | Detail: value, points, squad typical, reference, deliveries used, model inputs | Pass |
| Assess twice | Risk history strip and list appear; chip dot coloured by last level | Pass |
| Open prevention plan → Generate | C4 plan shows "predicted injury risk (C3)" with C3's score and top factors | Pass |
| Backend stopped / model missing | "Backend not reachable" with retry / "C3 model not ready" with the train command | Pass (503 path covered by `test_api.py`) |

## Still to do

- Physiotherapist review of the monotone directions and narrative wording; SHAP-agreement study (target ≥ 70 %).
- Retrain on real, prospectively collected time-loss labels once available (ethics clearance).
- Live LSTM branch when C2 hands over per-frame angle series.
