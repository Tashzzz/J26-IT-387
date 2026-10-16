"""Compute the C2 feature row for one delivery (key functions 1 + 2).

Steps: Butterworth filter (filtering.py) -> events -> angles -> features -> thresholds.

Features (degrees):
    shoulder_counter_rotation_deg   largest twist of the shoulder line away from its
                                    BFC alignment, between BFC and FFC
    front_knee_flexion_ffc_deg      front-knee bend at FFC
    front_knee_flexion_release_deg  front-knee bend at release
    trunk_lateral_flexion_deg       trunk side-bend at release
    hip_shoulder_separation_bfc_deg hip line vs shoulder line at BFC

Output follows contracts/c2_features.schema.json. Extra fields per feature
(rule, level, event, keypoints) are allowed by the schema and used by the app.
"""

from dataclasses import replace

import numpy as np
import pandas as pd

from . import keypoints as kp
from .angles import angle_series, wrap180
from .events import detect_events
from .filtering import filter_delivery
from .thresholds import THRESHOLDS, classify

EVENT_TOLERANCE = 1  # if a keypoint is missing exactly at an event, look +/- this many frames


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


def compute_features(delivery, overrides=None, thresholds=None, filter_mode="auto", cutoff="auto"):
    """Run the whole C2 pipeline on one Delivery.

    filter_mode / cutoff: see filtering.filter_delivery ("auto" = residual analysis).

    Returns:
        row        dict in the C2 contract format (for C3 and the app)
        series     DataFrame of every angle per frame, filtered and raw (for plots)
    """
    thresholds = thresholds or THRESHOLDS
    filtered, raw_points, filter_info = filter_delivery(delivery, filter_mode, cutoff)
    residual_curve = filter_info.pop("_residual_curve")
    delivery = replace(delivery, points=filtered)

    events, method, warnings = detect_events(delivery, overrides)
    bfc, ffc, rel = events["bfc_frame"], events["ffc_frame"], events["release_frame"]

    ang = angle_series(delivery.points, delivery.bowling_arm)
    s = kp.sides(delivery.bowling_arm)
    front_leg = [kp.NAMES[s["front_hip"]], kp.NAMES[s["front_knee"]], kp.NAMES[s["front_ankle"]]]
    trunk = ["left_hip", "right_hip", "left_shoulder", "right_shoulder"]

    raw = {
        "shoulder_counter_rotation_deg":
            (shoulder_counter_rotation(ang["shoulder_alignment_deg"], bfc, ffc),
             "bfc_to_ffc", ["left_shoulder", "right_shoulder"]),
        "front_knee_flexion_ffc_deg":
            (value_at(ang["front_knee_flexion_deg"], ffc), "ffc", front_leg),
        "front_knee_flexion_release_deg":
            (value_at(ang["front_knee_flexion_deg"], rel), "release", front_leg),
        "trunk_lateral_flexion_deg":
            (value_at(ang["trunk_lateral_flexion_deg"], rel), "release", trunk),
        "hip_shoulder_separation_bfc_deg":
            (value_at(ang["hip_shoulder_separation_deg"], bfc), "bfc", trunk),
    }

    features = {}
    for name, (value, event, used) in raw.items():
        t = thresholds[name]
        breach, level = classify(name, value, thresholds)
        ok, unusable, unchecked = keypoint_reliable(used, delivery.reliability)
        features[name] = {
            "value": None if value is None else round(value, 1),
            "threshold": t["threshold"],
            "rule": t["rule"],
            "breach": breach,
            "level": level,
            "reliable": bool(ok and value is not None),
            "source": t["source"],
            "event": event,
            "keypoints": used,
        }
        if unusable:
            features[name]["unusable_keypoints"] = unusable
        if unchecked and delivery.reliability:
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
        "filter": filter_info,
        "warnings": warnings,
        "c2_version": "0.1.0",
    }

    series = pd.DataFrame({"frame": np.arange(delivery.n_frames), "t": delivery.times})
    for name, values in ang.items():
        series[name] = np.round(values, 2)
    # Shoulder twist relative to its BFC alignment: SCR is the peak of this
    # between BFC and FFC, so it can be read straight off the plot.
    ref = value_at(ang["shoulder_alignment_deg"], bfc)
    series["shoulder_rotation_from_bfc_deg"] = (
        np.round(wrap180(ang["shoulder_alignment_deg"] - ref), 2) if ref is not None else np.nan)

    # Same angles from the unfiltered keypoints, for the raw-vs-filtered evidence plot.
    raw_ang = angle_series(raw_points, delivery.bowling_arm)
    for name in ("front_knee_flexion_deg", "trunk_lateral_flexion_deg", "shoulder_alignment_deg"):
        series[f"raw_{name}"] = np.round(raw_ang[name], 2)
    # One keypoint trace (bowling wrist height) to show the filter on raw coordinates.
    w = kp.sides(delivery.bowling_arm)["wrist"]
    series["raw_wrist_y"] = np.round(raw_points[:, w, 1], 5)
    series["wrist_y"] = np.round(filtered[:, w, 1], 5)
    series.attrs["residual_curve"] = residual_curve  # plain lists: safe in attrs
    return row, series
