"""Load one delivery from C1 output.

Two input formats are accepted:

1. The agreed C1 -> C2 contract JSON (contracts/c1_keypoints.schema.json).
   Whether C1 already filtered it is read from normalisation.filter.
2. A C1 CSV, so C2 can run on real clips before C1's JSON export is finished:
     <clip>_keypoints.csv  raw MediaPipe output from extract.py  (not filtered)
     <clip>_stable.csv     C1 stabilise.py output                (already filtered)
   The world coordinates (wx, wy, wz: metres, hip-centred) are used by default.

The 'prefiltered' flag tells C2's Butterworth stage (filtering.py) whether to
filter again.

Both are turned into the same Delivery object. Missing keypoints become NaN,
so every later step can tell "not measured" apart from a real value.

Axis convention (same as MediaPipe and the C1 contract): x to the side,
y pointing DOWN, z towards / away from the camera.
"""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

N_KEYPOINTS = 33


@dataclass
class Delivery:
    video_id: str
    bowler_id: str
    fps: float
    bowling_arm: str
    points: np.ndarray            # (frames, 33, 3) x, y, z - NaN when missing
    visibility: np.ndarray        # (frames, 33)
    times: np.ndarray             # (frames,) seconds
    window: dict = field(default_factory=dict)       # bfc_frame / release_frame from C1
    reliability: dict = field(default_factory=dict)  # C1 ICC gate per keypoint name
    conditions: dict = field(default_factory=dict)   # camera angle, distance, ...
    prefiltered: bool = False                        # True if C1 already low-pass filtered it
    # Optional: hip-centre position in the image (pixels) per frame, and the clip's
    # scale in pixels. With these C2 can rebuild where each foot is in the image,
    # which is needed to see a foot stop on the ground (foot-contact detection).
    origin_px: np.ndarray = None                     # (frames, 2) or None
    scale_px: float = None

    @property
    def view(self):
        """Camera position from the recording conditions: front / side / semi_side / rear."""
        return str((self.conditions or {}).get("angle") or "unknown")

    @property
    def n_frames(self):
        return self.points.shape[0]


def bowler_from_video_id(video_id):
    """'B03_D02_side_10m' -> 'B03' (anonymised code, never a name)."""
    m = re.match(r"(B\d+)_", video_id or "")
    return m.group(1) if m else "unknown"


def from_c1_json(data):
    """Build a Delivery from the C1 contract (a dict already parsed from JSON)."""
    if not isinstance(data, dict):
        raise ValueError("C1 input must be a JSON object")
    for key in ("video_id", "fps", "bowling_arm", "frames"):
        if key not in data:
            raise ValueError(f"C1 input is missing '{key}'")

    fps = float(data["fps"])
    if not fps > 0:
        raise ValueError(f"fps must be positive, got {data['fps']}")
    if data["bowling_arm"] not in ("left", "right"):
        raise ValueError("bowling_arm must be 'left' or 'right'")

    frames = data["frames"]
    if not isinstance(frames, list) or len(frames) == 0:
        raise ValueError("C1 input has no frames")

    n = len(frames)
    points = np.full((n, N_KEYPOINTS, 3), np.nan)
    vis = np.full((n, N_KEYPOINTS), np.nan)
    times = np.zeros(n)
    for i, fr in enumerate(frames):
        lms = fr.get("landmarks") if isinstance(fr, dict) else None
        if not isinstance(lms, list) or len(lms) != N_KEYPOINTS:
            raise ValueError(f"frame {i}: expected {N_KEYPOINTS} landmarks, "
                             f"got {len(lms) if isinstance(lms, list) else 'none'}")
        times[i] = float(fr.get("t", i / fps))
        for k, lm in enumerate(lms):
            if lm is None:
                continue  # missing keypoint stays NaN
            if len(lm) != 4:
                raise ValueError(f"frame {i}, keypoint {k}: expected [x, y, z, visibility]")
            points[i, k] = lm[:3]
            vis[i, k] = lm[3]

    if not np.isfinite(points).any():
        raise ValueError("C1 input contains no measured keypoints (all null)")

    norm = data.get("normalisation") or {}
    filt = str(norm.get("filter") or "none").lower()

    # Optional image-position fields (see Delivery.origin_px).
    origin = np.full((n, 2), np.nan)
    for i, fr in enumerate(frames):
        o = fr.get("origin_px")
        if isinstance(o, (list, tuple)) and len(o) >= 2 and o[0] is not None and o[1] is not None:
            origin[i] = o[:2]
    scale_px = norm.get("scale_px")
    has_origin = np.isfinite(origin).any() and isinstance(scale_px, (int, float)) and scale_px > 0

    return Delivery(
        video_id=data["video_id"],
        bowler_id=data.get("bowler_id") or bowler_from_video_id(data["video_id"]),
        fps=fps,
        bowling_arm=data["bowling_arm"],
        points=points,
        visibility=vis,
        times=times,
        window=data.get("window") or {},
        reliability=data.get("reliability") or {},
        conditions=data.get("conditions") or {},
        prefiltered=not filt.startswith("none"),
        origin_px=origin if has_origin else None,
        scale_px=float(scale_px) if has_origin else None,
    )


def from_c1_csv(csv_path, fps, bowling_arm, use_world=True):
    """Build a Delivery from C1's long-format stabilised CSV."""
    import pandas as pd

    df = pd.read_csv(csv_path)
    needed = {"clip_id", "frame", "kp_id", "x", "y", "z", "visibility"}
    if not needed.issubset(df.columns):
        raise ValueError(f"CSV is missing columns: {sorted(needed - set(df.columns))}")
    cols = ["wx", "wy", "wz"] if use_world and "wx" in df.columns else ["x", "y", "z"]

    df = df.sort_values(["frame", "kp_id"])
    n = int(df["frame"].max()) + 1
    if len(df) != n * N_KEYPOINTS:
        raise ValueError("CSV must have 33 rows per frame (as written by C1 extract/stabilise)")

    points = df[cols].to_numpy(dtype=float).reshape(n, N_KEYPOINTS, 3)
    vis = df["visibility"].to_numpy(dtype=float).reshape(n, N_KEYPOINTS)
    if "time_ms" in df.columns:
        times = df["time_ms"].to_numpy(dtype=float).reshape(n, N_KEYPOINTS)[:, 0] / 1000.0
    else:
        times = np.arange(n) / fps

    video_id = str(df["clip_id"].iloc[0])
    return Delivery(
        video_id=video_id,
        bowler_id=bowler_from_video_id(video_id),
        fps=float(fps),
        bowling_arm=bowling_arm,
        points=points,
        visibility=vis,
        times=times,
        conditions={"coordinates": "world_m" if cols[0] == "wx" else "image_norm"},
        prefiltered="filled" in df.columns,  # only stabilise.py writes the 'filled' column
    )


def load_delivery(path, fps=None, bowling_arm="right"):
    """Load a .json (C1 contract) or .csv (C1 stabilised) file."""
    path = Path(path)
    if path.suffix.lower() == ".json":
        with open(path) as f:
            return from_c1_json(json.load(f))
    if path.suffix.lower() == ".csv":
        if fps is None:
            fps = _fps_from_c1_summary(path)
        if not fps:
            raise ValueError("Frame rate unknown for CSV input: pass --fps")
        return from_c1_csv(path, fps, bowling_arm)
    raise ValueError(f"Unsupported input type: {path.suffix} (use .json or .csv)")


def _fps_from_c1_summary(csv_path):
    """C1's extract.py writes <clip>_summary.json with the fps next to the CSV."""
    name = csv_path.name.replace("_stable.csv", "_summary.json").replace("_keypoints.csv", "_summary.json")
    summary = csv_path.with_name(name)
    if summary.exists():
        with open(summary) as f:
            return float(json.load(f).get("fps") or 0) or None
    return None
