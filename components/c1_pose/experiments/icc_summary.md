# C1 reliability pilot: ICC per keypoint

## Method

Each group is one bowler filmed several times from the same camera angle and distance (taken from the metadata columns, not the clip names). In every delivery the release frame is the frame where the bowling-arm wrist is highest, and a window from 0.4 s before to 0.3 s after release is cut using that clip's own frame rate. Each keypoint path in the window is resampled to 101 time points so that 30 fps and 60 fps clips line up; a keypoint missing in more than 20 % of the window is left out for that delivery. For every keypoint and axis (x and y; depth is skipped) ICC(2,1) is calculated with the 101 time points as targets and the deliveries as raters, and the keypoint ICC is the mean of x and y. A keypoint is usable when its ICC is at least 0.75 (bands: poor < 0.50, moderate < 0.75, good < 0.90, excellent >= 0.90).

## Groups

| group | deliveries | fps |
|---|---|---|
| B01_semi_side_5m | 3 | 30 |
| B02_side_10m | 3 | 59, 60 |
| B03_side_4m | 3 | 30, 59 |

Excluded by hand: B01_D01_semi_side_5m (different camera view from the rest of its group in the notes; to be corrected in the metadata).

## Mean ICC per body region

| region | B01_semi_side_5m | B02_side_10m | B03_side_4m |
|---|---|---|---|
| head | 0.94 | 0.69 | n/a |
| shoulder | 0.88 | 0.63 | n/a |
| elbow | 0.91 | 0.78 | n/a |
| wrist_hand | 0.92 | 0.86 | n/a |
| hip | 0.78 | 0.71 | n/a |
| knee | 0.78 | 0.45 | n/a |
| ankle_foot | 0.84 | 0.47 | n/a |

## Usable keypoints (ICC >= 0.75)

- **B01_semi_side_5m** (22/23): nose, left_shoulder, right_shoulder, left_elbow, right_elbow, left_wrist, right_wrist, left_pinky, right_pinky, left_index, right_index, left_thumb, right_thumb, left_hip, right_hip, left_knee, left_ankle, right_ankle, left_heel, right_heel, left_foot_index, right_foot_index
- **B02_side_10m** (10/23): right_shoulder, right_elbow, left_wrist, right_wrist, left_pinky, right_pinky, left_index, right_index, left_thumb, right_thumb
- **B03_side_4m** (0/23): none
- **Usable in every group** (0/23): none

## Limitations

- This is a pilot: 3-4 deliveries per group, so the confidence intervals in icc_pilot.csv are wide and single values should not be over-read.
- The B03 group mixes 30 fps and 60 fps clips. Resampling to 101 time points puts them on the same time axis, but frame rate will be a separate condition in the full study.
- ICC here measures pose-estimation reliability together with the bowler's natural variation between deliveries; the two cannot be separated with this design.
- The 101 time points of one keypoint path are not independent of each other, so the confidence intervals are likely narrower than they should be.
- Release is found automatically (highest bowling wrist) and was checked by eye on the release-frame images; a wrong release would misalign a delivery and lower its ICC.
