# What-if study - results

Model: `xgboost_fusion_v0.2.0_synthetic` · run 2026-10-20 · 12 cases · 11 action scenarios

| Question | Result |
|---|---|
| RQ-W1 rule order vs model order (mean Kendall's tau, 4 cases) | 0.50 |
| RQ-W2 plausible scenarios (fix never raises risk) | 11/11 (100%) |
| Actions with a meaningful effect (>= 2 points) | 4/11 |
| RQ-W3 blinded A/B sheet | `whatif_ab_sheet.csv`, 4 cases - to be filled by physiotherapists |

Mean predicted effect by action type (points on 0-100):

- recovery: +1.2 (n=1)
- technique: +4.1 (n=5)
- workload: +1.8 (n=5)

Interpretation notes: tau near 1 = the model agrees with the rule priority; lower = the model re-orders the plan (the what-if adds information). The C3 model is trained on synthetic data, so effects show how the method works, not validated clinical effects.
