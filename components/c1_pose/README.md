# C1 – Pose estimation and reliability-guided keypoint selection

**Owner:** Gunarathne R.M.N.N. (IT22248312)
**Novelty:** reliability-guided keypoint selection – keypoints are trusted based on a measured
test–retest ICC across recording conditions, not on the model's own confidence score.

## Key function 1 – Keypoint extraction pipeline

| | |
|---|---|
| Input | Bowling video (upload or record in the app), trimmed to back-foot contact → ball release |
| Processing | MediaPipe PoseLandmarker → 33 keypoints per frame → gap fill + Butterworth 4th-order filter → root-relative normalisation (hip centre, shoulder width) |
| Output | Skeleton-overlay video + normalised keypoints JSON (`contracts/c1_keypoints.schema.json`) |
| Metric | Detection rate, tracking continuity raw vs stabilised, processing time per delivery, lite vs full vs heavy |
| Without it | No skeleton, no angles: C2–C4 have no input |

## Key function 2 – Reliability-guided keypoint selection

| | |
|---|---|
| Input | Normalised keypoints from repeated deliveries, tagged by recording condition |
| Processing | ICC(2,1) two-way absolute agreement per keypoint, per axis, per condition → gate at ICC ≥ 0.75 → flag or exclude |
| Output | Reliability dashboard grouped by body region + filtered keypoints in Firebase for C2 |
| Metric | Pilot ICC per region, bands poor < 0.50 ≤ moderate < 0.75 ≤ good < 0.90 ≤ excellent |
| Without it | Unreliable keypoints reach the risk model unchecked |

## Layout

```
src/c1_pose/
  keypoints.py     33 keypoint names, body regions, skeleton connections
  extract.py       video -> keypoints CSV + summary JSON
  overlay.py       keypoints CSV -> skeleton overlay video
  stabilise.py     (to do) gap fill + Butterworth filter
  normalise.py     (to do) hip-centre origin, shoulder-width scale
  reliability.py   (to do) ICC per keypoint/axis/condition, 0.75 gate
scripts/
  download_models.py   downloads the lite/full/heavy .task files into models/
experiments/       model comparison and pilot ICC results (CSV / plots only, no video)
tests/             unit tests and failure-path tests
```

## Run

From this folder, with the virtual environment active:

```bash
pip install -r requirements.txt
python scripts/download_models.py
python src/c1_pose/extract.py ../../data/raw/B01_D01_side_10m.MOV
python src/c1_pose/overlay.py ../../data/raw/B01_D01_side_10m.MOV
```
