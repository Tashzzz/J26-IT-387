# C2 – Biomechanical feature engineering

**Owner:** Samarasinghe S.A.T.M. (IT23217140)
**Input contract:** `contracts/c1_keypoints.schema.json` (use `contracts/samples/c1_sample.json` until C1 delivers)
**Output contract:** `contracts/c2_features.schema.json`

## Key function 1 – Delivery events and features

| | |
|---|---|
| Input | C1 normalised keypoints for one delivery |
| Processing | Detect back-foot contact, front-foot contact, release → compute shoulder counter-rotation, front-knee flexion at FFC, trunk lateral flexion |
| Output | Feature row per delivery (JSON/CSV) |
| Metric | Agreement with physiotherapist / manual annotation |
| Without it | |

## Key function 2 – Threshold mapping

| | |
|---|---|
| Input | Feature row |
| Processing | Map each feature to published thresholds (Elliott et al., Alway et al.) |
| Output | Per-joint breach indicators on the feature detail screen |
| Metric | |
| Without it | |

## Layout

```
src/c2_biomech/   source code
experiments/      results (no video)
tests/
```
