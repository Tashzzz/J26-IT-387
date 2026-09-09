import os
import sys
import tempfile
from pathlib import Path

# Throw-away model folder and databases for every test run (never touches models/ or data/).
_tmp = Path(tempfile.mkdtemp(prefix="c3_test_"))
os.environ["C3_MODEL_DIR"] = str(_tmp / "models")
os.environ["CRICSHIELD_C3_DB"] = str(_tmp / "c3_test.db")
os.environ["CRICSHIELD_C4_DB"] = str(_tmp / "c4_test.db")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from helpers import build_tiny_model  # noqa: E402

build_tiny_model(_tmp / "models")
