# C1 test log – pose estimation pipeline

Tests of `components/c1_pose/src/c1_pose/pipeline.py` (extract → stabilise → normalise →
overlay → export for one video). Error cases must stop with a plain-English `PipelineError`
message, not a crash. Automated rows are covered by `tests/test_pipeline.py` and use made-up
inputs only (no bowler videos).

| Test ID | Input | Expected result | Actual result | Pass/Fail | Date |
|---|---|---|---|---|---|
| C1-T01 | Text file renamed to `.mp4` | `PipelineError`: "This file could not be opened as a video. Please upload an MP4 or MOV video." | Error raised with that message | Pass | 2026-10-18 |
| C1-T02 | 0.5 s black video (made with OpenCV, 30 fps) | `PipelineError`: "The clip is too short (0.5 s)…" | Error raised with that message | Pass | 2026-10-18 |
| C1-T03 | 2 s black video, no person (made with OpenCV) | `PipelineError`: "No person was found in the video…" | Error raised with that message (MediaPipe lite run on all 60 frames) | Pass | 2026-10-18 |
| C1-T04 | Bowling arm missing or invalid (`None`, `""`, `"both"`, `"up"`, `1`) | `PipelineError`: "Please choose the bowling arm: left or right." | Error raised for all five values | Pass | 2026-10-18 |
| C1-T05 | Detection rate below 20 % (10 % summary) | `PipelineError`: "…bowler not visible enough – film closer or with better light." 20 % itself is accepted | Error raised at 10 %, no error at 20 % | Pass | 2026-10-18 |
| C1-T06 | Unknown model name (`"huge"`) | `PipelineError`: "Unknown model…" | Error raised with that message | Pass | 2026-10-18 |
| C1-T07 | Dark clip (filmed in low light) | Detection-rate error (C1-T05 message) or a clear warning; no crash | To do – manual test | – | 2026-10-18 |
| C1-T08 | Real nets clip (T02_two_people): bowler + coach walking slowly beside him, 30 fps, 4.6 s | Keypoints follow the bowler | Skeleton followed the **coach**, not the bowler (`num_poses=1` picks the most confident person; the slow, upright coach is easier to detect than the blurred bowler). Detection rate 100 % | **Fail – known limitation.** Mitigation now: recording protocol, only the bowler in frame (filming tip in the app). Planned fix after PP1: `num_poses=2` + automatic bowler selection (person whose wrist rises highest / moves fastest) | 2026-10-18 |
| C1-T09 | Normal clip `B03_D02_side_4m`, lite model, bowling arm left | Contract JSON (valid against `contracts/c1_keypoints.schema.json`) + overlay video | JSON valid, 421 frames, overlay written. Detection rate 62.95 %; extraction time 33.4 s (≈12.6 frames/s) on the development laptop | Pass | 2026-10-18 |

Notes:
- C1-T05 is tested on the check itself, because a made-up video cannot give a partial detection rate.
- C1-T09 time is the keypoint-extraction step reported by `extract.py` (`processing_seconds`); stabilise, normalise, overlay and export add a few seconds on top.

## Unit tests

Run from `components/c1_pose`: `python -m pytest -q` → **37 passed** (2026-10-18).

| Test file | Tests | What it covers |
|---|---|---|
| `tests/test_pipeline.py` | 10 | Input checks of the full pipeline (C1-T01 to C1-T06) |
| `tests/test_export.py` | 6 | JSON export matches the C2 contract schema, nulls/filled points, `rear` angle, error paths |
| `tests/test_stabilise.py` | 6 | Visibility masking, short-gap filling (long and edge gaps left missing), no smoothing applied |
| `tests/test_normalise.py` | 9 | Hip-centre origin, shoulder-width / torso-length scaling, same pose at different distances gives the same result, error paths |
| `tests/test_overlay.py` | 1 | Keypoints left empty by stabilise are skipped, not drawn |
| `tests/test_compare_models.py` | 5 | lite/full/heavy comparison outputs, no paths or names in them |
