# C1 reliability pilot: ICC per keypoint

## Method

Each group is one bowler filmed several times from the same camera angle and distance (taken from the metadata columns, not the clip names). In every delivery the release frame is the frame where the bowling-arm wrist is highest, and a window from 0.4 s before to 0.3 s after release is cut using that clip's own frame rate. Each keypoint path in the window is resampled to 101 time points so that 30 fps and 60 fps clips line up; a keypoint missing in more than 20 % of the window is left out for that delivery. For every keypoint and axis (x and y; depth is skipped) ICC(2,1) is calculated with the 101 time points as targets and the deliveries as raters, and the keypoint ICC is the mean of x and y. A keypoint is usable when its ICC is at least 0.75 (bands: poor < 0.50, moderate < 0.75, good < 0.90, excellent >= 0.90).

## Groups

| group | deliveries | release window usable | fps |
|---|---|---|---|
| B01_semi_side_5m | 3 | 3 | 30 |
| B02_side_10m | 3 | 3 | 60 |
| B03_side_4m | 3 | 3 | 60 |

## Mean ICC per body region

| region | B01_semi_side_5m | B02_side_10m | B03_side_4m |
|---|---|---|---|
| head | 0.94 | 0.69 | 0.68 |
| shoulder | 0.88 | 0.63 | 0.62 |
| elbow | 0.91 | 0.78 | 0.82 |
| wrist_hand | 0.92 | 0.86 | 0.83 |
| hip | 0.78 | 0.71 | 0.82 |
| knee | 0.78 | 0.45 | 0.54 |
| ankle_foot | 0.84 | 0.47 | 0.52 |

## Usable keypoints (ICC >= 0.75)

- **B01_semi_side_5m** (22/23): nose, left_shoulder, right_shoulder, left_elbow, right_elbow, left_wrist, right_wrist, left_pinky, right_pinky, left_index, right_index, left_thumb, right_thumb, left_hip, right_hip, left_knee, left_ankle, right_ankle, left_heel, right_heel, left_foot_index, right_foot_index
- **B02_side_10m** (10/23): right_shoulder, right_elbow, left_wrist, right_wrist, left_pinky, right_pinky, left_index, right_index, left_thumb, right_thumb
- **B03_side_4m** (7/23): left_elbow, left_wrist, left_pinky, left_index, left_thumb, left_hip, right_hip
- **Usable in every group** (4/23): left_wrist, left_pinky, left_index, left_thumb

## Limitations

- This is a pilot with 3 deliveries per group, so the confidence intervals in icc_pilot.csv are wide and single values should not be over-read.
- ICC here measures pose-estimation reliability together with the bowler's natural variation between deliveries; the two cannot be separated with this design.
- The 101 time points of one keypoint path are not independent of each other, so the confidence intervals are likely narrower than they should be.
- Release is found automatically (highest bowling wrist) and was checked by eye on the release-frame images; a wrong release would misalign a delivery and lower its ICC.
