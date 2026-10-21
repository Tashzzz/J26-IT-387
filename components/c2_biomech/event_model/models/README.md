# Event model – trained 21 Oct 2026

`event_xgb.json` (XGBoost, 4 classes: none / BFC / FFC / BR, 300 trees, depth 4) and
`event_xgb.features.json` (the 118 input feature names, in order).

## Training data

- **20 hand-labelled deliveries from 11 bowlers** (`train_evaluate.py --save-model`, fitted on all 20).
  - 11 deliveries from 2 consented CricShield participants (B05, B07), real speed, side-on, 30/60 fps.
  - 9 deliveries from 9 bowlers in public online clips (B08–B16); 4 of them are slow motion
    (b10, b11, b13, b14) and several are front/rear views.
- Labels and videos are not in the repo (participant privacy); bowler IDs are anonymous.

## Results – leave-one-bowler-out (each bowler tested on a model that never saw them)

All 20 deliveries, 11 bowlers:

| Method | Event | Median error (frames) | Mean error (ms) | Within ±1 frame | Within ±2 frames |
|---|---|---|---|---|---|
| Rule baseline | BFC | 3.5 | 549 | 20 % | 30 % |
| Rule baseline | FFC | 3.0 | 460 | 35 % | 45 % |
| Rule baseline | BR | 1.0 | 314 | 55 % | 55 % |
| XGBoost | BFC | 8.5 | 571 | 15 % | 20 % |
| XGBoost | FFC | 5.0 | 334 | 0 % | 20 % |
| **XGBoost** | **BR** | **1.0** | **82** | **60 %** | **60 %** |

Own participants only (11 real-speed deliveries, B05 + B07):

| Method | Event | Mean error (ms) | Within ±1 frame |
|---|---|---|---|
| Rule baseline | BFC / FFC / BR | 114 / 91 / 83 | 36 % / 55 % / 73 % |
| XGBoost | BFC / FFC / BR | 502 / 304 / **18** | 27 % / 0 % / **91 %** |

## What it means

- **Release:** XGBoost beats the rule baseline (91 % vs 73 % within one frame on real-speed clips).
- **Foot contacts:** the rule baseline is still better; 20 deliveries are not enough to learn foot landing.
- Suggested use: XGBoost for release, rules for BFC/FFC (hybrid) until more bowlers are labelled.
- Limits: small set, only 2 consented bowlers labelled so far, online clips include slow motion and
  non-side views. Retrain when 15+ consented bowlers are labelled on the 60 fps side-on protocol.

```bash
python predict.py --landmarks data/landmarks/<clip>.csv --arm L --fps 59.2 --model models/event_xgb.json
```
