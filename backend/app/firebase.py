"""Firebase connection shared by all routers.

Reads backend/.env:
  FIREBASE_CREDENTIALS     path to the service-account JSON (relative to the backend folder)
  FIREBASE_STORAGE_BUCKET  e.g. cricshield.firebasestorage.app (optional)

Firebase is started on first use, not at import, so the API (and its tests) still run on a
computer without the key - only the endpoints that need Firebase fail, with a clear message.

Usage in a router:
    from app.firebase import db
    db().collection("athletes").document("7").set({...})
"""

import os
from functools import lru_cache
from pathlib import Path

import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore, storage

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


class FirebaseNotConfigured(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _app() -> firebase_admin.App:
    cred_path = os.getenv("FIREBASE_CREDENTIALS")
    if not cred_path:
        raise FirebaseNotConfigured("FIREBASE_CREDENTIALS is not set in backend/.env")
    path = Path(cred_path)
    if not path.is_absolute():
        path = BACKEND_DIR / path  # works no matter which folder uvicorn is started from
    if not path.is_file():
        raise FirebaseNotConfigured(f"Service-account key not found: {path}")

    options = {}
    bucket = os.getenv("FIREBASE_STORAGE_BUCKET")
    if bucket:
        options["storageBucket"] = bucket
    return firebase_admin.initialize_app(credentials.Certificate(path), options)


def db():
    """Firestore client."""
    return firestore.client(_app())


def bucket():
    """Cloud Storage bucket (needs FIREBASE_STORAGE_BUCKET and Storage enabled in the console)."""
    _app()
    if not os.getenv("FIREBASE_STORAGE_BUCKET"):
        raise FirebaseNotConfigured("FIREBASE_STORAGE_BUCKET is not set in backend/.env")
    return storage.bucket(app=_app())
