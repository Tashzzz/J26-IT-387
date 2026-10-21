# C2 – Delivery event model (BFC, FFC, release)

**Owner:** Samarasinghe S.A.T.M. (IT23217140)

Finds back-foot contact (BFC), front-foot contact (FFC) and ball release (BR) from
single-smartphone MediaPipe landmarks, and compares:

1. **Rule-based baseline** (`rule_baseline.py`) – no training
2. **XGBoost** on windowed landmark features (`train_evaluate.py`), leave-one-bowler-out
   cross-validation
3. *(planned)* small temporal network (1D-CNN / BiGRU) once there are 100+ labelled deliveries

It also reports **how many degrees an injury angle changes when the event frame is wrong**,
which links the event model to the C2 angle research.

This folder is a separate experiment. It works on raw MediaPipe image coordinates from
`extract_landmarks.py`; the production event detection used by the app is still
`src/c2_biomech/events.py`. When the trained model is validated on more bowlers it will
replace the foot-contact rules there.

## Files

| File | What it does |
|---|---|
| `extract_landmarks.py` | Video → landmark CSV (MediaPipe PoseLandmarker, heavy model) |
| `label_events.py` | Mark BFC / FFC / BR by hand, frame by frame (desktop window) |
| `CricShield_C2_Event_Detection.ipynb` | Same workflow in Google Colab, with frame-grid labelling |
| `rule_baseline.py` | Rule detector: BR = highest wrist, FFC/BR = last foot landing before |
| `train_evaluate.py` | Rule baseline + XGBoost (LOBO), frame error and angle error |
| `predict.py` | Run a trained model on a new clip |
| `common.py` | Shared features, Butterworth filter, 2-D angles |
| `make_synthetic.py` | Fake clips **only** to check the code runs – never report these numbers |
| `labels_template.csv` | Column format for the hand labels |
| `models/event_xgb.json` | Pilot XGBoost model (11 clips, 2 bowlers) – **not validated**, demo only; see `models/README.md` |

Data and results are not committed (`.gitignore`); only the pilot model is: videos of participants stay
out of the public repo, and labels use anonymous bowler ids.

## Run

```bash
pip install -r requirements.txt
python extract_landmarks.py --videos data/videos --out data/landmarks --model models/pose_landmarker_heavy.task
python label_events.py --video data/videos/clip01.mp4 --bowler B01 --arm R --labels data/labels.csv
python train_evaluate.py --landmarks data/landmarks --labels data/labels.csv --out results --save-model models/event_xgb.json
```

Colab: zip this folder as `cricshield_event_detection.zip`, put it in `MyDrive/CricShield_C2/`
with the videos in `data/videos/`, and run the notebook top to bottom.

Labelling rules (keep identical for every clip):
- contact = the **first** frame any part of that foot touches the ground
- release = the **last** frame the ball is still in the hand
- order must be BFC < FFC < BR

## Pilot results (21 Oct 2026)

11 hand-labelled side-on deliveries from 2 bowlers (30 and 60 fps), labels drafted with AI
assistance and checked by the C2 owner. One clip was dropped because its labels were a
copy of another clip's.

Rule baseline – frame error against the hand labels:

| Event | n | Median error (frames) | Mean error (ms) | Within ±1 frame | Within ±2 frames |
|---|---|---|---|---|---|
| BFC | 11 | 2.0 | 123 | 36 % | 55 % |
| FFC | 11 | 1.0 | 102 | 55 % | 64 % |
| BR | 11 | 1.0 | 88 | 73 % | 73 % |

Angle error caused by the event error (rule baseline, 2-D proxies):

| Event | Angle | Mean | Max |
|---|---|---|---|
| BFC | rear hip | 8.5° | 55.4° |
| BFC | rear knee | 12.1° | 77.5° |
| FFC | front hip | 9.1° | 25.1° |
| FFC | front knee | 5.3° | 28.6° |
| BR | front knee | 2.5° | 12.7° |

What it means
- Release is the easiest event; foot contacts (especially BFC) are the hardest.
- A wrong BFC moves the rear-knee angle by 12° on average (up to 78° on one clip) – larger
  than the ~10° difference between injured and uninjured bowlers (Alway et al. 2021), so
  event accuracy matters.
- XGBoost was not evaluated: with 2 bowlers, leave-one-bowler-out trains on one bowler and
  tests on the other. It needs 15+ bowlers.

Data issues found in the pilot video set
- Only 3 bowlers among the usable side-on clips; 20 of 69 clips were front or rear views;
  11 files were duplicates.
- MediaPipe missed small bowlers in wide shots, sometimes tracked the umpire, and lagged
  in the delivery stride.

Next
- Standard filming protocol: side-on, tripod, 60 fps, bowler at least a third of the frame,
  nobody else close by.
- 15+ bowlers, then XGBoost vs rule baseline with leave-one-bowler-out and a held-out test set.
