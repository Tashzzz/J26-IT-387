"""CricShield Component 1 - reliability tags for one clip, from the ICC pilot study.

reliability.py measured, per camera setup (angle + distance), which keypoints pass
the ICC >= 0.75 gate and saved it in experiments/c1_reliability.json. This module
looks up the setup a new clip was filmed with and returns those tags, so export.py
can fill the "reliability" field of the C1 -> C2 JSON automatically.

Matching rule:
  - same angle (front / rear / semi_side / side), and
  - the same distance, else the nearest studied distance within +-2 m
    (on a tie, the shorter distance). No angle, no distance or nothing close
    enough -> no match.
If several bowlers were studied at the matched setup, each keypoint keeps its
lowest ICC (the more careful choice).

Keypoints are only tagged, never removed: C2 decides what to do with an
unusable one.

Result (flat, so C2 can read reliability["left_knee"]["usable"] directly):
  matched:    {"setup_matched": "side 4 m", "gate": 0.75, "source": "...",
               "nose": {"icc": 0.681, "band": "moderate", "usable": false}, ...}
  no match:   {"setup_matched": null, "note": "no reliability study for this setup yet"}

Usage (run from components/c1_pose):
  python src/c1_pose/reliability_lookup.py side 4
"""

import json
import re
import sys
from pathlib import Path

from keypoints import KEYPOINT_NAMES, REGION

RELIABILITY_JSON = Path(__file__).resolve().parents[2] / "experiments" / "c1_reliability.json"
GATE = 0.75
MAX_DISTANCE_GAP_M = 2.0
SOURCE = "pilot ICC study (3 deliveries per setup)"
NO_MATCH_NOTE = "no reliability study for this setup yet"
META_KEYS = ("setup_matched", "gate", "source", "note")

# Body regions in body order, with the plain names the app shows.
REGION_ORDER = ["head", "shoulder", "elbow", "wrist_hand", "hip", "knee", "ankle_foot"]
REGION_NAME = {"head": "head", "shoulder": "shoulders", "elbow": "elbows", "wrist_hand": "wrists",
               "hip": "hips", "knee": "knees", "ankle_foot": "ankles"}
REGION_OF = {name: REGION[i] for i, name in enumerate(KEYPOINT_NAMES)}

GROUP = re.compile(r"^(?P<bowler>[^_]+)_(?P<angle>.+)_(?P<distance>[\d.]+)m$")


def _distance_text(d):
    return f"{int(d) if float(d).is_integer() else d} m"


def _setups(groups):
    """{(angle, distance): [keypoint dicts of each studied bowler]} from the group labels."""
    setups = {}
    for label, kps in groups.items():
        m = GROUP.match(label)
        if m:
            setups.setdefault((m["angle"], float(m["distance"])), []).append(kps)
    return setups


def _combine(studies):
    """One bowler -> its tags; several -> the lowest ICC per keypoint (None counts as lowest)."""
    out = {}
    for kps in studies:
        for name, tag in kps.items():
            old = out.get(name)
            if old is None or tag.get("icc") is None or (old.get("icc") is not None and tag["icc"] < old["icc"]):
                out[name] = {"icc": tag.get("icc"), "band": tag.get("band"), "usable": bool(tag.get("usable"))}
    return out


def lookup(angle, distance_m, path=RELIABILITY_JSON):
    """Reliability tags for a clip filmed at this angle and distance (see module docstring)."""
    no_match = {"setup_matched": None, "note": NO_MATCH_NOTE}
    angle = (angle or "").strip().lower().replace("-", "_") if isinstance(angle, str) else ""
    try:
        distance = float(distance_m)
    except (TypeError, ValueError):
        return no_match
    if not angle or not Path(path).exists():
        return no_match

    data = json.loads(Path(path).read_text())
    same_angle = {d: studies for (a, d), studies in _setups(data.get("groups", {})).items() if a == angle}
    close = [d for d in same_angle if abs(d - distance) <= MAX_DISTANCE_GAP_M]
    if not close:
        return no_match
    best = min(close, key=lambda d: (abs(d - distance), d))

    return {"setup_matched": f"{angle.replace('_', '-')} {_distance_text(best)}",
            "gate": data.get("gate", GATE), "source": SOURCE,
            **_combine(same_angle[best])}


def keypoint_tags(reliability):
    """Only the per-keypoint entries of a reliability field (drops setup_matched, gate, ...)."""
    return {k: v for k, v in (reliability or {}).items() if k not in META_KEYS and isinstance(v, dict)}


def summary(reliability):
    """Short summary for the app: usable count and reliable / less-reliable body regions.

    A region counts as reliable when at least half of its studied keypoints pass the gate.
    """
    tags = keypoint_tags(reliability)
    reliable, less = [], []
    for region in REGION_ORDER:
        items = [t for k, t in tags.items() if REGION_OF.get(k) == region]
        if items:
            usable = sum(t["usable"] for t in items)
            (reliable if usable * 2 >= len(items) else less).append(REGION_NAME[region])
    out = {"setup_matched": (reliability or {}).get("setup_matched"),
           "usable": sum(t["usable"] for t in tags.values()), "total": len(tags),
           "reliable_regions": reliable, "less_reliable_regions": less}
    if out["setup_matched"] is None:
        out["note"] = NO_MATCH_NOTE
    else:
        out["gate"] = reliability.get("gate", GATE)
    return out


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: python reliability_lookup.py <angle> <distance_m>")
    print(json.dumps(summary(lookup(sys.argv[1], sys.argv[2])), indent=2))
