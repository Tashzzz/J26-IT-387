# Component 1 – Pose Estimation and Reliability Evaluation

**CricShield** · AI-Powered Fast Bowler Injury Risk Prediction Using Video Analysis
SLIIT Research Project J26-IT-387 · IT4010

| | |
|---|---|
| **Owner** | Gunarathne R.M.N.N (IT22248312) |
| **Role** | Computer Vision Engineer |
| **Supervisor** | Mrs. Lokesha Weerasinghe |
| **Co-supervisor** | Ms. Ishara Weerathunga |
| **Folder** | `components/c1_pose/` |

---

## 1. Overview

Component 1 is the first stage of the CricShield pipeline. It takes **one smartphone video of a fast-bowling delivery**, extracts **2D body keypoints** for every frame, draws a **skeleton overlay video**, and attaches a **reliability tag to every keypoint** before the data is passed to Component 2 (biomechanical feature engineering).

The reliability tags come from a **test–retest reliability study (ICC)** carried out on real outdoor fast-bowling deliveries. They tell the rest of the system which body points can be trusted from the camera position that was used, so that unreliable keypoints do not silently produce wrong joint angles or wrong injury warnings.

```
Phone video ──► C1 Pose & Reliability ──► C2 Biomechanics ──► C3 Risk ──► C4 Recommendations
                 keypoints + overlay        events, angles      risk %      training plan
                 + reliability tags
```

## 2. Novelty

Cricket studies commonly use keypoints from general-purpose pose models without checking whether they are reliable, and published validations of markerless pose estimation are mostly carried out in laboratories or on slow, simple movements. Camera position, outdoor conditions and high-speed sports movements are repeatedly listed in that literature as untested limitations.

Component 1 **measures keypoint reliability per keypoint and per camera setup in real outdoor fast bowling, filmed on a single smartphone**, and uses these **measured reliabilities, rather than the pose model's own confidence score**, to tag keypoints for downstream analysis and to guide coaches on where to place the camera.

## 3. Key functions

### Function 1 – Keypoint extraction pipeline

| | |
|---|---|
| **Input** | Bowling video (MP4 / MOV) uploaded in the app, with the bowling arm and camera setup (angle, distance) chosen by the coach |
| **Processing** | MediaPipe Pose Landmarker (lite) → 23 bowling keypoints per frame → occlusion handling → normalisation → skeleton overlay → JSON export |
| **Output** | Skeleton overlay video, keypoint CSV files and a JSON file for Component 2 (`contracts/c1_keypoints.schema.json`) |
| **Shown in the app** | Skeleton video, tracking quality (Good ≥ 60 %, Fair 40–60 %, Poor < 40 % of frames with the bowler), frame count and bowling arm |

### Function 2 – Reliability-guided keypoint tagging

| | |
|---|---|
| **Input** | Normalised keypoints of repeated deliveries, grouped by bowler, camera angle and distance |
| **Processing** | Release-aligned test–retest ICC(2,1) per keypoint and axis; usability gate ICC ≥ 0.75 |
| **Output** | `experiments/c1_reliability.json`; a reliability tag (`icc`, `band`, `usable`) on every keypoint in the C1 → C2 file |
| **Shown in the app** | Body reliability map on the camera-setup and results screens; Reliability study page (ICC per body region and keypoint) |

## 4. Processing pipeline

`src/c1_pose/pipeline.py` runs all steps for one video (also used by the backend endpoint):

| Step | Module | What it does |
|---|---|---|
| 1. Extract | `extract.py` | Runs MediaPipe Pose Landmarker in video mode on every frame (one person). Saves 33 landmarks per frame with position and visibility, plus the detection rate and processing time. |
| 2. Clean | `stabilise.py` | Treats keypoints with visibility < 0.5 as missing; fills gaps of up to 5 frames by linear interpolation and flags them as filled; longer gaps stay empty. **No smoothing** is applied in C1 — Component 2 applies the Butterworth filter, so the reliability study measures the pose model itself. |
| 3. Normalise | `normalise.py` | Converts to pixels, moves the origin to the hip centre in every frame and scales by one body length per clip (median shoulder width; torso length available), so bowlers filmed at different distances are comparable. |
| 4. Overlay | `overlay.py` | Draws the skeleton on the original video: green points = well tracked, red = weak, "NO POSE" where the bowler is not found. |
| 5. Export | `export.py` | Writes the JSON hand-off for Component 2: normalised keypoints per frame, which points were filled, the normalisation used, recording conditions and reliability tags (via `reliability_lookup.py`). Keypoints are tagged, never removed — Component 2 decides how to use them. |

**Input checks** (`PipelineError` with a plain-English message shown in the app): file is not a video; clip shorter than 1 s; nobody found; bowler found in fewer than 20 % of frames; bowling arm missing; unknown model.

**Keypoints used (23):** nose; left/right shoulder, elbow, wrist, pinky, index, thumb; left/right hip, knee, ankle, heel, foot index. Face points 1–10 are not used because they add nothing for bowling analysis.

## 5. Model selection

The three MediaPipe Pose Landmarker models were compared on the same clips (`compare_models.py`). Rule: use the fastest model unless a slower one improves the detection rate by at least 5 percentage points or bowling-arm visibility by at least 0.05.

| Model | Detection rate | Speed (frames/s) | Bowling-arm visibility |
|---|---|---|---|
| **lite (selected)** | 54.5 % | **14.9** | **0.81** |
| full | 44.5 % | 10.2 | 0.72 |
| heavy | 55.6 % | 7.6 | 0.68 |

Heavy found the bowler in 1.1 percentage points more frames at about half the speed, so **lite** is used in the app.

## 6. Reliability study (ICC pilot)

**Question:** if the same bowler bowls the same delivery again, filmed the same way, does each keypoint follow the same path?

**Method** (`reliability.py`)

- **Groups:** clips marked `use = icc` in the metadata, grouped by bowler, camera angle and distance; groups with at least 3 deliveries are kept — B01 semi-side 5 m, B02 side 10 m, B03 side 4 m (**9 deliveries**).
- **Alignment:** ball release = the frame where the bowling-arm wrist is highest. A window from 0.4 s before to 0.3 s after release is cut using each clip's own frame rate and resampled to 101 points, so 30 fps and 60 fps clips line up. A keypoint missing in more than 20 % of the window is excluded for that delivery. Release frames are saved as images and checked by eye.
- **Statistic:** ICC(2,1) — two-way random effects, absolute agreement, single measure — per keypoint for x and y (depth is not used from a single camera), then averaged. Bands: poor < 0.50 ≤ moderate < 0.75 ≤ good < 0.90 ≤ excellent (Koo & Li, 2016).
- **Gate:** a keypoint is **usable when ICC ≥ 0.75**.

**Results – mean ICC per body region**

| Setup | Head | Shoulders | Elbows | Wrists | Hips | Knees | Ankles/feet | Usable |
|---|---|---|---|---|---|---|---|---|
| Semi-side, 5 m | 0.94 | 0.88 | 0.91 | 0.92 | 0.78 | 0.78 | 0.84 | **22 / 23** |
| Side, 10 m | 0.69 | 0.63 | 0.78 | 0.86 | 0.71 | 0.45 | 0.47 | 10 / 23 |
| Side, 4 m | 0.68 | 0.62 | 0.82 | 0.83 | 0.82 | 0.54 | 0.52 | 7 / 23 |

Wrist keypoints were reliable from every setup. Knees and ankles were not reliable from side-on views, where one leg hides the other. The semi-side view at 5 m is recommended to coaches in the app.

**How the results are applied** (`reliability_lookup.py`): a new clip is matched to the closest studied setup (same angle, nearest distance within ±2 m; if several bowlers were studied, the lowest ICC per keypoint is used). If no studied setup is close enough, the clip is marked *"no reliability study for this setup yet"* and the app shows the result as unverified.

## 7. Robustness check

`robustness.py` re-processes the ICC clips under simulated conditions and recomputes the ICC:

| Condition | Change applied |
|---|---|
| Phone proxy | 60 fps 4K clips reduced to 30 fps, 1080p |
| Dim (−2 EV) | ¼ of the light, with sensor noise |
| Dark (−4 EV) | 1/16 of the light, with sensor noise |
| Dark + auto gain | 1/16 of the light, brightened like a phone's auto-exposure |

Key results: the semi-side 5 m setup kept **20 / 23** usable keypoints in dim light, but **0 / 23** in the dark (10 / 23 with auto gain); the side 10 m bowler was lost completely in the dark. These are controlled simulations (no motion blur), not new recordings. Full tables: `experiments/robustness_summary.md`.

## 8. Folder structure

```
components/c1_pose/
├── README.md
├── requirements.txt
├── scripts/
│   └── download_models.py      downloads the lite / full / heavy .task models into models/
├── models/                     MediaPipe model files (not committed)
├── src/c1_pose/
│   ├── keypoints.py            keypoint names, body regions, skeleton connections
│   ├── probe_clips.py          measures fps, length and size of every clip → metadata sheet
│   ├── prepare_clips.py        copies clips under anonymised IDs (e.g. B01_D02_side_5m)
│   ├── extract.py              video → keypoints CSV + summary JSON
│   ├── stabilise.py            visibility masking + short-gap filling (no smoothing)
│   ├── normalise.py            hip-centre origin, body-length scale
│   ├── overlay.py              skeleton overlay video
│   ├── export.py               JSON hand-off for Component 2
│   ├── pipeline.py             all steps for one video (used by the backend)
│   ├── compare_models.py       lite vs full vs heavy comparison
│   ├── reliability.py          ICC reliability study
│   ├── reliability_lookup.py   reliability tags for a clip's camera setup
│   └── robustness.py           simulated low-light / phone-quality check
├── experiments/                results (aggregate only, no videos or names)
│   ├── model_comparison.csv / .png / .md
│   ├── icc_pilot.csv           ICC per setup, keypoint and axis, with 95 % CI
│   ├── icc_by_region.png       ICC heatmap
│   ├── icc_summary.md          method, results and limitations
│   ├── c1_reliability.json     reliability table used by the app and the export
│   └── robustness_*.csv / .png / .md
└── tests/                      unit and failure-path tests
```

## 9. Installation and usage

**Requirements:** Python 3.12, and the packages in `requirements.txt` (MediaPipe, OpenCV, NumPy, pandas, SciPy, Matplotlib, pingouin, jsonschema, pytest).

```bash
cd components/c1_pose
python -m venv .venv
.venv\Scripts\activate            # Windows  (macOS / Linux: source .venv/bin/activate)
pip install -r requirements.txt
python scripts/download_models.py # once, after cloning
```

**Run the whole pipeline on one video**

```bash
python src/c1_pose/pipeline.py <video.mp4> --out <output_folder> --bowling-arm right
```

**Run individual steps / studies**

```bash
python src/c1_pose/extract.py <video>                 # keypoints only
python src/c1_pose/overlay.py <video>                 # skeleton overlay
python src/c1_pose/compare_models.py                  # model comparison
python src/c1_pose/reliability.py                     # ICC reliability study
python src/c1_pose/robustness.py                      # robustness check
python src/c1_pose/reliability_lookup.py side 4       # reliability tags for a setup
```

**Through the app:** start the backend (`backend/`, `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`) and the app (`app/`, `npx expo start`). C1 is called through:

| Endpoint | Purpose |
|---|---|
| `POST /pose/process` | Runs the pipeline on an uploaded video (form fields: `video`, `bowling_arm`, `angle`, `distance_m`) |
| `GET /pose/runs/{run_id}/overlay` | Skeleton overlay video |
| `GET /pose/runs/{run_id}/keypoints` | Keypoints of a run |
| `GET /pose/reliability` | ICC results per camera setup and body region |

## 10. Output for Component 2

Each processed clip produces a JSON file that follows `contracts/c1_keypoints.schema.json`:

- `frames[].t` — time in seconds; `frames[].landmarks` — 33 × [x, y, z, visibility] (normalised), `null` where a keypoint is missing
- `frames[].filled` — keypoints that were interpolated rather than measured
- `normalisation` — origin and scale used; `filter: "none"` (smoothing is done in C2)
- `conditions` — camera angle, distance, lighting, device, fps, bowling arm
- `reliability` — `setup_matched`, `gate` and, for every keypoint, `{icc, band, usable}`

## 11. Testing

```bash
cd components/c1_pose
python -m pytest -q
```

70 automated tests cover the pipeline's error cases, export against the C2 contract, gap filling (and that no smoothing is applied), normalisation (the same pose at different distances gives the same result), overlay, model comparison, the ICC study, the reliability lookup and the robustness check. Tests use generated inputs only — no bowler videos.

Manual and real-clip tests are recorded in `docs/testing/c1_test_log.md` (C1-T01 to C1-T09), including the known limitation C1-T08: with a coach walking beside the bowler, the tracker followed the coach.

## 12. Data and ethics

- Videos were recorded with the bowlers' consent and are identified only by anonymised codes (B01, B02, …).
- **Videos, processed frames and the metadata sheet that links names to clips are stored only on the team's private storage and are never committed to the repository** (`data/` is git-ignored).
- The `experiments/` folder contains aggregate results only — no file paths, names or video frames.

## 13. Known limitations

- The bowler is detected in about 55–65 % of frames; general pose models are not trained on fast-bowling motion.
- The ICC study is a pilot (3 deliveries per setup, one bowler per setup), so confidence intervals are wide and camera and bowler effects are not separated; ICC also includes the bowler's natural variation between deliveries.
- Reliability is applied per camera setup, so the camera angle and distance entered by the coach must match the video.
- When other people are in the frame, the tracker may follow the wrong person.
- ICC shows that keypoints are repeatable, not that they are anatomically correct.

## 14. References

- Bazarevsky, V. et al. (2020). *BlazePose: On-device real-time body pose tracking.* arXiv:2006.10204.
- Koo, T. K. & Li, M. Y. (2016). A guideline of selecting and reporting intraclass correlation coefficients for reliability research. *Journal of Chiropractic Medicine*, 15(2), 155–163.
- Shrout, P. E. & Fleiss, J. L. (1979). Intraclass correlations: uses in assessing rater reliability. *Psychological Bulletin*, 86(2), 420–428.
- Google. MediaPipe Pose Landmarker (Tasks API) documentation.
