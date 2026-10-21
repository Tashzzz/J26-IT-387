# Pilot event model – not validated

`event_xgb.json` (XGBoost, 4 classes: none / BFC / FFC / BR, 300 trees) and
`event_xgb.features.json` (the 118 input feature names, in order).

- Trained on 21 Oct 2026 on **all 11** hand-labelled pilot deliveries from **2 bowlers**
  (`train_evaluate.py --save-model`).
- **Not validated:** with 2 bowlers there is no fair leave-one-bowler-out test, so its accuracy
  on new bowlers is unknown. Use it only to demonstrate `predict.py`; do not report its
  predictions as results. Predictions on the training clips simply repeat the labels.
- Retrain when 15+ bowlers are labelled.

```bash
python predict.py --landmarks data/landmarks/<clip>.csv --arm L --fps 59.2 --model models/event_xgb.json
```
