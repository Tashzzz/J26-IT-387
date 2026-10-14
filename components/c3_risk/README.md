# C3 – ML risk classifier and SHAP explainability

**Owner:** Rizma A.C.F. (IT23263444)
**Input contract:** `contracts/c2_features.schema.json` (use `contracts/samples/c2_sample.json` until C2 delivers)
**Output contract:** `contracts/c3_risk.schema.json`

## Key function 1 – Risk classifier

| | |
|---|---|
| Input | C2 features + workload + athlete metadata |
| Processing | Fuse features → XGBoost baseline (LSTM after PP1) |
| Output | Risk score and level per bowler session |
| Metric | Precision, recall, AUC-ROC (recall-weighted threshold) |
| Without it | |

## Key function 2 – Explanation

| | |
|---|---|
| Input | Trained model + one session's features |
| Processing | SHAP → top factors → one plain-language sentence |
| Output | Explainability screen |
| Metric | Agreement of top factors with physiotherapist reasoning |
| Without it | |

Note for PP1: labels are provisional (self-reported injury history or C2 threshold breaches) – state this on the slide.

## Layout

```
src/c3_risk/   source code
experiments/   results (no personal data)
tests/
```
