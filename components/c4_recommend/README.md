# Component 4 – Personalised Injury Prevention and Training Recommendations

**CricShield** · AI-Powered Fast Bowler Injury Risk Prediction Using Video Analysis
SLIIT Research Project J26-IT-387 · IT4010

| | |
|---|---|
| **Owner** | Rathnayaka R. (IT23208162) |
| **Role** | AI-Based Personalised Injury Prevention & Training Recommendation Engineer |
| **Supervisor** | Mrs. Lokesha Weerasinghe |
| **Co-supervisor** | Ms. Ishara Weerathunga |
| **Folder** | `components/c4_recommend/` |

---

## 1. Overview

Component 4 is the last stage of the CricShield pipeline. It turns *"this bowler has a 68 % risk"* into **"what this bowler should do this week, and why"**. It combines the **risk score and SHAP factors from Component 3**, the **biomechanical threshold breaches from Component 2**, the bowler's **workload log** and **athlete profile**, and produces an explainable **prevention plan**: daily over limit, spell cap, rest window, ordered actions with reasons and sources, exercises and a physiotherapist referral when needed.

On top of this evidence-based rule engine, a **research layer uses C3's trained model as a simulator**: a **counterfactual model check (what-if)** that applies each action of the plan to a copy of the bowler's data, re-scores it with C3 and ranks the actions by how much risk they are predicted to remove.

```
Phone video ──► C1 Pose & Reliability ──► C2 Biomechanics ──► C3 Risk ──► C4 Recommendations
                                           angles, breaches    risk + SHAP   plan, model check (what-if)
```

```
C3 risk + SHAP ─┐
C2 breaches ────┼─► fusion ─► risk tier ─► knowledge-base rules ─► SHAP-guided priority ─► explanations ─► referral ─► plan
workload log ───┤                                                                                                      │
profile ────────┘                       C3 model as simulator ─► model check: what-if per action, ranked by effect ◄┘
```

## 2. Novelty

AI injury-risk systems in sports usually stop at a **prediction** ("risk 70 %") and leave the coach to decide what to change. Recommendation tools that do exist apply the **same rule to everyone in a risk group**, whatever is driving the risk.

Component 4 moves from **prediction to prescription** for school and club fast bowlers:

- every recommendation is **traceable** to a published guideline (ECB directives, Hulin 2014, Dennis 2005, Elliott 2007, Orchard 2017 …) and explained in plain language, with **C3's SHAP factors used to prioritise** the actions, not only displayed;
- a **counterfactual model check (what-if)** asks C3's trained model how much each action would lower *this* bowler's risk, so the plan is ranked by **predicted effect for this bowler** instead of only by a fixed rule priority, and the best combination of actions is reported.

## 3. Key functions

### Function 1 – Recommendation engine

| | |
|---|---|
| **Input** | C3 risk score + top SHAP factors, C2 threshold breaches, workload log, athlete profile |
| **Processing** | Fusion into one fact set → 4-tier risk (Low / Moderate / High / Critical, FR3) with safety floors → rules from an evidence-based knowledge base (`knowledge_base.json`, 23 rules, 5 categories) → priority boosted when C3's SHAP factors match a rule → plain-language explanation with citation → referral if critical risk, pain ≥ 7/10, recent injury + high risk, or ≥ 2 severe reliable breaches |
| **Output** | Prevention plan: daily over limit, spell cap, rest window, ordered actions with reasons, exercises, referral (`contracts/c4_plan.schema.json`) |
| **Shown in the app** | Plan screen (tier, limits, referral, action cards with "Why?"), Plan tab in the analysis results, knowledge-base screen (Rules · Limits · Sources) |

### Function 2 – Athlete profile and dashboard

| | |
|---|---|
| **Input** | Athlete profile (anonymised code, birth year, arm, level, injury history), workload log (overs, spells, RPE, soreness), generated plan |
| **Processing** | ACWR, rest days, consecutive days and soreness from the log; plan history; coach / physio feedback with accept / modify / reject and a 1–5 usefulness score (FR11) |
| **Output** | Prevention-plan dashboard, explanation screen, workload log, plan history, feedback form |
| **Shown in the app** | Bowler page (this week's plan, quick workload log), Workload log, Plan history, Coach / physio feedback |

### Function 3 – Model-guided what-if check (C3 model as simulator)

| | |
|---|---|
| **Input** | The bowler's real inputs (profile, workload log, C2 deliveries), the rule plan, C3's trained model |
| **Processing** | Each plan action is applied to a copy of the inputs (overs, rest days or a technique angle) and re-scored by C3; effect = risk now − risk after; actions ranked by effect; greedy search for the best combination; effects under 2 points flagged as too small to trust |
| **Output** | Risk now, risk after each action, ranked actions with predicted effect, best combination of actions and the resulting tier, predicted effect per rule |
| **Shown in the app** | Model check card (Plan screen and analysis Plan tab), "Model predicts −X risk points" on action cards, full Model check screen |

## 4. Processing pipeline

`src/c4_recommend/engine.py` builds one plan (also used by the backend endpoint):

| Step | Module | What it does |
|---|---|---|
| 1. Validate | `models.py` | Checks every input against the team contracts and rejects garbage (negative overs, future dates, real names as codes, SHAP out of range …) with a clear 422 message. |
| 2. Fuse | `fusion.py` | Combines C3 risk + SHAP, C2 breaches (worst value per angle, reliability kept), workload metrics (acute / chronic load, ACWR, rest days, days in a row, soreness) and profile (age group, recent injuries) into one set of facts. |
| 3. Tier | `engine.py` | Risk score → Low / Moderate / High / Critical (cut-offs 0.30 / 0.55 / 0.75). Safety floors: ACWR > 2.0, soreness ≥ 7 or a recent lumbar injury never allow a tier below High. Without C3, a guideline-based fallback tier is used. |
| 4. Limits | `engine.py` | ECB base limits by age group (U13 10/5, U15 12/6, U19 18/7, Senior 24/8 overs per day / spell) scaled by tier (100 % / 75 % / 40 % / 0 %), days per week and rest window. |
| 5. Rules | `engine.py` + `knowledge_base.json` | Evaluates the 23 rules across training, workload, recovery, rehabilitation and preventive exercise; at Critical, volume advice is suppressed and technique work is deferred. |
| 6. Prioritise | `engine.py` | Rules that match one of C3's top SHAP factors get a priority boost. |
| 7. Explain | `explain.py` | Writes a plain-language reason for every action, quoting the facts, C3's factor and the source. |
| 8. Refer | `engine.py` | Physiotherapist referral rules (Critical tier, pain ≥ 7/10, recent injury + High, ≥ 2 severe reliable breaches). |

**Safe when inputs are missing:** no C3 → guideline fallback tier; no C2 row → breaches taken from C3's factor values using C2's limits; no workload → workload rules skipped. Every gap is listed in `data_quality`. A C2 breach marked `reliable: false` (C1's reliability study) is shown with a caveat and never escalates risk on its own.

## 5. Research – Model check / what-if method (`whatif.py`)

**Question:** how much would each action of the current plan lower this bowler's risk?

```
bowler's real inputs ──► C3 model ──► risk now (63)
      ├─ copy + "side-bend 52° → 35°"        ──► C3 model ──► 47   effect −15
      ├─ copy + "SCR 41° → 28°"              ──► C3 model ──► 59   effect −4
      ├─ copy + "week's overs to ACWR 1.1"   ──► C3 model ──► 59   effect −3
      └─ greedy best combination             ──► C3 model ──► 40   (High → Moderate)
```

- **Actionable inputs only:** overs (to the safe ACWR band / daily limit), rest days, technique angles (just inside the C2 limit). Age, level and injury history are never changed.
- **Safety:** the model check only **ranks** actions; referrals and "no bowling" decisions from the rules always stay.
- **Model-agnostic:** C3 is passed in as a `scorer(athlete, workloads, c2_rows)` function, so it works with today's XGBoost and later with the XGBoost–LSTM hybrid.
- **Coverage:** workload, rest-day and technique actions (and the core / knee exercise programmes through the technique fix they support). Exercises and rehabilitation that C3 has no input for stay evidence-based rules.
- **Method background:** counterfactual explanations – Wachter, Mittelstadt & Russell (2018); DiCE – Mothilal, Sharma & Tan (2020).

Results of the first what-if study are in section 6.

## 6. Evaluation

**First what-if study** (`experiments/whatif_study.py`, synthetic C3 model, 12 representative cases, 11 action scenarios)

| Question | Result |
|---|---|
| RQ-W1 – rule order vs model order (mean Kendall's τ, multi-action cases) | **0.50** – the model re-orders half of the multi-action plans |
| RQ-W2 – plausible scenarios (a fix never raises risk) | **11 / 11 (100 %)** |
| Actions with a meaningful effect (≥ 2 points) | 4 / 11 |
| Mean predicted effect by action type | technique +4.1 · workload +1.8 · recovery +1.2 points |
| RQ-W3 – blinded A/B sheet for physiotherapists | `whatif_ab_sheet.csv` (key kept separately) – to be filled |

Technique fixes had the largest effect and load reductions a smaller one in the synthetic C3 model – a finding to discuss with C3, as the literature reports that load spikes matter strongly (Hulin et al., 2014). Results: `experiments/whatif_summary.md`, `experiments/whatif_results.csv`.

**Research questions (one-year scope)**

| RQ | Question | How it is measured | Script |
|---|---|---|---|
| RQ1 | Do physiotherapists agree with C4's tier and referral decisions? | Cohen's κ on 12 labelled cases | `experiments/evaluate.py` |
| RQ-W1 | Does model-guided ranking change the plan order vs rule priority? | Kendall's τ per case | `experiments/whatif_study.py` |
| RQ-W2 | Is the model's behaviour clinically plausible (a fix never raises risk)? | share of plausible scenarios | `experiments/whatif_study.py` |
| RQ-W3 | Do experts prefer the model-guided plan? | blinded A/B sheet + usefulness 1–5 | `experiments/whatif_study.py` |
| RQ3 | Do plain-language explanations raise coach trust and usability? | SUS ≥ 68, Likert trust questions | app feedback + questionnaire |

## 7. Design choices

- **Rule-based safety layer, not a black box.** Every action links to a guideline; physiotherapists can change thresholds in `knowledge_base.json` without touching code.
- **SHAP is used, not just shown.** C3's top factors raise the priority of matching rules and are quoted in the explanation.
- **The model never overrides safety.** ECB limits, Critical = no bowling and referrals stay with the rules; the what-if check only ranks the actions the rules allow.
- **Reliability-aware.** Unreliable C2 measurements carry a "check on video" caveat and never escalate risk on their own.
- **Critical means stop.** Volume advice is suppressed at Critical and technique work is deferred until clearance.
- **Status:** thresholds are DRAFT, anchored to published guidelines, pending the physiotherapist validation session (`docs/decisions.md`).

## 8. Folder structure

```
components/c4_recommend/
├── README.md
├── requirements.txt
├── pyproject.toml
├── src/c4_recommend/
│   ├── models.py               contracts + validation (rejects garbage input)
│   ├── fusion.py               C3 + C2 + workload + profile → facts
│   ├── engine.py               tiers, limits, rule evaluation, referral, plan
│   ├── explain.py              plain-language explanations
│   ├── whatif.py               research: model check / what-if (rank plan actions with C3)
│   ├── knowledge_base.json     rules, limits, exercises, sources
│   ├── store.py                SQLite store (athletes, workloads, plans, feedback)
│   ├── seed.py                 synthetic demo bowlers DEMO01–03
│   └── sample_data/            demo inputs in C3 / C2 contract format
├── experiments/
│   ├── evaluate.py             expert agreement (Cohen's κ) + latency
│   ├── whatif_study.py         what-if study (Kendall's τ, plausibility, blinded A/B sheet)
│   └── whatif_*.csv / .md      what-if results and A/B sheet (key kept separately)
└── tests/                      unit, rule coverage, contracts, API, bad input, model check
```

## 9. Installation and usage

**Requirements:** Python 3.12 and the packages in `requirements.txt` (pydantic, FastAPI, NumPy, pandas, scikit-learn, XGBoost, pytest). The what-if check also needs Component 3 (`pip install -e ../c3_risk`) and its trained model in `components/c3_risk/models/`.

```bash
cd components/c4_recommend
python -m venv .venv
.venv\Scripts\activate              # Windows  (macOS / Linux: source .venv/bin/activate)
pip install -r requirements.txt
pip install -e . -e ../c3_risk
```

**Generate a plan from contract files**

```bash
python -m c4_recommend --c3 ../../contracts/samples/c3_sample.json --c2 ../../contracts/samples/c2_sample.json
```

**Run the studies**

```bash
python experiments/evaluate.py                                                       # expert-agreement sheet + latency
python experiments/whatif_study.py                                                   # what-if study (needs C3's model)
```

**Through the app:** start the backend (`backend/`, `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`) and the app (`app/`, `npx expo start`). C4 is called through:

| Endpoint | Purpose |
|---|---|
| `GET /recommend/athletes` · `POST /recommend/athletes` · `PUT /recommend/athletes/{id}` | Athlete profiles (anonymised codes) |
| `GET` / `POST /recommend/athletes/{id}/workloads` · `DELETE /recommend/workloads/{wid}` | Workload log |
| `POST` / `GET /recommend/athletes/{id}/upstream` | C2 rows and C3 result handed to C4 |
| `POST /recommend/athletes/{id}/plan` · `GET /recommend/athletes/{id}/plans` | Generate a plan, plan history (FR10) |
| `POST /recommend/plans/{pid}/feedback` | Coach / physio feedback or override (FR11) |
| `POST /recommend/athletes/{id}/whatif` | Model check (503 when C3's model is not available) |
| `POST /recommend/from-c3` | Stateless plan from inline profile + workload + C3 / C2 JSON |
| `GET /recommend/knowledge-base` | Rules, limits and sources |
| `POST /recommend/demo/reset` | Reseed the 3 synthetic demo bowlers |

Local data is stored in `data/c4_recommend.db` (git-ignored).

## 10. Output for the app

Each plan follows `contracts/c4_plan.schema.json` (sample: `contracts/samples/c4_sample.json`):

- `risk_tier`, `risk_level`, `risk_score`, `risk_source` (`c3` or `fallback_guidelines`), `summary`
- `limits` — daily limit, spell cap, rest window, maximum bowling days per week
- `referral` — `required`, `reasons`, `to`
- `recommendations[]` — rule id, category, title, action, priority, explanation, contributing factors, evidence, exercises
- `plan[]` — compact `type / action / reason` list for the contract
- `metrics`, `data_quality`, `engine_version`, `latency_ms`

The what-if check returns `base_risk` and `base_tier`, `scenarios[]` (action, change tested, risk after, effect, meaningful, linked rules), `best_plan` (steps, risk, tier), `rule_effect` per rule id, notes, model name and latency.

## 11. Testing

```bash
cd components/c4_recommend
python -m pytest -q
```

405 automated tests cover unit logic (ACWR, rest gaps, tier cut-offs, ECB limits), rule coverage (320 combinations of risk, flags, workload and age), referral boundaries (0.749 vs 0.75, soreness ≥ 7, unreliable breaches), the team contracts, the API, missing data, garbage input (all rejected with 422), the model check (realistic targets, inputs never modified, ranking, greedy combination), and the endpoint returns 503 (not a crash) when C3's model is not available. Plan latency ≈ 0.5 ms (NFR < 3 s).

Manual UI tests are recorded in `docs/testing/c4_test_log.md`.

## 12. Data and ethics

- Bowlers are identified only by anonymised codes (B01, B02, …); a real name is rejected as a bowler code.
- Athlete profiles, workload logs and plans are stored only in the local database on the team computer (`data/` is git-ignored) and are never committed.
- The what-if study uses C3's model trained on synthetic, literature-informed data and representative cases; no real bowler data is used in `experiments/`.
- C4 is decision support, not a diagnosis: a physiotherapist confirms the plan and can override it in the app.

## 13. Known limitations

- Thresholds and tier cut-offs are DRAFT until the physiotherapist validation session.
- C3 is trained on synthetic, literature-informed data, so the predicted effects show how the method works, not validated clinical effects.
- The what-if is retrospective ("if this week had followed the action") and a statistical model shows association, not proven cause; a physiotherapist confirms the plan.
- Exercises and rehabilitation have no input in C3, so they cannot be simulated and stay evidence-based rules.
- The first what-if study is small (12 cases); expert validation (Cohen's κ, blinded A/B sheet) is still to be done.

## 14. References

- Dennis, R. J. et al. (2005). Bowling workload and the risk of injury in elite cricket fast bowlers. *Journal of Science and Medicine in Sport*, 8(1), 51–60.
- ECB. Fast bowling match directives for young players. England and Wales Cricket Board.
- Elliott, B. C. (2007). Back injuries and the fast bowler in cricket. *Journal of Sports Sciences*.
- Gabbett, T. J. (2016). The training–injury prevention paradox. *British Journal of Sports Medicine*, 50(5), 273–280.
- Hulin, B. T. et al. (2014). Spikes in acute workload are associated with increased injury risk in elite cricket fast bowlers. *British Journal of Sports Medicine*, 48(8), 708–712.
- Mothilal, R. K., Sharma, A. & Tan, C. (2020). Explaining machine learning classifiers through diverse counterfactual explanations (DiCE). *Proceedings of FAT\* 2020*, 607–617.
- Orchard, J. W., Kountouris, A. & Sims, K. (2017). Risk factors for hamstring injuries in Australian male professional cricket players. *Journal of Sport and Health Science*, 6(3), 271–274.
- Petersen, J. et al. (2011). Preventive effect of eccentric training on acute hamstring injuries in men's soccer. *American Journal of Sports Medicine*, 39(11), 2296–2303.
- Wachter, S., Mittelstadt, B. & Russell, C. (2018). Counterfactual explanations without opening the black box. *Harvard Journal of Law & Technology*, 31(2), 841–887.
