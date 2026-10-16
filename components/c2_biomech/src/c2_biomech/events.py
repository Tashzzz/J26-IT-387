"""Detect the delivery and its three events from keypoint tracks.

    BFC  back-foot contact   the back foot lands at the start of the delivery stride
    FFC  front-foot contact  the front foot lands
    REL  ball release

Ball release (automatic, works on C1's hip-centred keypoints)
    Arm elevation = how far the bowling wrist is above the bowling shoulder,
    divided by the trunk length in the same frame (so it does not change when
    the bowler runs towards the camera and gets bigger). Release is taken as
    the frame of highest arm elevation. In real clips with several detected
    stretches, the stretch with the highest peak is taken as the delivery and
    the other peaks are listed as alternatives.

Foot contacts
    A foot lands when it stops moving DOWN in the image. C1's keypoints are
    hip-centred, so the movement of the whole body is removed and a planted
    foot no longer looks still. Automatic contact detection therefore needs
    the hip-centre position in the image (origin_px per frame + scale_px) to
    rebuild where each foot really is. Without them, BFC and FFC must come
    from C1's window or be typed in manually (--bfc / --ffc / events CSV).
    With them: the landing frame is the first frame after the peak downward
    speed where the speed drops below LANDING_FRACTION of that peak.

Priority for every event: manual > C1 window > automatic.

Limitations (state these at PP1)
    - Highest wrist is a few frames before the real release.
    - At 30 fps one frame is 33 ms; events can be off by a frame or two.
"""

import numpy as np

from . import keypoints as kp
from .quality import runs

LANDING_FRACTION = 0.5
MIN_ELEVATION = 0.3        # wrist at least 0.3 trunk-lengths above the shoulder
CONTACT_SEARCH_S = 0.6     # look this far back for a foot contact


def arm_elevation(points, bowling_arm):
    """(shoulder_y - wrist_y) / trunk length, per frame (2-D, scale-free)."""
    P = np.asarray(points, dtype=float)
    side = kp.sides(bowling_arm)
    sh_id = kp.RIGHT_SHOULDER if bowling_arm == "right" else kp.LEFT_SHOULDER
    sh = (P[:, kp.LEFT_SHOULDER, :2] + P[:, kp.RIGHT_SHOULDER, :2]) / 2
    hip = (P[:, kp.LEFT_HIP, :2] + P[:, kp.RIGHT_HIP, :2]) / 2
    trunk = np.linalg.norm(sh - hip, axis=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        return (P[:, sh_id, 1] - P[:, side["wrist"], 1]) / trunk


def release_candidates(points, bowling_arm, keep=None):
    """Highest-arm frame in every usable stretch, best first: [(frame, elevation, (start, end))]."""
    elev = arm_elevation(points, bowling_arm)
    keep = np.isfinite(elev) if keep is None else (keep & np.isfinite(elev))
    out = []
    for s, e in runs(keep):
        seg = elev[s:e + 1]
        i = s + int(np.nanargmax(seg))
        if elev[i] >= MIN_ELEVATION:
            out.append((i, float(elev[i]), (s, e)))
    return sorted(out, key=lambda c: -c[1])


def detect_landing(foot_y, start, stop):
    """First frame in [start, stop) where a descending foot comes to rest (y points down)."""
    y = np.asarray(foot_y, dtype=float)
    start = max(0, start)
    stop = len(y) if stop is None else min(stop, len(y))
    if stop - start < 3:
        return None
    seg = y[start:stop]
    if np.isfinite(seg).sum() < 3:
        return None
    v = np.diff(seg)  # v[i] = y[i+1] - y[i]; > 0 means moving down
    if not np.isfinite(v).any() or np.nanmax(v) <= 0:
        return start + int(np.nanargmax(seg))  # never moves down: lowest point
    peak = int(np.nanargmax(v))
    limit = LANDING_FRACTION * v[peak]
    for i in range(peak + 1, len(v)):
        if np.isfinite(v[i]) and v[i] <= limit:
            return start + i
    return start + int(np.nanargmax(seg))


def image_y(delivery, points, keypoint):
    """Vertical image position of a keypoint (pixels), or None if C1 gave no origin."""
    if delivery.origin_px is None or delivery.scale_px is None:
        return None
    return delivery.origin_px[:, 1] + points[:, keypoint, 1] * delivery.scale_px


def detect_events(delivery, overrides=None, keep=None, points=None):
    """Return (events, method, warnings, info).

    events  {'bfc_frame','ffc_frame','release_frame'} (None when unknown)
    method  how each was found: manual / c1_window / auto / not_detected
    info    delivery stretch used and other release candidates
    """
    overrides = {k: v for k, v in (overrides or {}).items() if v is not None}
    P = delivery.points if points is None else points
    n = len(P)
    side = kp.sides(delivery.bowling_arm)
    window = delivery.window or {}
    warnings, events, method, info = [], {}, {}, {}
    win = int(round(CONTACT_SEARCH_S * delivery.fps))

    def given(name):
        if name in overrides:
            return int(overrides[name]), "manual"
        if window.get(name) is not None:
            return int(window[name]), "c1_window"
        return None, None

    # 1. Release.
    cands = release_candidates(P, delivery.bowling_arm, keep)
    info["release_candidates"] = [{"frame": f, "arm_elevation": round(e, 2), "stretch": list(r)}
                                  for f, e, r in cands[:3]]
    f, m = given("release_frame")
    if f is None and cands:
        f, m = cands[0][0], "auto"
        if len(cands) > 1 and cands[1][1] > 0.8 * cands[0][1]:
            warnings.append(f"release: two similar arm peaks (frames {cands[0][0]} and {cands[1][0]}); "
                            f"using {cands[0][0]} - check against the video")
    events["release_frame"], method["release_frame"] = f, m or "not_detected"
    rel = events["release_frame"]

    stretch = None
    if rel is not None and keep is not None and keep[min(max(rel, 0), n - 1)]:
        stretch = next((r for r in runs(keep) if r[0] <= rel <= r[1]), None)
    info["delivery_stretch"] = list(stretch) if stretch else None
    lo = stretch[0] if stretch else 0

    # 2. Foot contacts (automatic only when the image position of the feet is known).
    front_y = image_y(delivery, P, side["front_ankle"])
    back_y = image_y(delivery, P, side["back_ankle"])
    auto_contacts = front_y is not None and rel is not None

    f, m = given("ffc_frame")
    if f is None and auto_contacts:
        f, m = detect_landing(front_y, max(lo, rel - win), rel + 1), "auto"
    events["ffc_frame"], method["ffc_frame"] = f, m or "not_detected"
    ffc = events["ffc_frame"]

    f, m = given("bfc_frame")
    if f is None and auto_contacts and ffc is not None:
        f, m = detect_landing(back_y, max(lo, ffc - win), ffc), "auto"
    events["bfc_frame"], method["bfc_frame"] = f, m or "not_detected"

    if not auto_contacts and (events["ffc_frame"] is None or events["bfc_frame"] is None):
        warnings.append("BFC/FFC need the hip-centre position in the image (origin_px + scale_px "
                        "from C1) for automatic detection; until then enter them manually "
                        "(--bfc/--ffc or an events CSV). Features that need them are left empty.")

    # 3. Sanity checks.
    for name, fr in list(events.items()):
        if fr is not None and not 0 <= fr < n:
            warnings.append(f"{name}={fr} is outside the clip (0..{n - 1})")
            events[name] = None
    b, f_, r = events["bfc_frame"], events["ffc_frame"], events["release_frame"]
    if None not in (b, f_, r) and not (b < f_ <= r):
        warnings.append(f"event order looks wrong: BFC={b}, FFC={f_}, release={r} "
                        "(expected BFC < FFC <= release) - check the clip or set frames manually")
    if rel is None:
        warnings.append("release: no frame with the bowling arm above the shoulder was found")
    return events, method, warnings, info
