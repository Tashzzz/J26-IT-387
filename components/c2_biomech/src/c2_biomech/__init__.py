"""CricShield Component 2 - biomechanical feature engineering.

Owner: Samarasinghe S.A.T.M. (IT23217140)

Pipeline for one delivery:
    C1 keypoints (contract JSON or stabilised CSV)
      -> loader.py      load + validate, one array per frame
      -> events.py      back-foot contact, front-foot contact, ball release
      -> angles.py      joint angles over every frame
      -> features.py    feature values at the events
      -> thresholds.py  compare with published limits -> breach / level
      -> C2 contract JSON for C3 (contracts/c2_features.schema.json)
"""

from .features import compute_features  # noqa: F401
from .loader import load_delivery  # noqa: F401

__version__ = "0.1.0"
