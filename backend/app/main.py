"""CricShield API – one FastAPI app, one router per component.

Run from the backend folder:
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
