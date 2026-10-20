# C3 backend model – xgboost_fusion_v0.2.0_synthetic

Trained 2026-10-19 on **synthetic** data (2544 sessions, 197 bowlers, 8.0% positive). Features are computed from contract-shaped inputs (C2 rows, C4 profile and workload log).

| Metric | Value |
|---|---|
| 5-fold grouped CV AUC (train+val) | 0.765 ± 0.071 |
| Test AUC (95% CI, bowler bootstrap) | 0.884 [0.75–0.96] |
| Test recall at alert threshold | 0.89 [0.69–1.00] |
| Test precision at alert threshold | 0.16 [0.06–0.30] |
| Test F1 | 0.27 |
| Share of test sessions flagged | 41% |
| Alert / high / critical probability | 0.055 / 0.162 / 0.323 |
| SHAP share technique / workload / history | 41% / 14% / 45% |

Test set: 366 sessions from 29 held-out bowlers (27 positive) – small, so read the CIs.
Synthetic data: these numbers show the pipeline works; they are not evidence about real bowlers.
