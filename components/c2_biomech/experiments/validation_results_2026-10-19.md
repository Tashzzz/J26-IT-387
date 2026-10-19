# Angle validation – 19 Oct 2026

C2 angles compared with angles measured on the video frames (`kinovea_validation.csv`,
`python experiments/compute_rmse.py`).

**How the manual values were made:** hip, knee and ankle points read off gridded video
frames by an AI assistant (not in Kinovea, not by a human). Expect about ±5–10° error.
The C2 owner re-measures at least 3 frames in Kinovea to confirm (see the AI-use log).

| Feature | n | Bias (C2 − manual) | MAE | RMSE | Max |
|---|---|---|---|---|---|
| Front knee flexion at FFC | 8 | +0.7° | 8.0° | 11.4° | 26.2° |
| Front knee flexion at release | 8 | +17.7° | 17.7° | 18.5° | 27.0° |
| Trunk side-bend at release (rear view) | 1 | +10.4° | 10.4° | 10.4° | 10.4° |
| **All** | 17 | +9.3° | 12.7° | **15.1°** | 27.0° |

Target RMSE < 5° is **not met**.

What it means
- At release C2 always reads the front knee as more bent than the video shows (all 8 clips).
  This matches C1's ICC result: knee and ankle keypoints are unreliable in side-on clips.
- The knee features stay `reliable: false`; C3 should not use them for risk yet.
- Next: re-measure in Kinovea; test 60 fps clips; ask C1 whether knee tracking can improve
  (model complexity 2, or a cropped/higher-resolution input).
