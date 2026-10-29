# CricShield

**AI-powered injury risk prediction for cricket fast bowlers from a single smartphone video.**

SLIIT IT4010 Research Project · **J26-IT-387** · Faculty of Computing, Department of Information Technology
Repository: https://github.com/Tashzzz/J26-IT-387

| | |
|---|---|
| **Supervisor** | Mrs. Lokesha Weerasinghe |
| **Co-supervisor** | Ms. Ishara Weerathunga |
| **Team leader** | Gunarathne R.M.N.N (IT22248312) |

---

## 1. Problem

Fast bowlers suffer some of the highest injury rates in cricket, mainly from technique- and workload-related conditions such as lumbar stress fractures. In Sri Lankan school and club cricket, injury monitoring is mostly reactive and based on subjective observation, and wearable or laboratory motion-capture systems are too expensive for most coaches.

## 2. Solution

CricShield lets a coach **film one delivery at the nets with an ordinary phone** and get, in one app:

1. **The action** – a skeleton overlay of the bowler, with the body points that can be trusted for that camera position.
2. **The mechanics** – the key moments of the delivery and the joint angles that matter for injury, compared with published limits.
3. **The risk** – a calibrated injury-risk score with a plain-language explanation of what drives it.
4. **The plan** – a safe, personalised training and workload plan for the coming week.

**Scope:** fast bowlers only (school, club and provincial level, Sri Lanka), confirmed with the supervisor on 10 July 2026 after the topic assessment review.

## 3. Components and owners

Data flows **C1 → C2 → C3 → C4**. Each member owns one component, its backend router and its app screens.

| # | Component | Owner | Folder | Key functions | Details |
|---|---|---|---|---|---|
| **C1** | Pose estimation and reliability evaluation | Gunarathne R.M.N.N (IT22248312) | `components/c1_pose` | Keypoint extraction pipeline with skeleton overlay; reliability-guided keypoint tagging from an ICC test–retest study | [C1 README](components/c1_pose/README.md) |
| **C2** | Biomechanical feature engineering and clinical risk mapping | Samarasinghe S.A.T.M (IT23217140) | `components/c2_biomech` | Signal processing, delivery events (back-foot contact, front-foot contact, release) and view-aware joint angles; mapping to published injury limits | [C2 README](components/c2_biomech/README.md) |
| **C3** | ML risk classifier and SHAP explainability | Rizma A.C.F (IT23263444) | `components/c3_risk` | Calibrated XGBoost risk classifier fusing technique, workload and athlete history; two-level SHAP explanation | [C3 README](components/c3_risk/README.md) |
| **C4** | Personalised prevention recommendations | Rathnayaka R (IT23208162) | `components/c4_recommend` | Evidence-based recommendation engine with referral checks; athlete profile, workload log and plan dashboard; model check (what-if) and week planner | [C4 README](components/c4_recommend/README.md) |

## 4. System architecture

```
                 ┌───────────────────────────────────────────────┐
  Coach ──video──►  CricShield app (Expo / React Native)          │
                 │  profile → camera setup → upload → results     │
                 └───────────────────────┬───────────────────────┘
                                         │ HTTP (JSON, video upload)
                 ┌───────────────────────▼───────────────────────┐
                 │  FastAPI backend   /pose /features /risk /recommend
                 └───────────────────────┬───────────────────────┘
                                         │
   ┌──────────────┐   keypoints +   ┌──────────────┐  angles +   ┌──────────────┐  risk % +   ┌──────────────┐
   │ C1 Pose &    │ ─reliability──► │ C2 Biomech-  │ ─events───► │ C3 Risk      │ ─SHAP─────► │ C4 Recommen- │
   │ Reliability  │      tags       │ anics        │             │ Prediction   │ ◄─what-if── │ dations      │
   └──────────────┘                 └──────────────┘             └──────────────┘             └──────────────┘
```

The agreed hand-off formats between components are JSON schemas in [`contracts/`](contracts/), with sample files in `contracts/samples/`.

## 5. Technology stack

| Layer | Technologies |
|---|---|
| Mobile / web app | Expo SDK 58, React Native, Expo Router, TypeScript |
| Backend API | Python 3.12, FastAPI, Uvicorn |
| Computer vision (C1) | MediaPipe Pose Landmarker, OpenCV, NumPy, pandas, pingouin (ICC) |
| Biomechanics (C2) | NumPy, SciPy (Butterworth filter), pandas, XGBoost (release-event model) |
| Machine learning (C3) | XGBoost, scikit-learn (calibration), SHAP; TensorFlow for the research LSTM |
| Recommendations (C4) | Rule-based knowledge base (JSON), C3 model for what-if and week planning |
| Storage | SQLite (athletes, workload, risk, plans) and local files for processed runs |
| Testing | pytest (Python), TypeScript type checking (app) |

## 6. Repository structure

```
J26-IT-387/
├── README.md          this file
├── app/               Expo / React Native app – screens per component (see app/README.md)
├── backend/           FastAPI service – one router per component (see backend/README.md)
├── components/
│   ├── c1_pose/       C1 research code, experiments and tests
│   ├── c2_biomech/    C2 research code, event model, experiments and tests
│   ├── c3_risk/       C3 research code, models, experiments and tests
│   └── c4_recommend/  C4 research code, knowledge base, experiments and tests
├── contracts/         JSON schemas and samples for every component hand-off
├── data/              NOT committed (videos, metadata) – see data/README.md
└── docs/              decision log, risk register, test logs, meeting minutes, architecture
```

## 7. Getting started

**Prerequisites:** Git, Python 3.12, Node.js (LTS) and npm.

```bash
git clone https://github.com/Tashzzz/J26-IT-387.git
cd J26-IT-387
git checkout dev
```

### 7.1 Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate                 # Windows   (macOS / Linux: source .venv/bin/activate)
pip install -r requirements.txt
pip install -r ../components/c1_pose/requirements.txt -r ../components/c2_biomech/requirements.txt -r ../components/c3_risk/requirements.txt -r ../components/c4_recommend/requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API documentation: http://localhost:8000/docs · health check: http://localhost:8000/health

One-time setup per computer:
- **C1:** download the pose models – `cd components/c1_pose && python scripts/download_models.py`
- **C3:** train the risk model – see [C3 README](components/c3_risk/README.md); until then `/risk/*` returns 503 and the other routers still work.

### 7.2 App

```bash
cd app
npm install
npx expo start          # press "w" for the web version, or scan the QR code with Expo Go
```

On a phone on the same Wi-Fi, the app finds the backend on the computer's IP automatically; Windows Firewall must allow port 8000.

### 7.3 Using the app

1. Create a coach profile and add a bowler.
2. **Analyse** → choose the bowling arm and camera setup (the app shows which body parts are reliable from that position) → upload a delivery video.
3. Review the results tabs: **Video** (C1), **Angles** (C2), **Risk** (C3) and **Plan** (C4), including the model check and the week planner.
4. **Settings → Research mode** shows technical values (ICC, SHAP values, rule IDs) for the project team.

## 8. Testing

Each component and the backend have automated tests:

```bash
cd components/c1_pose && python -m pytest -q        # likewise for c2_biomech, c3_risk, c4_recommend
cd backend && python -m pytest -q
cd app && npm run typecheck
```

| Part | Automated tests |
|---|---|
| C1 – Pose and reliability | 70 |
| C2 – Biomechanics | 82 |
| C3 – Risk | 74 |
| C4 – Recommendations | 405 |
| Backend API | 12 |

Manual and real-clip test cases are logged in `docs/testing/`.

## 9. Data, privacy and ethics

- **Bowler videos, images and personal data are never committed to GitHub.** They were collected with participant consent under SLIIT Ethics Review Committee requirements and are kept on restricted team storage (see [data/README.md](data/README.md)).
- Bowlers are identified only by anonymised codes (B01, B02, …); the code-to-name list is held offline by the team leader.
- `experiments/` folders contain aggregate results only.
- The C3 risk model is currently trained on a **synthetic, literature-informed dataset** because real injury labels are not yet available; all of its outputs are labelled as synthetic.
- CricShield supports coaches and physiotherapists; it does not replace a clinical assessment.

## 10. Team workflow

1. `main` holds the demo build and changes only through pull requests; integration happens on `dev`.
2. Work on a branch named `<component>/<task>`, e.g. `c1/reliability`, `c3/xgboost-baseline`, and open a pull request to `dev`.
3. Commit messages start with the component tag: `[C1]`, `[C2]`, `[C3]`, `[C4]`, or `[APP]`, `[API]`, `[DOCS]`, `[REPO]` for shared work.
4. Commit small and often.
5. A change to a hand-off format updates `contracts/` and is agreed with the downstream owner first.
6. Decisions are recorded in `docs/decisions.md` and risks in `docs/risk_register.md`.

## 11. Documentation

| Document | Location |
|---|---|
| Component READMEs | `components/c1_pose`, `c2_biomech`, `c3_risk`, `c4_recommend` |
| Backend and app setup | [backend/README.md](backend/README.md), [app/README.md](app/README.md) |
| Hand-off formats | [contracts/](contracts/) |
| Decision log | [docs/decisions.md](docs/decisions.md) |
| Risk register | [docs/risk_register.md](docs/risk_register.md) |
| Test logs | [docs/testing/](docs/testing/) |
