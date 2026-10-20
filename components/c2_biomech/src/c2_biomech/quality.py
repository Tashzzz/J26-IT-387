"""Frame quality gate: drop detections that cannot be the bowler.

Real clips include the run-up, where the bowler is far away or out of frame.
MediaPipe then sometimes "finds" a person anyway: a distant figure, an object,
or a skeleton with the shoulders below the hips. Filtering such frames would
smear garbage into the good frames, and event detection would lock onto them.

A frame is kept only if:
    1. hips and shoulders are present,
    2. the trunk points upwards: shoulders are above the hips
       ((hip_y - shoulder_y) / trunk_length >= MIN_UPRIGHT; y points down),
    3. the ankles (when visible) are below the hips,
    4. the trunk is not tiny compared with the clip's typical trunk
       (>= MIN_SIZE_RATIO x median of frames that passed 1-3),
and it belongs to a run of at least MIN_RUN consecutive good frames.

Only image x and y are used here (z is too noisy to judge plausibility).
"""

import numpy as np

from . import keypoints as kp

MIN_UPRIGHT = 0.3      # cos of the trunk angle from vertical: 0.3 ~ within 72 deg
MIN_SIZE_RATIO = 0.4
MIN_RUN = 5            # frames


def _mid(P, a, b):
    return (P[:, a, :2] + P[:, b, :2]) / 2.0


def runs(mask):
    """List of (start, end_inclusive) for consecutive True values."""
    out, start = [], None
    for i, m in enumerate(list(mask) + [False]):
        if m and start is None:
            start = i
        elif not m and start is not None:
            out.append((start, i - 1))
            start = None
    return out


def plausible_frames(points):
    """Boolean mask (frames,) of frames that look like a standing/bowling person."""
    P = np.asarray(points, dtype=float)
    sh = _mid(P, kp.LEFT_SHOULDER, kp.RIGHT_SHOULDER)
    hip = _mid(P, kp.LEFT_HIP, kp.RIGHT_HIP)
    trunk = sh - hip
    length = np.linalg.norm(trunk, axis=1)

    ankles = P[:, [kp.LEFT_ANKLE, kp.RIGHT_ANKLE], 1]
    with np.errstate(invalid="ignore", divide="ignore"):
        upright = (-trunk[:, 1]) / length
        ok = np.isfinite(length) & (length > 1e-6) & (upright >= MIN_UPRIGHT)
        n_ank = np.isfinite(ankles).sum(axis=1)
        ankle_y = np.where(n_ank > 0, np.nansum(ankles, axis=1) / np.maximum(n_ank, 1), np.nan)
    ankles_known = np.isfinite(ankle_y)
    ok &= ~ankles_known | (ankle_y > hip[:, 1])

    if ok.any():
        typical = np.nanmedian(length[ok])
        ok &= length >= MIN_SIZE_RATIO * typical

    keep = np.zeros(len(P), dtype=bool)
    for s, e in runs(ok):
        if e - s + 1 >= MIN_RUN:
            keep[s:e + 1] = True
    return keep


def gate(points):
    """Return (points with implausible frames set to NaN, keep mask, summary dict)."""
    keep = plausible_frames(points)
    out = np.array(points, dtype=float)
    out[~keep] = np.nan
    detected = np.isfinite(np.asarray(points, float)[:, :, 0]).any(axis=1)
    summary = {
        "frames": int(len(keep)),
        "frames_with_detection": int(detected.sum()),
        "frames_kept": int(keep.sum()),
        "frames_rejected": int((detected & ~keep).sum()),
        "kept_runs": [[int(s), int(e)] for s, e in runs(keep)],
    }
    return out, keep, summary
