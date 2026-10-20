# CricShield backend (FastAPI)

One API for the app. Each component owns one router in `app/routers/`:

| Router | Prefix | Owner |
|--------|--------|-------|
| `pose.py` | `/pose` | C1 – Nethmi |
| `features.py` | `/features` | C2 – Samarasinghe |
| `risk.py` | `/risk` | C3 – Rizma |
| `recommend.py` | `/recommend` | C4 – Rathnayaka |

## Run

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env        # then fill in the Firebase values
pip install -e ../components/c3_risk     # C3 risk model (numpy, pandas, scikit-learn, xgboost)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open http://localhost:8000/docs to try the endpoints.

The Firebase service-account key is shared privately in Teams. It must never be committed.

C3 needs a trained model once per computer: `cd components/c3_risk && python -m c3_risk train --data <synthetic data>` (see `components/c3_risk/README.md`). Until then `/risk/*` answers 503 with that command; the other routers are unaffected.
