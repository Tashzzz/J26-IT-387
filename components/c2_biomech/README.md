# C2 – Biomechanical feature engineering

**Owner:** Samarasinghe S.A.T.M. (IT23217140)
**Input contract:** `contracts/c1_keypoints.schema.json` (C1's CSVs are also accepted)
**Output contract:** `contracts/c2_features.schema.json`

C1 hands over hip-centred, shoulder-width-scaled MediaPipe keypoints, **unfiltered**.
C2 cleans them, finds the delivery and its events, computes joint angles that suit the
camera view, and maps them to published injury-risk limits.

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
| `trunk_lateral_flexion_deg` | release | > 40° (to confirm) | **2-D, good** | 3-D, poor | 3-D, poor |
| `front_knee_flexion_release_deg` | release | < 30° (knee > 150°) | 3-D, poor | **2-D, good**¹ | 3-D, poor |
| `front_knee_flexion_ffc_deg` | FFC | reported | 3-D, poor | **2-D, good**¹ | 3-D, poor |
| `shoulder_counter_rotation_deg` | BFC → FFC | > 30° | 3-D, poor | 3-D, poor | 3-D, poor |
| `hip_shoulder_separation_bfc_deg` | BFC | reported | 3-D, poor | 3-D, poor | 3-D, poor |

One camera measures angles in the image plane well; anything in the depth direction
relies on MediaPipe's z, its noisiest axis. "Poor" features are still output but marked
`reliable: false`. The table was set from the first real clips (see `docs/decisions.md`).

¹ Geometry is good side-on, but C1's ICC study found knee/ankle tracking unreliable in side-on
clips (ICC < 0.75), so these are also marked `reliable: false` (`c1_reliability.py`) until C1's
reliability says otherwise. Two separate gates: can this camera see the angle (view), and does
C1 track those joints reliably (ICC).

**Events.** Release is automatic: arm elevation = bowling wrist above the shoulder, divided by
trunk length (so it doesn't change as the bowler gets closer to the camera); release is the
**first** arm peak reaching 60 % of the highest one, because bowlers often lift the arm again after
the follow-through. Checked against release frames marked by hand on 13 clips: within 1 frame
(mean error 0.08 frames). BFC and FFC need the hip centre's position in the image (`origin_px` per
frame and `normalisation.scale_px` from C1); until then they are entered by hand (`--events`, see
`experiments/events_manual_2026-10-19.csv` for the 13 current clips).
Priority: manual > C1 window > automatic.

## Run

From this folder, with the virtual environment active:

```bash
pip install -e ".[test]"                         # once
python -m c2_biomech ../../data/handoff           # every C1 JSON in the folder -> experiments/
python -m c2_biomech ../../data/handoff --events events.csv   # manual BFC/FFC per clip
python -m c2_biomech <clip>.json --bfc 98 --ffc 108           # manual events, one clip
python -m c2_biomech <clip>.json --cutoff auto    # residual-analysis cutoff instead of 8 Hz
python -m c2_biomech --synthetic                  # known-answer demo delivery
python -m pytest                                  # 49 tests
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
- Shoulder counter-rotation needs depth: not reliable from a single camera.
- Limits come from studies on elite adult bowlers; thresholds are configurable for physiotherapist review.
