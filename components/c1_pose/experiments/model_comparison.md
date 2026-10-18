# Model comparison: lite vs full vs heavy

Mean over 4 clips processed by all three models (bowling-arm visibility over 4 clips with a known bowling arm). Visibility is averaged over frames where a pose was detected. Processing speed depends on the computer used, so compare the models with each other, not with other machines.

| Model | Detection rate | Processing speed (frames/s) | Bowling-arm visibility | All-keypoint visibility |
|---|---|---|---|---|
| lite | 54.5% | 14.9 | 0.814 | 0.818 |
| full | 44.5% | 10.2 | 0.719 | 0.835 |
| heavy | 55.6% | 7.6 | 0.683 | 0.772 |

Lite is the fastest model at 14.9 frames/s, about 2.0x the speed of heavy. Heavy found the bowler most often (55.6% of frames, against 54.5% for lite). Rule used for the app: take the fastest model unless a slower one raises the detection rate by at least 5 percentage points or the bowling-arm visibility by at least 0.05. Recommendation: use **lite** in the app, because the slower models do not detect the bowler or the bowling arm clearly better, so their extra processing time is not worth it.
