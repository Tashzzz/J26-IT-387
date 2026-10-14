# Contracts – data passed between components

These files are the agreements between team members. A downstream member can build
against the sample file before the upstream component is finished.

| Handoff | Producer → Consumer | Schema | Sample | Status |
|---------|---------------------|--------|--------|--------|
| Normalised, reliability-tagged keypoints per delivery | C1 → C2 | `c1_keypoints.schema.json` | `samples/c1_sample.json` | DRAFT – agree with C2 |
| Feature row per delivery | C2 → C3 | `c2_features.schema.json` | `samples/c2_sample.json` | DRAFT – C2 to confirm |
| Risk score + top SHAP factors | C3 → C4 | `c3_risk.schema.json` | `samples/c3_sample.json` | DRAFT – C3 to confirm |
| Recommendation plan shown in the app | C4 → app | – | `samples/c4_sample.json` | DRAFT – C4 to confirm |

## Shared conventions

- **Clip / delivery ID:** `B<bowler>_D<delivery>_<angle>_<distance>m`, e.g. `B03_D02_side_10m`.
  Bowler IDs are anonymised codes – never names.
- **Angles** in degrees, **time** in seconds from the first frame of the trimmed clip.
- **Keypoint order** is the MediaPipe 33-landmark order
  (see `components/c1_pose/src/c1_pose/keypoints.py`).
- **Firebase:** collection `deliveries/{video_id}` with one sub-document per component
  (`c1`, `c2`, `c3`, `c4`).

## Changing a contract

1. Open a PR that edits the schema **and** the sample file.
2. Add the downstream owner as reviewer.
3. Record the change in `docs/decisions.md`.
