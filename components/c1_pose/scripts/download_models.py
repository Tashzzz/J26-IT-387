"""Download the MediaPipe PoseLandmarker models (lite, full, heavy) into models/.

Model files are not committed to git; run this once after cloning.

Usage (run from components/c1_pose):
  python scripts/download_models.py
"""

import urllib.request
from pathlib import Path

BASE_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker"
VARIANTS = ["lite", "full", "heavy"]
MODELS_DIR = Path("models")


def main():
    MODELS_DIR.mkdir(exist_ok=True)
    for variant in VARIANTS:
        name = f"pose_landmarker_{variant}"
        target = MODELS_DIR / f"{name}.task"
        if target.exists():
            print(f"{target} already exists, skipping")
            continue
        url = f"{BASE_URL}/{name}/float16/latest/{name}.task"
        print(f"Downloading {url}")
        urllib.request.urlretrieve(url, target)
        print(f"  saved {target} ({target.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
