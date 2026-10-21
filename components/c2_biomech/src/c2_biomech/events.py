"""Detect the delivery and its three events from keypoint tracks.

    BFC  back-foot contact   the back foot lands at the start of the delivery stride
    FFC  front-foot contact  the front foot lands
    REL  ball release

Ball release (automatic, works on C1's hip-centred keypoints)
    Arm elevation = how far the bowling wrist is above the bowling shoulder,
    divided by the trunk length in the same frame (so it does not change when
    the bowler runs towards the camera and gets bigger). Release is the FIRST
    arm-elevation peak that reaches RELEASE_PEAK_RATIO of the clip's highest
    peak. Not simply the highest: bowlers often lift the arm again after the
    follow-through, and on 3 of 13 real clips (B02_D01, B02_D02, B03_D04) that
    later lift was higher than the release. Checked against release frames
    marked by hand from the videos (19 Oct): highest-peak rule mean error 4.9
    frames (max 23); first-strong-peak rule 0.08 frames (max 1). The 0.6 ratio
    was chosen on those same 13 clips - re-check it on new data.

Foot contacts - two automatic methods
    1. With the hip-centre position in the image (origin_px per frame + scale_px
       from C1): a foot lands when it stops moving DOWN in the image - the first
       frame after the peak downward speed where the speed drops below
       LANDING_FRACTION of that peak.
    2. Without it (C1's current files are hip-centred only), "estimated":
       timing gives the search window, the foot movement relative to the hips
       picks the frame:
         FFC  = FFC_AFTER_MAX_REACH_S after the frame where the leading foot
                reaches furthest forward of the hips (searched FFC_BEFORE_RELEASE_S
                +/- CONTACT_WINDOW_S before release): the foot reaches furthest
                just before it lands. Left/right labels can swap in side-on video,
                so the leading foot is whichever ankle reaches furthest.
         BFC  = the frame where the other (back) foot is lowest below the hips,
                searched BFC_BEFORE_FFC_S +/- CONTACT_WINDOW_S before FFC.
       Checked against frames marked by hand on 13 clips (3 bowlers, 30/60 fps,
       leave-one-out): side-on FFC within 2 frames (mean 15 ms), BFC within 4
       frames (mean 27 ms); all views FFC within 3, BFC within 4 frames. The two
       timings are medians of those 13 clips - re-check them on new bowlers.

Release from the trained model (event_ml.py, added 21 Oct 2026)
    When no manual / C1 release is given, the XGBoost release model is tried first and
    used when its confidence is at least event_ml.MIN_CONFIDENCE; otherwise the rule above.
    Leave-one-bowler-out on 20 hand-labelled deliveries (11 bowlers): on the consented
    real-speed clips the hybrid found release within 1 frame on 82 % (rule alone 64 %),
    mean error 15 ms (rule 101 ms). Details: event_model/models/README.md.

Priority for release: manual > C1 window > model > rule.
Priority for foot contacts: manual > C1 window > image position > estimated.

Limitations (state these at PP1)
    - Highest wrist is a few frames before the real release.
    - At 30 fps one frame is 33 ms; events can be off by a frame or two.
"""

import numpy as np

from . import keypoints as kp
from .quality import runs

LANDING_FRACTION = 0.5
MIN_ELEVATION = 0.3        # wrist at least 0.3 trunk-lengths above the shoulder
RELEASE_PEAK_RATIO = 0.6   # first peak reaching 60% of the highest peak = release
PEAK_SEPARATION_S = 0.15   # peaks closer than this count as one
CONTACT_SEARCH_S = 0.6     # look this far back for a foot contact
FFC_BEFORE_RELEASE_S = 0.17  # median FFC -> release time, 13 hand-marked clips
BFC_BEFORE_FFC_S = 0.15      # median BFC -> FFC time, same clips
CONTACT_WINDOW_S = 0.07      # search +/- this around those times
# The front foot reaches furthest forward BEFORE it touches the ground. On 11 hand-labelled
# side-on clips (2 bowlers, 30/60 fps, 21 Oct 2026) "furthest reach" was early on every clip
# (mean 67 ms). FFC = furthest reach + this delay; leave-one-clip-out error 18 ms, 10 of 11
# within 1 frame (was 67 ms, 3 of 11). Re-check on new bowlers.
FFC_AFTER_MAX_REACH_S = 0.067


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


def arm_peaks(elev, usable, fps):
    """Local maxima of arm elevation in usable frames, earliest first: [(frame, elevation)]."""
    e = np.where(usable, elev, np.nan)
    if not np.isfinite(e).any():
        return []
    sep = max(1, int(round(PEAK_SEPARATION_S * fps)))
    out = []
    for i in range(len(e)):
        if not np.isfinite(e[i]) or e[i] < MIN_ELEVATION:
            continue
        lo, hi = max(0, i - sep), min(len(e), i + sep + 1)
        if e[i] >= np.nanmax(e[lo:hi]) and (not out or i - out[-1][0] > sep):
            out.append((i, float(e[i])))
    return out


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


def estimate_contacts(points, fps, release):
    """BFC and FFC from hip-centred keypoints only (method 2 in the module docstring).

    Returns (bfc, ffc); either can be None when the feet are not tracked there.
    """
    P = np.asarray(points, dtype=float)
    n = len(P)
    hip = (P[:, kp.LEFT_HIP] + P[:, kp.RIGHT_HIP]) / 2
    ankles = [P[:, kp.LEFT_ANKLE] - hip, P[:, kp.RIGHT_ANKLE] - hip]
    w = max(1, int(round(CONTACT_WINDOW_S * fps)))

    # FFC: leading foot = the ankle furthest from the hips (horizontally) near the expected time.
    guess = release - int(round(FFC_BEFORE_RELEASE_S * fps))
    a, b = max(0, guess - w), min(n, release + 1, guess + w + 1)
    if b <= a:
        return None, None
    reach = [np.nanmax(np.abs(x[a:b, 0])) if np.isfinite(x[a:b, 0]).any() else -1.0 for x in ankles]
    lead = int(np.argmax(reach))
    if reach[lead] < 0:
        return None, None
    seg = np.abs(ankles[lead][a:b, 0])
    direction = np.sign(ankles[lead][a + int(np.nanargmax(seg)), 0])  # which way the bowler runs
    reach = a + int(np.nanargmax(direction * ankles[lead][a:b, 0]))
    ffc = min(reach + int(round(FFC_AFTER_MAX_REACH_S * fps)), release)

    # BFC: the back foot at its lowest below the hips (y points down) near the expected time.
    # Timed from the furthest-reach frame, as when the BFC timing was measured.
    back_y = ankles[1 - lead][:, 1]
    guess = reach - int(round(BFC_BEFORE_FFC_S * fps))
    a, b = max(0, guess - w), min(ffc, guess + w + 1)
    if b <= a or not np.isfinite(back_y[a:b]).any():
        return None, ffc
    return a + int(np.nanargmax(back_y[a:b])), ffc


def image_y(delivery, points, keypoint):
    """Vertical image position of a keypoint (pixels), or None if C1 gave no origin."""
    if delivery.origin_px is None or delivery.scale_px is None:
        return None
    return delivery.origin_px[:, 1] + points[:, keypoint, 1] * delivery.scale_px


def detect_events(delivery, overrides=None, keep=None, points=None):
    """Return (events, method, warnings, info).

    events  {'bfc_frame','ffc_frame','release_frame'} (None when unknown)
    method  how each was found: manual / c1_window / model / auto / estimated / not_detected
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

    # 1. Release: first strong arm peak (see module docstring).
    usable = np.ones(n, dtype=bool) if keep is None else keep
    elev = arm_elevation(P, delivery.bowling_arm)
    peaks = arm_peaks(elev, usable, delivery.fps)
    top = max((e for _, e in peaks), default=None)
    strong = [(fr, e) for fr, e in peaks if top is not None and e >= RELEASE_PEAK_RATIO * top]
    info["release_candidates"] = [{"frame": fr, "arm_elevation": round(e, 2)} for fr, e in strong[:3]]
    f, m = given("release_frame")
    if f is None:
        # Trained model first (event_ml.py); the rule below is the fallback when the model
        # is off, missing or not confident.
        try:
            from . import event_ml
            mf, conf = event_ml.predict_release(P, delivery.bowling_arm, delivery.fps, usable)
        except Exception as exc:  # never let the model break the pipeline
            mf, conf = None, None
            info["release_model_error"] = str(exc)
        info["release_model"] = {"frame": mf, "confidence": None if conf is None else round(conf, 3),
                                 "rule_frame": strong[0][0] if strong else None}
        if mf is not None:
            f, m = mf, "model"
    if f is None and strong:
        f, m = strong[0][0], "auto"
        if len(strong) > 1:
            later = ", ".join(str(fr) for fr, _ in strong[1:3])
            warnings.append(f"release: two similar arm peaks (using the first, frame {f}; later peak at "
                            f"frame {later} is probably the arm lifted after the follow-through) "
                            "- check against the video")
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

    # 2b. No image position: estimate from foot movement relative to the hips.
    if not auto_contacts and rel is not None and (events["ffc_frame"] is None or events["bfc_frame"] is None):
        est_bfc, est_ffc = estimate_contacts(P, delivery.fps, rel)
        if events["ffc_frame"] is None and est_ffc is not None:
            events["ffc_frame"], method["ffc_frame"] = est_ffc, "estimated"
        ffc = events["ffc_frame"]
        if events["bfc_frame"] is None and ffc is not None:
            if method["ffc_frame"] != "estimated":  # FFC given by hand: estimate BFC from that FFC
                est_bfc, _ = estimate_contacts(P, delivery.fps, ffc + int(round(FFC_BEFORE_RELEASE_S * delivery.fps)))
            if est_bfc is not None and est_bfc < ffc:
                events["bfc_frame"], method["bfc_frame"] = est_bfc, "estimated"
        if "estimated" in (method["bfc_frame"], method["ffc_frame"]):
            warnings.append("BFC/FFC estimated from foot movement (checked on 13 hand-marked clips: "
                            "within 2-4 frames) - check against the video, or type the frames to correct them.")
        if events["ffc_frame"] is None or events["bfc_frame"] is None:
            warnings.append("BFC/FFC could not be estimated (feet not tracked around the delivery); "
                            "type the frames to fill the features that need them.")

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
