import os
import tempfile
from pathlib import Path

# Throw-away database for every test run (never touches data/)
os.environ["CRICSHIELD_C4_DB"] = str(Path(tempfile.mkdtemp()) / "c4_test.db")
