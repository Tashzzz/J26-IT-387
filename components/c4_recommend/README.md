# C4 – Personalised prevention recommendations

**Owner:** Rathnayaka R. (IT23208162)
**Input contract:** `contracts/c3_risk.schema.json` (use `contracts/samples/c3_sample.json` until C3 delivers)
**Output:** `contracts/samples/c4_sample.json` (plan shown in the app)

## Key function 1 – Recommendation engine

| | |
|---|---|
| Input | Risk score + top factors + workload |
| Processing | Rule / knowledge-based plan: exercises, rest, workload change, referral if high risk |
| Output | Personalised prevention plan |
| Metric | |
| Without it | |

## Key function 2 – Athlete profile and dashboard

| | |
|---|---|
| Input | Athlete profile, workload log, plan |
| Processing | |
| Output | Recommendation dashboard + short coach feedback form |
| Metric | Coach feedback score |
| Without it | |

## Layout

```
src/c4_recommend/   source code
experiments/        results
tests/
```
