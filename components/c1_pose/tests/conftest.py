import sys
from pathlib import Path

# The C1 modules import each other as plain modules (e.g. "from keypoints import ..."),
# so tests put src/c1_pose on the import path the same way running the scripts does.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "c1_pose"))
