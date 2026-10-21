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

---

# Release model used by the app – `src/c2_biomech/models/release_xgb.json`

The model above was trained on raw MediaPipe image coordinates, but the app receives C1's
**hip-centred, shoulder-width-scaled** keypoints, so it cannot be used there directly.
`event_model/train_release_c1format.py` converts the same 20 labelled deliveries into exactly the
C1 format, runs C2's quality gate and 8 Hz Butterworth filter, and trains a **release-only**
XGBoost model (binary: release / not release) on movement features around each frame (bowling
wrist and elbow height, wrist speed, shoulder tilt, both ankles relative to the hips, all divided
by trunk length; 9 time offsets from −100 to +100 ms).

In the app (`events.py`) the model is tried first; if its confidence is below 0.2 the rule
(first strong arm peak) is used. Manual and C1 frames still win. Switch off with
`C2_RELEASE_MODEL=off`. The app shows "AI model" on the release moment when it was used.

Leave-one-bowler-out, release only, same deliveries for both methods:

| Data | Method | Within ±1 frame | Within ±2 frames | Mean error |
|---|---|---|---|---|
| Consented participants (11 deliveries, B05 + B07) | Rule only | 64 % | 64 % | 101 ms |
| Consented participants | **Model + rule fallback (app)** | **82 %** | **91 %** | **15 ms** |
| All 20 deliveries, 11 bowlers | Rule only | 45 % | 45 % | 276 ms |
| All 20 deliveries, 11 bowlers | **Model + rule fallback (app)** | **50 %** | **55 %** | 239 ms |

Where it helps: the rule was 7–18 frames late on every B07 delivery (left-arm, 60 fps: the arm
keeps rising after release); the model was 0–3 frames off. On B05 the rule was already exact and
the model was not confident, so the rule was kept. It made two online clips slightly worse
(b9 6→7, b13 1→6 frames). Same limits as above: small set, only 2 consented bowlers labelled.
