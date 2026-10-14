# CricShield

AI-powered injury risk prediction for cricket fast bowlers from smartphone video.
SLIIT IT4010 Research Project – **J26-IT-387**

Supervisor: Mrs. Lokesha Weerasinghe · Co-supervisor: Ms. Ishara Weerathunga

## Scope

Fast bowlers only (school, club and provincial level, Sri Lanka). Scope confirmed with
the supervisor on 10 Jul 2026 after the topic assessment panel review.

## Components and owners

| # | Component | Owner | Folder | Hands on to |
|---|-----------|-------|--------|-------------|
| C1 | Pose estimation and reliability-guided keypoint selection | Gunarathne R.M.N.N. (IT22248312) | `components/c1_pose` | C2 |
| C2 | Biomechanical feature engineering | Samarasinghe S.A.T.M. (IT23217140) | `components/c2_biomech` | C3 |
| C3 | ML risk classifier and SHAP explainability | Rizma A.C.F. (IT23263444) | `components/c3_risk` | C4 |
| C4 | Personalised prevention recommendations | Rathnayaka R. (IT23208162) | `components/c4_recommend` | app |

Data flows C1 → C2 → C3 → C4. The agreed formats for each handoff are in [`contracts/`](contracts/).

## Repository layout

```
contracts/     agreed JSON formats between components + sample files
components/    each member's research code (one folder per component)
backend/       FastAPI service used by the app (one router per component)
app/           Expo / React Native mobile app (screens per component)
data/          NOT committed – see data/README.md
docs/          architecture, decision log, risk register, meeting minutes, test logs
```

## Working rules

1. **Never commit bowler videos, photos or personal data.** Ethics and participant consent
   require secure storage; see `data/README.md`.
2. `main` is the demo build and only changes through pull requests. Integrate on `dev`.
3. Work on a branch named `<component>/<task>`, e.g. `c1/stabilisation`, `c3/xgboost-baseline`.
4. Commit messages start with the component tag: `[C1] add Butterworth stabilisation`.
   Use `[APP]`, `[API]`, `[DOCS]` or `[REPO]` for shared work.
5. Commit small and often – at least once on every working day.
6. If you change a handoff format, update `contracts/` and tell the downstream owner first.

## Getting started

```bash
git clone <repo-url>
cd cricshield
git checkout dev
git checkout -b c1/my-task          # use your own component prefix

# Python component (example: C1)
cd components/c1_pose
python -m venv .venv
.venv\Scripts\activate              # Windows
pip install -r requirements.txt
```

Setup steps for the backend and app are in `backend/README.md` and `app/README.md`.
