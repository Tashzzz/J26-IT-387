# C1 robustness check: phone frame-rate proxy and simulated low light

## Method

The clips of the ICC pilot are processed again with their frames changed, and the same ICC as the pilot is computed for each condition. Nothing is re-filmed: these are controlled simulations on the same deliveries, run before the real side-by-side phone and dusk sessions.

| condition | what changes |
|---|---|
| baseline | clips as filmed (the ICC pilot itself) |
| phone proxy | 60 fps 4K Samsung clips -> every 2nd frame kept (30 fps) and shrunk to 1080p, like the iPhone clips. Only frame rate and resolution change. Clips already at 30 fps: n/a |
| dim (-2 EV) | 1/4 of the light, photon + read noise (4000 e- full well, 2 e- read noise) |
| dark (-4 EV) | 1/16 of the light, same noise model |
| dark + auto gain | 1/16 of the light, then brightened 16x like a phone's auto-exposure (normal brightness, strong noise) |

Light is reduced on linear (decoded sRGB) values. The changed frames go straight into MediaPipe and are never re-encoded, so no extra compression is added. Release is found again in every condition, as the app would do. Two measures:

- **ICC within group**: ICC(2,1) over repeated deliveries per keypoint, as in icc_summary.md.
- **Agreement with baseline**: ICC(A,1) with the baseline and the condition as the two raters on the same deliveries (101 time points x deliveries as targets), and the mean absolute difference in body lengths (normalised units).

## Detection rate and release

Detection rate = mean share of frames where the bowler was found. Lost = clips the app would reject (bowler found in fewer than 20% of frames); they have no keypoints and leave the ICC. A group with fewer than 3 kept deliveries gets no ICC (n/a). Release shift = mean absolute change of the detected release time against the baseline.

| group | condition | clips | lost | detection rate | release shift (s) |
|---|---|---|---|---|---|
| B01_semi_side_5m | baseline (as filmed) | 3 | 0 | 62.3% | n/a |
| B01_semi_side_5m | phone proxy (30 fps, 1080p) | 0 | n/a | n/a | n/a |
| B01_semi_side_5m | dim (-2 EV) | 3 | 0 | 53.4% | 0.011 |
| B01_semi_side_5m | dark (-4 EV) | 3 | 0 | 51.5% | 0.167 |
| B01_semi_side_5m | dark + auto gain | 3 | 0 | 60.8% | 0.011 |
| B02_side_10m | baseline (as filmed) | 3 | 0 | 61.5% | n/a |
| B02_side_10m | phone proxy (30 fps, 1080p) | 3 | 0 | 56.5% | 0.006 |
| B02_side_10m | dim (-2 EV) | 3 | 1 | 36.4% | 0.159 |
| B02_side_10m | dark (-4 EV) | 3 | 3 | 0.0% | n/a |
| B02_side_10m | dark + auto gain | 3 | 0 | 54.3% | 0.557 |
| B03_side_4m | baseline (as filmed) | 3 | 0 | 60.5% | n/a |
| B03_side_4m | phone proxy (30 fps, 1080p) | 3 | 0 | 53.3% | 0.011 |
| B03_side_4m | dim (-2 EV) | 3 | 0 | 58.1% | 0.000 |
| B03_side_4m | dark (-4 EV) | 3 | 0 | 49.6% | 0.000 |
| B03_side_4m | dark + auto gain | 3 | 0 | 64.0% | 0.000 |

## Mean ICC per body region (within group)

**B01_semi_side_5m**

| region | baseline (as filmed) | phone proxy (30 fps, 1080p) | dim (-2 EV) | dark (-4 EV) | dark + auto gain |
|---|---|---|---|---|---|
| head | 0.94 | n/a | 0.85 | 0.23 | 0.69 |
| shoulder | 0.88 | n/a | 0.79 | 0.09 | 0.62 |
| elbow | 0.91 | n/a | 0.90 | 0.15 | 0.80 |
| wrist_hand | 0.92 | n/a | 0.90 | 0.14 | 0.83 |
| hip | 0.78 | n/a | 0.68 | 0.16 | 0.59 |
| knee | 0.78 | n/a | 0.71 | 0.15 | 0.54 |
| ankle_foot | 0.84 | n/a | 0.82 | -0.00 | 0.64 |

**B02_side_10m**

| region | baseline (as filmed) | phone proxy (30 fps, 1080p) | dim (-2 EV) | dark (-4 EV) | dark + auto gain |
|---|---|---|---|---|---|
| head | 0.69 | 0.56 | n/a | n/a | 0.07 |
| shoulder | 0.63 | 0.54 | n/a | n/a | 0.10 |
| elbow | 0.78 | 0.62 | n/a | n/a | n/a |
| wrist_hand | 0.86 | 0.83 | n/a | n/a | 0.18 |
| hip | 0.71 | 0.78 | n/a | n/a | -0.06 |
| knee | 0.45 | 0.35 | n/a | n/a | 0.07 |
| ankle_foot | 0.47 | 0.24 | n/a | n/a | -0.00 |

**B03_side_4m**

| region | baseline (as filmed) | phone proxy (30 fps, 1080p) | dim (-2 EV) | dark (-4 EV) | dark + auto gain |
|---|---|---|---|---|---|
| head | 0.68 | 0.85 | 0.64 | 0.23 | 0.70 |
| shoulder | 0.62 | 0.78 | 0.59 | 0.22 | 0.65 |
| elbow | 0.82 | 0.90 | 0.68 | 0.35 | 0.73 |
| wrist_hand | 0.83 | 0.92 | 0.81 | 0.39 | 0.82 |
| hip | 0.82 | 0.92 | 0.79 | 0.37 | 0.83 |
| knee | 0.54 | 0.68 | 0.47 | 0.19 | 0.53 |
| ankle_foot | 0.52 | 0.67 | 0.46 | 0.20 | 0.52 |

## Usable keypoints (ICC >= 0.75) per condition

| group | baseline (as filmed) | phone proxy (30 fps, 1080p) | dim (-2 EV) | dark (-4 EV) | dark + auto gain |
|---|---|---|---|---|---|
| B01_semi_side_5m | 22/23 | n/a | 20/23 | 0/23 | 10/23 |
| B02_side_10m | 10/23 | 6/23 | n/a | n/a | 0/23 |
| B03_side_4m | 7/23 | 16/23 | 7/23 | 0/23 | 8/23 |

## Agreement with baseline on the same deliveries

Mean over keypoints in the region, as ICC(A,1) / mean absolute difference. Two versions:

- **Normalised** (what C1 hands to C2): difference in body lengths. This includes any change in the per-clip body scale (shoulder width, see scale ratio below).
- **Image coordinates**: difference in % of the frame. This leaves the body scale out, so it shows how far the keypoints themselves moved.

**B01_semi_side_5m, normalised**

| region | phone proxy (30 fps, 1080p) | dim (-2 EV) | dark (-4 EV) | dark + auto gain |
|---|---|---|---|---|
| head | n/a | 0.95 / 0.230 | 0.56 / 0.735 | 0.89 / 0.292 |
| shoulder | n/a | 0.94 / 0.178 | 0.47 / 0.521 | 0.86 / 0.236 |
| elbow | n/a | 0.97 / 0.215 | 0.50 / 0.870 | 0.94 / 0.247 |
| wrist_hand | n/a | 0.97 / 0.326 | 0.48 / 1.477 | 0.95 / 0.344 |
| hip | n/a | 0.93 / 0.035 | 0.42 / 0.082 | 0.90 / 0.038 |
| knee | n/a | 0.90 / 0.143 | 0.49 / 0.353 | 0.79 / 0.204 |
| ankle_foot | n/a | 0.94 / 0.280 | 0.37 / 0.805 | 0.87 / 0.355 |

**B01_semi_side_5m, image coordinates**

| region | phone proxy (30 fps, 1080p) | dim (-2 EV) | dark (-4 EV) | dark + auto gain |
|---|---|---|---|---|
| head | n/a | 0.98 / 0.3% | 0.37 / 3.8% | 0.98 / 0.4% |
| shoulder | n/a | 0.99 / 0.3% | 0.43 / 3.5% | 0.98 / 0.4% |
| elbow | n/a | 0.97 / 0.6% | 0.50 / 3.7% | 0.96 / 0.6% |
| wrist_hand | n/a | 0.94 / 1.0% | 0.52 / 4.5% | 0.92 / 1.0% |
| hip | n/a | 0.99 / 0.4% | 0.55 / 4.1% | 0.99 / 0.4% |
| knee | n/a | 0.99 / 0.4% | 0.55 / 3.7% | 0.99 / 0.5% |
| ankle_foot | n/a | 0.97 / 0.7% | 0.44 / 5.3% | 0.97 / 0.8% |

**B02_side_10m, normalised**

| region | phone proxy (30 fps, 1080p) | dim (-2 EV) | dark (-4 EV) | dark + auto gain |
|---|---|---|---|---|
| head | 0.88 / 0.395 | 0.99 / 0.065 | n/a | 0.20 / 2.778 |
| shoulder | 0.88 / 0.343 | 0.99 / 0.069 | n/a | 0.22 / 2.127 |
| elbow | 0.93 / 0.362 | 0.98 / 0.123 | n/a | 0.21 / 2.054 |
| wrist_hand | 0.96 / 0.499 | 0.98 / 0.172 | n/a | 0.29 / 2.777 |
| hip | 0.82 / 0.075 | 0.93 / 0.027 | n/a | 0.24 / 0.281 |
| knee | 0.82 / 0.293 | 0.95 / 0.077 | n/a | 0.11 / 1.707 |
| ankle_foot | 0.71 / 0.649 | 0.97 / 0.137 | n/a | 0.20 / 3.041 |

**B02_side_10m, image coordinates**

| region | phone proxy (30 fps, 1080p) | dim (-2 EV) | dark (-4 EV) | dark + auto gain |
|---|---|---|---|---|
| head | 1.00 / 0.2% | 1.00 / 0.1% | n/a | 0.27 / 9.0% |
| shoulder | 0.99 / 0.3% | 0.99 / 0.1% | n/a | 0.30 / 8.1% |
| elbow | 0.99 / 0.3% | 0.98 / 0.2% | n/a | 0.27 / 6.3% |
| wrist_hand | 0.99 / 0.4% | 0.99 / 0.3% | n/a | 0.33 / 6.6% |
| hip | 0.99 / 0.4% | 1.00 / 0.1% | n/a | 0.41 / 5.4% |
| knee | 0.99 / 0.3% | 1.00 / 0.1% | n/a | 0.48 / 6.2% |
| ankle_foot | 0.97 / 0.7% | 0.99 / 0.3% | n/a | 0.44 / 6.6% |

**B03_side_4m, normalised**

| region | phone proxy (30 fps, 1080p) | dim (-2 EV) | dark (-4 EV) | dark + auto gain |
|---|---|---|---|---|
| head | 0.94 / 0.416 | 0.71 / 1.005 | 0.26 / 2.253 | 0.69 / 0.857 |
| shoulder | 0.89 / 0.398 | 0.65 / 0.878 | 0.21 / 1.947 | 0.64 / 0.742 |
| elbow | 0.92 / 0.431 | 0.72 / 0.930 | 0.48 / 2.045 | 0.68 / 0.938 |
| wrist_hand | 0.94 / 0.693 | 0.88 / 1.140 | 0.55 / 2.830 | 0.87 / 0.862 |
| hip | 0.94 / 0.073 | 0.85 / 0.145 | 0.51 / 0.314 | 0.84 / 0.130 |
| knee | 0.88 / 0.363 | 0.51 / 0.863 | 0.16 / 1.899 | 0.53 / 0.726 |
| ankle_foot | 0.86 / 0.775 | 0.48 / 1.707 | 0.17 / 3.788 | 0.51 / 1.436 |

**B03_side_4m, image coordinates**

| region | phone proxy (30 fps, 1080p) | dim (-2 EV) | dark (-4 EV) | dark + auto gain |
|---|---|---|---|---|
| head | 1.00 / 0.6% | 1.00 / 0.2% | 1.00 / 0.3% | 1.00 / 0.2% |
| shoulder | 0.99 / 0.8% | 1.00 / 0.2% | 0.99 / 0.3% | 1.00 / 0.2% |
| elbow | 0.97 / 1.5% | 0.99 / 0.4% | 0.99 / 0.5% | 0.99 / 0.4% |
| wrist_hand | 0.96 / 2.3% | 0.99 / 0.7% | 0.98 / 0.8% | 0.99 / 0.7% |
| hip | 0.99 / 0.6% | 1.00 / 0.1% | 1.00 / 0.2% | 1.00 / 0.1% |
| knee | 0.99 / 0.7% | 1.00 / 0.3% | 0.99 / 0.3% | 1.00 / 0.2% |
| ankle_foot | 0.96 / 1.1% | 0.99 / 0.4% | 0.98 / 0.6% | 0.99 / 0.4% |

## Body scale per clip

Scale ratio = the clip's normalisation scale (median shoulder width, as a share of the frame width) divided by the baseline's for the same delivery; 1.00 = unchanged. Range over the group's clips.

| group | phone proxy (30 fps, 1080p) | dim (-2 EV) | dark (-4 EV) | dark + auto gain |
|---|---|---|---|---|
| B01_semi_side_5m | n/a | 0.91-1.16 | 1.00-1.17 | 0.97-1.53 |
| B02_side_10m | 1.03-1.16 | 0.99-1.11 | n/a | 1.25-1.44 |
| B03_side_4m | 0.78-1.20 | 0.49-1.40 | 0.26-2.20 | 0.42-1.07 |

## Limitations

- These are simulations on 3 deliveries per group, not new recordings, so they show how sensitive each keypoint is, not how a real second phone or a real dusk session will behave.
- The phone proxy changes frame rate and resolution only. A real iPhone also differs in lens, colour processing, stabilisation and compression, and the 2 Oct iPhone/Samsung clips were filmed from different positions, so they cannot be used to separate these effects. The side-by-side session is needed for that.
- Simulated low light adds darkness and sensor noise but not the motion blur of the longer shutter a phone uses at dusk, and not floodlight flicker or colour cast. Real low light is therefore likely to be worse than this simulation, especially for the fast bowling arm.
- The normalisation scale (median shoulder width) is fragile from side-on cameras, where the shoulders overlap and the width is small. When it changes, every normalised keypoint of the clip is rescaled, so the normalised ICC can fall even when the keypoints themselves (image coordinates) hardly move. Compare the two agreement tables before blaming the keypoints.
- ICC within group still mixes pose-estimation error with the bowler's natural variation between deliveries; the agreement with baseline does not, because it compares the same delivery.
