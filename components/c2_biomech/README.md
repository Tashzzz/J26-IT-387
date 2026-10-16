# C2 – Biomechanical feature engineering

**Owner:** Samarasinghe S.A.T.M. (IT23217140)
**Input contract:** `contracts/c1_keypoints.schema.json` (C1's stabilised CSV is also accepted)
**Output contract:** `contracts/c2_features.schema.json`

C1 delivers gap-filled, Butterworth-filtered (4th-order zero-lag, 8 Hz), hip-centred keypoints.
C2 turns them into clinically meaningful joint angles at the right moments of the delivery
and maps them to published injury-risk limits.

## Key function 1 – Delivery events and features

| | |
|---|---|
| Input | C1 normalised keypoints for one delivery |
| Processing | Detect back-foot contact (BFC), front-foot contact (FFC) and release → per-frame angles with vector maths (dot product / `arccos`, `atan2`) → feature values at the events |
| Output | Feature row per delivery (JSON for C3) + angle time series (CSV, plot) |
| Metric | Known-answer tests (synthetic deliveries); agreement with manual annotation in Kinovea (RMSE, target < 5°) |
| Without it | C3 has no biomechanical input; the risk score can't point to a technique fault |

## Key function 2 – Threshold mapping

| | |
|---|---|
| Input | Feature row |
| Processing | Compare each feature with its published limit (`thresholds.py`) → breach + red/amber/green level; combine with C1's per-keypoint reliability gate |
| Output | Per-joint breach indicators for C3 and the feature detail screen |
| Metric | Threshold tests; physiotherapist review of flagged deliveries |
| Without it | Angles are numbers with no clinical meaning for coaches |

## Features

| Feature | Event | Definition | Limit (default) |
|---|---|---|---|
| `shoulder_counter_rotation_deg` | BFC → FFC | Largest twist of the shoulder line (transverse plane) away from its BFC alignment | > 30° (Portus et al. 2004) |
| `front_knee_flexion_ffc_deg` | FFC | 180° − hip-knee-ankle angle (0° = straight) | reported only |
| `front_knee_flexion_release_deg` | Release | same | < 30° = knee angle > 150° (proposal) |
| `trunk_lateral_flexion_deg` | Release | Trunk (mid-hip → mid-shoulder) angle from vertical in the pelvis frontal plane | > 40° — **to confirm** |
| `hip_shoulder_separation_bfc_deg` | BFC | Angle between hip line and shoulder line | reported only (action type) |

Event detection: release = bowling wrist highest; a foot contact = the frame where that ankle's
downward speed drops below 10% of its peak. Frames given by C1 (`window`) or typed in manually
(`--bfc/--ffc/--release`) take priority over automatic detection.

## Run

From this folder, with the virtual environment active:

```bash
pip install -e ".[test]"          # once
python -m c2_biomech --synthetic   # known-answer demo delivery -> experiments/
python -m c2_biomech ../../data/processed/B01_D01_side_10m_stable.csv --arm right
python -m c2_biomech ../../data/processed --arm right      # whole folder + summary CSV
python -m c2_biomech <file> --bfc 112 --ffc 121 --release 131   # manual events
python -m pytest                   # 40 tests incl. missing / garbage input
```

Real clips, end to end (C1 scripts, then C2):

```bash
cd ../c1_pose
python src/c1_pose/extract.py ../../data/raw/B01_D01_side_10m.MOV
python src/c1_pose/stabilise.py ../../data/processed/B01_D01_side_10m_keypoints.csv
cd ../c2_biomech
python -m c2_biomech ../../data/processed/B01_D01_side_10m_stable.csv --arm right
```

API (shared backend): `GET /features/thresholds`, `POST /features/compute` (body = C1 JSON),
`GET /features/demo` (synthetic, labelled as such).

## Layout

```
src/c2_biomech/
  loader.py      C1 JSON / stabilised CSV -> Delivery (validates input)
  events.py      BFC, FFC, release detection (+ C1 window / manual override)
  angles.py      angle maths, per frame
  features.py    feature values at events + reliability -> C2 contract row
  thresholds.py  published limits, red/amber/green
  plot.py        angle-time figure with events and limits
  synthetic.py   synthetic delivery with known angles (tests only)
  __main__.py    command line
experiments/      results (JSON/CSV/PNG, no video)
tests/            unit, pipeline, failure-path and API tests
```

## Known limitations

- Single camera: transverse-plane angles (shoulder alignment, SCR) depend on MediaPipe's depth
  estimate, which is weaker than x/y. Report the camera angle with every result.
- Release is approximated by the highest wrist position (a few frames early).
- Limits come from studies on elite adult bowlers; Sri Lankan school bowlers may differ —
  thresholds are configurable for physiotherapist review.
