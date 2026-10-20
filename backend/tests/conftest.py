import os

# Tests must never write to the real Firestore project (see app/cloud.py).
os.environ["FIREBASE_SYNC"] = "0"
