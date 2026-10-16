"""Detect the three delivery events from keypoint tracks.

    BFC  back-foot contact   the back foot lands at the start of the delivery stride
    FFC  front-foot contact  the front foot lands
    REL  ball release        approximated as the frame where the bowling wrist is highest

How a foot landing is found
    y points DOWN, so a foot coming down to the ground has increasing y.
    The foot's downward speed peaks just before it lands and drops to ~0 once it is
    planted. The landing frame is the first frame after that peak where the
    downward speed falls below LANDING_FRACTION of the peak.

Priority
    1. Frames typed in by the user (manual override, e.g. read off the video)
    2. Frames supplied by C1 in the contract "window" (bfc_frame, release_frame)
    3. Automatic detection (below)

Limitations (state these at PP1)
    - The wrist is highest slightly before the real release; the error is a few frames.
    - Detection assumes the clip is trimmed to roughly one delivery stride (C1 does this).
"""

import numpy as np

from . import keypoints as kp

LANDING_FRACTION = 0.5


def _nan_argmin(x, start=0, stop=None):
    seg = np.asarray(x[start:stop], dtype=float)
    if seg.size == 0 or not np.isfinite(seg).any():
        return None
    return start + int(np.nanargmin(seg))


def detect_release(points, bowling_arm, start=0, stop=None):
    """Frame where the bowling wrist is highest (smallest y)."""
    wrist_y = points[:, kp.sides(bowling_arm)["wrist"], 1]
    return _nan_argmin(wrist_y, start, stop)


def detect_landing(foot_y, start, stop):
    """First frame in [start, stop) where a descending foot comes to rest."""
    y = np.asarray(foot_y, dtype=float)
    stop = len(y) if stop is None else min(stop, len(y))
    if stop - start < 3:
        return None
    seg = y[start:stop]
    if np.isfinite(seg).sum() < 3:
        return None
    v = np.diff(seg)  # forward difference: v[i] = y[i+1] - y[i]; >0 means moving down
    if not np.isfinite(v).any() or np.nanmax(v) <= 0:
        # Foot never moves down in this window: use its lowest point instead.
        return start + int(np.nanargmax(seg))
    peak = int(np.nanargmax(v))
    limit = LANDING_FRACTION * v[peak]
    for i in range(peak + 1, len(v)):
        if np.isfinite(v[i]) and v[i] <= limit:
            return start + i
    return start + int(np.nanargmax(seg))


def detect_events(delivery, overrides=None):
    """Return ({'bfc_frame','ffc_frame','release_frame'}, {how each was found}, [warnings])."""
    overrides = {k: v for k, v in (overrides or {}).items() if v is not None}
    P = delivery.points
    n = delivery.n_frames
    side = kp.sides(delivery.bowling_arm)
    window = delivery.window or {}
    warnings = []
    events, method = {}, {}

    def pick(name, auto_fn):
        if name in overrides:
            events[name], method[name] = int(overrides[name]), "manual"
        elif window.get(name) is not None:
            events[name], method[name] = int(window[name]), "c1_window"
        else:
            events[name], method[name] = auto_fn(), "auto"

    # Release first: it bounds the search for the foot contacts.
    pick("release_frame", lambda: detect_release(P, delivery.bowling_arm))
    rel = events["release_frame"] if events["release_frame"] is not None else n - 1

    # BFC: last landing of the back foot before release.
    pick("bfc_frame", lambda: detect_landing(P[:, side["back_ankle"], 1], 0, rel))
    bfc = events["bfc_frame"] if events["bfc_frame"] is not None else 0

    # FFC: front foot lands between BFC and release.
    pick("ffc_frame", lambda: detect_landing(P[:, side["front_ankle"], 1], bfc + 1, rel + 1))

    for name, f in events.items():
        if f is None:
            warnings.append(f"{name}: could not be detected (keypoints missing)")
        elif not 0 <= f < n:
            warnings.append(f"{name}={f} is outside the clip (0..{n - 1})")
            events[name] = None

    b, f_, r = events["bfc_frame"], events["ffc_frame"], events["release_frame"]
    if None not in (b, f_, r) and not (b < f_ <= r):
        warnings.append(f"event order looks wrong: BFC={b}, FFC={f_}, release={r} "
                        "(expected BFC < FFC <= release) - check the clip or set frames manually")
    return events, method, warnings
