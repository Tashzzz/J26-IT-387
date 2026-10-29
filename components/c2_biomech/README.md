# C2 – Biomechanical feature engineering

**Owner:** Samarasinghe S.A.T.M. (IT23217140)
**Input contract:** `contracts/c1_keypoints.schema.json` (C1's CSVs are also accepted)
**Output contract:** `contracts/c2_features.schema.json`

C1 passes C2 hip-centred, shoulder-width-scaled MediaPipe keypoints, **unfiltered**.
C2 cleans up the data, finds the delivery and its key events, calculates joint angles
that make sense for the camera view, and compares them with published injury-risk limits.

```
C1 JSON → quality gate → Butterworth 8 Hz → release / BFC / FFC → 2-D or 3-D angles → limits → C2 JSON for C3
```

## Key function 1 – Signal processing, delivery events and features

| | |
|---|---|
| Input | C1 keypoints for one clip (may include run-up and empty frames) |
| Processing | Quality gate (drop impossible skeletons) → mask low visibility, fill gaps ≤ 5 frames → 4th-order zero-lag Butterworth, 8 Hz, per continuous run → release = highest arm (scale-free) → BFC/FFC → angles by vector maths |
| Output | Feature row (JSON for C3) + angle time series (CSV) + figure (PNG) |
| Metric | Known-answer tests; jitter reduction; residual analysis; agreement with manual annotation (Kinovea, RMSE target < 5°) |
| Without it | C3 has no biomechanical input; the risk score can't point to a technique fault |

## Key function 2 – Clinical threshold mapping

| | |
|---|---|
| Input | Feature row |
| Processing | Compare each feature with its published limit (`thresholds.py`) → breach + red/amber/green; combine with C1's reliability gate and the camera-view suitability |
| Output | Per-joint breach indicators for C3 and the feature detail screen |
| Metric | Threshold tests; physiotherapist review of flagged deliveries |
| Without it | Angles are numbers with no clinical meaning for coaches |

## Features and camera views

| Feature | Event | Limit | Front / rear view | Side view | Semi-side |
|---|---|---|---|---|---|
| `trunk_lateral_flexion_deg` | release | > 40° (Bayne 2016: injured 50°, uninjured 40°) | **2-D, good** | 3-D, poor | 3-D, poor |
| `front_knee_flexion_release_deg` | release | knee > 150° **with** twist > 30° or lean > 40° = red; alone = amber (Portus; physio review) | 3-D, poor | **2-D, good**¹ | 3-D, poor |
| `front_knee_flexion_ffc_deg` | FFC | reported | 3-D, poor | **2-D, good**¹ | 3-D, poor |
| `shoulder_counter_rotation_deg` | BFC → FFC | > 30° (Portus mixed action: injured 41°, uninjured 19°) | 3-D, poor | 3-D, poor | 3-D, poor |
| `hip_shoulder_separation_bfc_deg` | BFC | > 30° (Portus mixed-action criterion) | 3-D, poor | 3-D, poor | 3-D, poor |
| `rear_knee_flexion_bfc_deg` | BFC | reported (Alway 2021: differs injured vs uninjured, no cut-off) | 3-D, poor | **2-D, good**¹ | 3-D, poor |
| `rear_hip_flexion_bfc_deg` | BFC | reported (Alway 2021: strongest technique predictor, no cut-off) | 3-D, poor | **2-D, good** | 3-D, poor |
| `front_hip_flexion_ffc_deg` | FFC | reported (Alway 2021; Bayne 2016, no cut-off) | 3-D, poor | **2-D, good** | 3-D, poor |

The camera measures angles in the image plane well. Anything in the depth direction
depends on MediaPipe's z coordinate, which is its noisiest axis. "Poor" features are
still returned, but marked `reliable: false`. The table was set from the first real
clips (see `docs/decisions.md`).

The angles are defined as follows (updated 21 Oct 2026 after the Kinovea pilot; see
`docs/decisions.md`):
- Knee flexion = 180° − hip-knee-ankle angle (0° = straight).
- Hip flexion = angle between the trunk line (mid-hip → mid-shoulder) and the thigh (hip → knee), 0° = thigh in line with the trunk.
- Trunk side-bend = angle of the trunk out of the vertical plane, measured towards the side (asin form, not a projection, so forward lean does not inflate it).
- Shoulder counter-rotation = largest rotation of the shoulder line **away from** the target between BFC and FFC; rotation towards the target is ignored.
- FFC (when C1 sends no image position) = 0.067 s after the front foot's furthest reach, never after release.

¹ Geometry is good side-on, but C1's ICC study found knee/ankle tracking unreliable in side-on
clips (ICC < 0.75), so these are also marked `reliable: false` (`c1_reliability.py`) until C1's
reliability says otherwise. Two separate gates: can this camera see the angle (view), and does
C1 track those joints reliably (ICC).

**Events.** Release is detected by a trained XGBoost model first (`event_ml.py`, see
`event_model/models/README.md`). On consented clips, it is within one frame 82% of the
time, compared with 64% for the rule alone. When the model is not confident, C2 falls
back to the rule. The rule calculates arm elevation from the bowling wrist position
relative to the shoulder and divides it by trunk length, so the result does not change
as the bowler moves closer to the camera. Release is the **first** arm peak that reaches
60% of the highest peak, since bowlers often lift the arm again during the follow-through.
The event checks show a mean release error of 0.08 frames.

BFC and FFC are detected automatically as well. When C1 provides the hip centre's image
position (`origin_px`, `normalisation.scale_px`), C2 uses it to help locate foot landing.
With older C1 files, the events are **estimated**: timing narrows the search window, and
foot movement relative to the hips identifies the frame (front foot furthest forward =
FFC, back foot lowest = BFC). The validation script reports mean errors of 1.4 frames
for FFC and 1.3 frames for BFC (`python experiments/validate_events.py ../../data/handoff`).
Estimated events are labelled `estimated` and can be corrected by hand (`--events`,
`--bfc/--ffc`, or the app's "Correct event frames"). Priority: manual > C1 window > image
position > estimated.

## Run

From this folder, with the virtual environment active:

```bash
pip install -e ".[test]"                         # once
python -m c2_biomech ../../data/handoff           # every C1 JSON in the folder -> experiments/
python -m c2_biomech ../../data/handoff --events events.csv   # manual BFC/FFC per clip
python -m c2_biomech <clip>.json --bfc 98 --ffc 108           # manual events, one clip
python -m c2_biomech <clip>.json --cutoff auto    # residual-analysis cutoff instead of 8 Hz
python -m c2_biomech --synthetic                  # known-answer demo delivery
python -m pytest                                  # 82 tests
```

`events.csv`: `video_id,bfc_frame,ffc_frame,release_frame` — frame = index in the C1 file's
`frames` list; leave a cell empty for automatic.

API (shared backend): `GET /features/thresholds`, `POST /features/compute` (body = C1 JSON),
`GET /features/demo` (synthetic, labelled as such).

## Layout

```
src/c2_biomech/
  loader.py      C1 JSON / CSV -> Delivery (validates input)
  quality.py     drop impossible detections (upside-down, tiny, ankles above hips)
  filtering.py   gap fill + Butterworth (zero lag) + Winter residual analysis
  events.py      release (arm elevation), BFC/FFC (needs image position) + overrides
  event_ml.py    trained XGBoost release model (models/release_xgb.json), rule fallback
  angles.py      angle maths, 2-D and 3-D, per frame
  features.py    view-dependent feature values + reliability -> C2 contract row
  thresholds.py  published limits, red/amber/green
  plot.py        filter evidence, events, angles and limits
  synthetic.py   synthetic delivery with known angles (tests only)
  __main__.py    command line
experiments/      results (JSON/CSV/PNG, no video)
tests/            unit, known-answer, failure-path, real-clip-shape and API tests
```

## Known limitations

- 30 fps: one frame = 33 ms; a 1-frame release error moves trunk side-bend by 6–8°. Record at ≥ 60 fps.
- Release is approximated by the highest wrist (slightly before the real release).
- Clips below 50 fps get a warning; the knee at FFC changes 10–20° per frame at 30 fps.
- Kinovea pilot (2 bowlers, 8 angles, 21 Oct 2026): C2 read the joints straighter than Kinovea in all 8 cases (bias +7.7°, RMSE 9.0°, 3 of 8 within 5°). The main cause was MediaPipe placing the hip 40–75 px away from the hip joint. The target of < 5° was not met, so leg angles stay `reliable: false` until a correction is trained on more data.
- Shoulder counter-rotation needs depth: not reliable from a single camera.
- Limits come from studies on elite adult bowlers; thresholds are configurable for physiotherapist review.
