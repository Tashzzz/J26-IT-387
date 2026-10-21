# C4 test log – personalised prevention recommendations

Owner: Rathnayaka R. (IT23208162) · Last run: 17 Oct 2026

## Automated (components/c4_recommend, `python -m pytest`) – 405 passed

| Level (Lecture 9) | What | Tests |
|---|---|---|
| Unit | ACWR, consecutive days, rest gaps, tier cut-offs (0.30 / 0.55 / 0.75), ECB junior limits | `test_engine.py` |
| Rule coverage | 5 risk levels × 4 flag sets × 4 workload patterns × 4 age groups = 320 combinations each give a valid plan (training action present, exercise when a flag exists, referral when Critical, spell cap ≤ daily limit) | `test_rule_coverage` |
| Referral reliability | 0.749 → no referral, 0.75 → referral; soreness ≥ 7 refers even at 10% risk; unreliable breaches never trigger a referral | `test_referral_*`, `test_unreliable_*` |
| Integration | Team C3 sample + C2 sample → plan validates against `contracts/c4_plan.schema.json`; C3's top factor and C2's breach each drive an action | `test_contracts.py` |
| API / system | profile → workload → C3/C2 intake → plan → history → coach feedback through `/recommend` | `test_api.py` |
| Missing data | No C3 → fallback tier; no C2 → breaches from C3 factor values; no workload → plan still produced; bowler mismatch reported | `test_fallback_*`, `test_no_workload_*` |
| Garbage input | negative / 500 overs, "ten" overs, bad date, future date, unknown session type, soreness 42, empty body, risk 5 / -0.2 / "high", unknown risk level, SHAP 9, a real name as bowler ID → all rejected with 422 | `test_bad_*` |
| What-if (counterfactual) | Only real problems become actions; realistic targets (angle just inside the limit, ACWR → 1.1); inputs never modified; age / injury history never changed; ranking by effect; greedy combination beats any single action; small effects flagged; with C3's real model a technique fix never raises risk; endpoint returns 503 (not a crash) without C3 | `test_whatif.py`, `test_api.py` |
| Performance (NFR < 3 s) | mean 0.47 ms, p95 0.58 ms over 500 plans | `experiments/evaluate.py` |
| Week planner – unit | ECB daily cap, ≤ 2 days in a row (counting the log), ≤ 4 days in any 7 (counting the log), matches kept first, usual-week pattern, empty log, selection for every mode | `test_weekplan.py` |
| Week planner – with C3 model | every mode returns a plan inside the hard limits; tradeoff never raises predicted risk; keep_bowling ≥ rule overs at ≤ rule risk; Critical and not-returned → no bowling + referral; correcting a breached angle never raises risk; API 200 / bad mode 422; < 3 s | `test_weekplan.py` |
| Week planner – research evaluation | 366 held-out sessions, true hazard (oracle check: 1,800 terms, mean error 0.00007); results in `experiments/weekplan_results_test.md`, `weekplan_frontier_results.json` | `experiments/weekplan_study.py`, `weekplan_frontier.py` |
| Week planner – performance | ≈ 85 ms mean, ≈ 165 ms p95 for ~50 candidate weeks | `experiments/weekplan_results_test.md` |

## Manual UI test (web build, 400 × 860 phone viewport)

| Step | Expected | Result |
|---|---|---|
| Generate plan for DEMO01 / DEMO02 / DEMO03 | High / Low / Critical, Critical shows referral and "No bowling" | Pass |
| Log a session with 500 overs | Error "overs: Input should be less than or equal to 60" | Pass |
| Log 8 overs today | Plan regenerates; last-7-days load 34 → 42 overs | Pass |
| Coach feedback "modify" with new action | Saved and visible in plan history | Pass |
| Profile → inputs | Shows the C3 risk + SHAP factors and C2 breaches the plan used | Pass |

## Still to do (user-level)

- Physiotherapist labels the 12 cases in `experiments/labelling_sheet.csv` → Cohen's kappa for tier and referral.
- Coach usability session (SUS questionnaire, target ≥ 68) + usefulness score from the in-app feedback form.

## What-if UI check (20 Oct 2026, web build, phone viewport)

| Step | Expected | Result |
|---|---|---|
| DEMO03 → Plan tab | Model check card: 63 → 40, top actions with effects; action cards show "Model predicts −15 risk points" | Pass |
| See every scenario | Best combination (side-bend −15, SCR −5, load −3), every action with the change tested, referral banner kept | Pass |
| C3 model missing | Card says the model is not loaded; rest of the plan unchanged | Pass (API test) |
