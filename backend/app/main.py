"""CricShield API – one FastAPI app, one router per component.

Run from the backend folder:
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""

from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.firebase import FirebaseNotConfigured, db
from app.routers import features, pose, recommend, risk

app = FastAPI(title="CricShield API", version="0.1.0")

# The Expo app calls this API from a phone on the same network during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pose.router, prefix="/pose", tags=["C1 pose"])
app.include_router(features.router, prefix="/features", tags=["C2 features"])
app.include_router(risk.router, prefix="/risk", tags=["C3 risk"])
app.include_router(recommend.router, prefix="/recommend", tags=["C4 recommend"])


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/firebase")
def firebase_health():
    """Writes and reads back one Firestore document to prove the connection works."""
    try:
        ref = db().collection("_health").document("ping")
        ref.set({"at": datetime.now(timezone.utc)})
        return {"status": "ok", "firestore": ref.get().to_dict()}
    except FirebaseNotConfigured as e:
        raise HTTPException(503, str(e))
    except Exception as e:  # e.g. Firestore not created yet in the console
        raise HTTPException(502, f"Firebase error: {e}")
