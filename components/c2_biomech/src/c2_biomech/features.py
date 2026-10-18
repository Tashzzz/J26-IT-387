"""Compute the C2 feature row for one delivery (key functions 1 + 2).

Steps
    quality gate (quality.py)  drop detections that cannot be the bowler
    Butterworth (filtering.py) mask low visibility, fill short gaps, 4th-order zero-lag low-pass
    events (events.py)         release (auto), BFC / FFC (auto if image position known, else manual)
    angles (angles.py)         2-D or 3-D depending on the camera view
    thresholds                 published limits -> breach, red / amber / green

Features (degrees):
    shoulder_counter_rotation_deg   largest twist of the shoulder line away from its
                                    BFC alignment, between BFC and FFC
    front_knee_flexion_ffc_deg      front-knee bend at FFC
    front_knee_flexion_release_deg  front-knee bend at release
    trunk_lateral_flexion_deg       trunk side-bend at release
    hip_shoulder_separation_bfc_deg hip line vs shoulder line at BFC

Camera view (one camera can only measure angles that lie in the image plane well):
    front / rear  image plane = frontal plane  -> trunk side-bend in 2-D (good)
    side          image plane = sagittal plane -> knee bend in 2-D (good)
    anything that needs depth (z) is computed in 3-D and marked view_suitability
    "limited" or "poor"; "poor" features are reported but marked not reliable.
    Shoulder counter-rotation and hip-shoulder separation are rotations about the
    vertical axis, i.e. mostly depth, from every single-camera view.

Output follows contracts/c2_features.schema.json. Extra fields per feature are
allowed by the schema and used by the app.
"""

from dataclasses import replace

import numpy as np
import pandas as pd

from . import keypoints as kp
from .angles import angle_series, wrap180
from .events import arm_elevation, detect_events
from .filtering import filter_delivery, max_cutoff, residual_analysis
from .c1_reliability import reliability_for
from .quality import gate
from .thresholds import THRESHOLDS, classify

EVENT_TOLERANCE = 1     # if a keypoint is missing exactly at an event, look +/- this many frames
DEFAULT_CUTOFF_HZ = 8.0  # agreed with C1 (stabilise.py used 8 Hz); must stay below fps / 2

# feature -> view -> (angle method, view suitability)
VIEW_METHOD = {
    # From the B01 clips (labels corrected by C1 on 18 Oct): semi-side 3-D knee gave
    # 31/33/77/99 deg on four clips of one bowler, semi-side 3-D trunk 40-78 deg -> depth too noisy.
    "front_knee": {"side": ("2d", "good"), "semi_side": ("3d", "poor"),
                   "front": ("3d", "poor"), "rear": ("3d", "poor")},
    "trunk_lateral": {"front": ("2d", "good"), "rear": ("2d", "good"),
                      "semi_side": ("3d", "poor"), "side": ("3d", "poor")},
    "transverse": {},  # SCR, hip-shoulder separation: always 3-D, poor from one camera
}
DEFAULT_METHOD = {"front_knee": ("3d", "limited"), "trunk_lateral": ("3d", "limited"),
                  "transverse": ("3d", "poor")}


def view_method(kind, view):
    return VIEW_METHOD[kind].get(view, DEFAULT_METHOD[kind])


def value_at(series, frame, tol=EVENT_TOLERANCE):
    """Value of a series at a frame, or the nearest valid value within +/- tol frames."""
    if frame is None:
        return None
    for d in [0] + [s * k for k in range(1, tol + 1) for s in (-1, 1)]:
        i = frame + d
        if 0 <= i < len(series) and np.isfinite(series[i]):
            return float(series[i])
    return None


def shoulder_counter_rotation(shoulder_align, bfc, ffc):
    """Max |change| in shoulder alignment from its BFC value, over BFC..FFC."""
    if bfc is None or ffc is None or ffc <= bfc:
        return None
    ref = value_at(shoulder_align, bfc)
    if ref is None:
        return None
    seg = shoulder_align[bfc:ffc + 1]
    dev = np.abs(wrap180(seg - ref))
    if not np.isfinite(dev).any():
        return None
    return float(np.nanmax(dev))


def keypoint_reliable(names, reliability):
    """True unless C1's ICC gate marked one of these keypoints unusable.

    A keypoint C1 has not assessed yet is not counted against the feature,
    but it is listed in 'unchecked' so the app / report can show it.
    """
    unusable = [n for n in names if n in reliability and not reliability[n].get("usable", True)]
    unchecked = [n for n in names if n not in reliability]
    return len(unusable) == 0, unusable, unchecked


def compute_features(delivery, overrides=None, thresholds=None, filter_mode="auto",
                     cutoff=DEFAULT_CUTOFF_HZ):
    """Run the whole C2 pipeline on one Delivery.

    filter_mode "auto" (filter unless C1 already did) / "on" / "off".
    cutoff      Hz, or "auto" for Winter's residual analysis. Capped below fps / 2.

    Returns:
        row        dict in the C2 contract format (for C3 and the app)
        series     DataFrame of every angle per frame, filtered and raw (for plots)
    """
    thresholds = thresholds or THRESHOLDS
    warnings = []

    # 1. Quality gate on the raw keypoints.
    gated, keep, quality = gate(delivery.points)
    if not keep.any():
        warnings.append("no frame passed the quality gate (no plausible bowler skeleton)")
    delivery = replace(delivery, points=gated)

    # 2. Butterworth filter.
    if cutoff != "auto" and float(cutoff) > max_cutoff(delivery.fps):
        warnings.append(f"cutoff {cutoff} Hz is too high for {delivery.fps:g} fps; "
                        f"using {max_cutoff(delivery.fps):g} Hz")
        cutoff = max_cutoff(delivery.fps)
    filtered, raw_points, filter_info = filter_delivery(delivery, filter_mode, cutoff)
    residual_curve = filter_info.pop("_residual_curve")
    delivery = replace(delivery, points=filtered)

    # 3. Events. Frames refilled by short-gap interpolation count as usable again.
    usable = keep | np.isfinite(filtered[:, [kp.LEFT_SHOULDER, kp.RIGHT_SHOULDER,
                                             kp.LEFT_HIP, kp.RIGHT_HIP], 0]).all(axis=1)
    events, method, ev_warnings, ev_info = detect_events(delivery, overrides, usable)
    warnings += ev_warnings
    bfc, ffc, rel = events["bfc_frame"], events["ffc_frame"], events["release_frame"]

    # Residual analysis on the delivery itself (+/- 0.5 s around release). Over the whole
    # clip it is dominated by the slow run-up and suggests a cutoff that is too low.
    if rel is not None:
        half = int(round(0.5 * delivery.fps))
        a, b = max(0, rel - half), min(len(raw_points), rel + half + 1)
        local = residual_analysis(raw_points[a:b], delivery.fps)
        filter_info["residual_analysis_delivery_cutoff_hz"] = local["cutoff_hz"]
        filter_info["residual_analysis_delivery_window"] = [a, b - 1]
        residual_curve = {"whole_clip": residual_curve, "delivery": local}

    # 4. Angles (view-dependent 2-D / 3-D choice).
    view = delivery.view
    ang = angle_series(delivery.points, delivery.bowling_arm)
    knee_m, knee_s = view_method("front_knee", view)
    trunk_m, trunk_s = view_method("trunk_lateral", view)
    rot_m, rot_s = view_method("transverse", view)
    knee = ang[f"front_knee_flexion_{knee_m}_deg"]
    trunk_lat = ang[f"trunk_lateral_flexion_{trunk_m}_deg"]

    s = kp.sides(delivery.bowling_arm)
    front_leg = [kp.NAMES[s["front_hip"]], kp.NAMES[s["front_knee"]], kp.NAMES[s["front_ankle"]]]
    trunk = ["left_hip", "right_hip", "left_shoulder", "right_shoulder"]

    raw = {
        "shoulder_counter_rotation_deg":
            (shoulder_counter_rotation(ang["shoulder_alignment_deg"], bfc, ffc),
             "bfc_to_ffc", ["left_shoulder", "right_shoulder"], rot_m, rot_s),
        "front_knee_flexion_ffc_deg":
            (value_at(knee, ffc), "ffc", front_leg, knee_m, knee_s),
        "front_knee_flexion_release_deg":
            (value_at(knee, rel), "release", front_leg, knee_m, knee_s),
        "trunk_lateral_flexion_deg":
            (value_at(trunk_lat, rel), "release", trunk, trunk_m, trunk_s),
        "hip_shoulder_separation_bfc_deg":
            (value_at(ang["hip_shoulder_separation_deg"], bfc), "bfc", trunk, rot_m, rot_s),
    }

    reliability, reliability_source = reliability_for(delivery)
    features = {}
    for name, (value, event, used, meth, suit) in raw.items():
        t = thresholds[name]
        breach, level = classify(name, value, thresholds)
        ok, unusable, unchecked = keypoint_reliable(used, reliability)
        features[name] = {
            "value": None if value is None else round(value, 1),
            "threshold": t["threshold"],
            "rule": t["rule"],
            "breach": breach,
            "level": level,
            "reliable": bool(ok and value is not None and suit != "poor"),
            "source": t["source"],
            "event": event,
            "method": meth,
            "view_suitability": suit,
            "keypoints": used,
        }
        if unusable:
            features[name]["unusable_keypoints"] = unusable
        if unchecked and reliability:
            features[name]["unchecked_keypoints"] = unchecked
        if value is None:
            warnings.append(f"{name}: no value (event or keypoints missing)")

    row = {
        "video_id": delivery.video_id,
        "bowler_id": delivery.bowler_id,
        "events": {k: v for k, v in events.items() if v is not None},
        "features": features,
        "event_method": method,
        "n_breaches": sum(f["breach"] for f in features.values()),
        "view": view,
        "fps": delivery.fps,
        "delivery": ev_info,
        "quality": quality,
        "keypoint_reliability_source": reliability_source,
        "filter": filter_info,
        "warnings": warnings,
        "c2_version": "0.2.0",
    }

    series = pd.DataFrame({"frame": np.arange(delivery.n_frames), "t": delivery.times})
    for name, values in ang.items():
        series[name] = np.round(values, 2)
    series["front_knee_flexion_deg"] = series[f"front_knee_flexion_{knee_m}_deg"]
    series["trunk_lateral_flexion_deg"] = series[f"trunk_lateral_flexion_{trunk_m}_deg"]
    series["arm_elevation"] = np.round(arm_elevation(delivery.points, delivery.bowling_arm), 3)
    series["kept"] = keep.astype(int)
    # Shoulder twist relative to its BFC alignment (SCR is its peak between BFC and FFC).
    ref = value_at(ang["shoulder_alignment_deg"], bfc)
    series["shoulder_rotation_from_bfc_deg"] = (
        np.round(wrap180(ang["shoulder_alignment_deg"] - ref), 2) if ref is not None else np.nan)

    # Same angles from the unfiltered keypoints, for the raw-vs-filtered evidence plot.
    raw_ang = angle_series(raw_points, delivery.bowling_arm)
    series["raw_front_knee_flexion_deg"] = np.round(raw_ang[f"front_knee_flexion_{knee_m}_deg"], 2)
    series["raw_trunk_lateral_flexion_deg"] = np.round(raw_ang[f"trunk_lateral_flexion_{trunk_m}_deg"], 2)
    w = s["wrist"]
    series["raw_wrist_y"] = np.round(raw_points[:, w, 1], 5)
    series["wrist_y"] = np.round(filtered[:, w, 1], 5)
    series.attrs["residual_curve"] = residual_curve
    return row, series
