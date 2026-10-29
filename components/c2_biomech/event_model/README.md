# Component 2 – Biomechanical feature engineering

**CricShield** · AI-Powered Fast Bowler Injury Risk Prediction Using Video Analysis  
SLIIT Research Project J26-IT-387 · IT4010

| | |
|---|---|
| **Owner** | Samarasinghe S.A.T.M. (IT23217140) |
| **Component** | Biomechanical feature engineering |
| **Folder** | `components/c2_biomech/event_model/` |
| **Input** | MediaPipe pose landmarks from a bowling video |
| **Output** | Detected delivery events for biomechanical analysis |

---

## 1. Overview

Component 2 identifies the important moments in a fast-bowling delivery: back-foot
contact (BFC), front-foot contact (FFC), and ball release (BR). These moments are used
by the rest of C2 to calculate joint angles and biomechanical features consistently.

The event detector works with MediaPipe landmarks extracted from a single smartphone
video. It compares a transparent rule-based method with an XGBoost model and checks how
an incorrect event frame can affect the final injury-related angle measurements.

The files in this folder support the event-detection study. The production implementation
used by the app is connected through `src/c2_biomech/events.py`.

```
Bowling video → MediaPipe landmarks → event detection → biomechanical angles → C3 risk analysis
```

## 2. Novelty

Many video-analysis systems identify delivery events using a simple wrist or foot rule,
without checking how an event-frame error affects the biomechanical measurements that
follow.

This component compares rule-based and machine-learning event detection for fast bowling
and measures the practical effect of an incorrect event frame on injury-related angles.
This makes it possible to judge event accuracy in terms of its effect on the wider
CricShield risk pipeline, rather than treating event detection as an isolated task.

## 3. Key functions

### Function 1 – Delivery event detection

| | |
|---|---|
| **Input** | MediaPipe landmarks from a bowling video |
| **Processing** | Detect BFC, FFC, and BR using either the rule baseline or the XGBoost model |
| **Output** | Event labels and frame numbers for the delivery |
| **Evaluation** | Compare predicted event frames with hand-labelled reference frames |

### Function 2 – Rule and model comparison

| | |
|---|---|
| **Input** | Landmark features calculated around each video frame |
| **Processing** | Compare the wrist-based and foot-contact rules with XGBoost using bowler-independent validation |
| **Output** | Frame errors, timing errors, and event-level comparison results |
| **Purpose** | Identify which method is most suitable for release and foot-contact detection |

### Function 3 – Biomechanical impact analysis

| | |
|---|---|
| **Input** | Event-frame errors and C2 angle calculations |
| **Processing** | Measure how an early or late event changes the relevant joint angle |
| **Output** | Mean and maximum angle error for each event |
| **Purpose** | Show why accurate event detection matters for injury-risk analysis |

## 4. Processing pipeline

`train_evaluate.py` runs the comparison workflow. The main steps are:

| Step | Module | What it does |
|---|---|---|
| 1. Extract | `extract_landmarks.py` | Converts a bowling video into MediaPipe landmark data. |
| 2. Label | `label_events.py` | Records the BFC, FFC, and BR reference frames. |
| 3. Prepare | `common.py` | Applies shared filtering and calculates landmark-based features. |
| 4. Detect | `rule_baseline.py` / `train_evaluate.py` | Finds events using the rules and XGBoost model. |
| 5. Evaluate | `train_evaluate.py` | Calculates frame and time errors using bowler-independent validation. |
| 6. Link to C2 | `common.py` and angle analysis | Measures the effect of event errors on biomechanical angles. |

The rule baseline uses the highest wrist position to estimate ball release and foot
movement to estimate BFC and FFC. The XGBoost model uses landmark features from a short
window around each frame.

## 5. Files and responsibilities

| File | What it does |
|---|---|
| `extract_landmarks.py` | Converts video into MediaPipe landmark data. |
| `label_events.py` | Records BFC, FFC, and BR reference frames. |
| `rule_baseline.py` | Provides the transparent rule-based detector. |
| `train_evaluate.py` | Trains and evaluates the XGBoost comparison model. |
| `predict.py` | Runs a saved model on a new landmark file. |
| `common.py` | Provides shared filtering, features, and 2-D angle calculations. |
| `labels_template.csv` | Defines the format for event labels. |
| `models/event_xgb.json` | Stores the saved XGBoost model. |

## 6. Results

The evaluation indicates that XGBoost is more effective than the rule baseline for ball
release. On the evaluated real-speed footage, release detection was within one frame
91% of the time with XGBoost, compared with 73% for the rule baseline.

The rule baseline remains more dependable for BFC and FFC. For this reason, the current
direction is a hybrid approach: use the learned model for release and retain the rules
for foot-contact events until more labelled data is available.

The angle-impact analysis also shows that a BFC error can change the rear-knee angle by
about 12° on average, with larger errors in individual deliveries. This is comparable
to the difference reported between injured and uninjured bowlers, so event accuracy is
important for the reliability of the risk analysis.

## 7. Installation and usage

From this folder, install the required packages and run the evaluation workflow:

```bash
pip install -r requirements.txt
python extract_landmarks.py --videos data/videos --out data/landmarks --model models/pose_landmarker_heavy.task
python label_events.py --video data/videos/clip01.mp4 --bowler B01 --arm R --labels data/labels.csv
python train_evaluate.py --landmarks data/landmarks --labels data/labels.csv --out results --save-model models/event_xgb.json
```

To run the saved model on a new landmark file:

```bash
python predict.py --landmarks data/landmarks/<clip>.csv --arm L --fps 59.2 --model models/event_xgb.json
```

## 8. Output for the C2 pipeline

The detector provides:

- BFC, FFC, and BR event names.
- The frame index for each detected event.
- The method used to detect each event.
- Frame and timing information for evaluation.
- Event timing that can be passed to the C2 angle and feature calculations.

The production C2 event path gives priority to manual corrections and reliable C1 timing
information before using an estimated event.

## 9. Testing and evaluation

The evaluation uses leave-one-bowler-out validation so that the model is tested on a
bowler it did not learn from. This provides a more realistic indication of how the
detector may behave on a new bowler.

The main checks are:

- Event error in frames.
- Event error in milliseconds.
- Percentage of detections within one or two frames.
- Angle error caused by an early or late event frame.
- Comparison between the rule baseline and XGBoost.

## 10. Data and ethics

- Videos and labels are stored outside the public repository.
- Bowler identities are represented using anonymous IDs.
- Only aggregate evaluation results are included in the project documentation.
- Reference event frames are checked consistently using the same labelling definitions.

## 11. Known limitations

- Foot-contact detection is less reliable than release detection.
- The evaluation set is still limited, so results may change as more bowlers are added.
- Different camera views, frame rates, slow-motion footage, and background people can
  affect landmark quality.
- The XGBoost model should not replace manual correction when an event is uncertain.
- More labelled bowlers and a held-out test set are needed before relying on the model
  for final clinical or coaching decisions.

## 12. Next steps

- Use a consistent filming setup: side-on view, tripod, and 60 fps where possible.
- Add more labelled bowlers and deliveries.
- Compare the hybrid detector against a held-out test set.
- Improve foot-contact detection after collecting more reliable labels.
- Connect the final event-confidence information to the C2 results screen.

## 13. References

- Alway, P. et al. (2021). Research on bowling technique and injury-related biomechanical differences.
- MediaPipe Pose Landmarker documentation.
