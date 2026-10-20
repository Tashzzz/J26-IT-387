"""Joint and segment angles, computed for every frame.

All functions take arrays of shape (frames, 3) and return (frames,) in degrees.
A frame where any input point is missing gives NaN instead of a wrong number.

Axes: x to the side, y DOWN, z depth (MediaPipe / C1 convention).
So "up" is the vector (0, -1, 0) and the horizontal (transverse) plane is x-z.
"""

import numpy as np

UP = np.array([0.0, -1.0, 0.0])


def _norm(v):
    return np.linalg.norm(v, axis=-1)


def angle_between(u, v):
    """Angle between two vectors per frame: theta = arccos(u.v / |u||v|)."""
    u = np.asarray(u, dtype=float)
    v = np.asarray(v, dtype=float)
    denom = _norm(u) * _norm(v)
    with np.errstate(invalid="ignore", divide="ignore"):
        cos = np.sum(u * v, axis=-1) / denom
    cos = np.clip(cos, -1.0, 1.0)  # rounding can push it just past +/-1
    out = np.degrees(np.arccos(cos))
    return np.where(denom > 1e-9, out, np.nan)


def joint_angle(a, b, c):
    """Included angle at joint b formed by a-b-c (e.g. hip-knee-ankle)."""
    return angle_between(np.asarray(a) - np.asarray(b), np.asarray(c) - np.asarray(b))


def knee_flexion(hip, knee, ankle):
    """Knee flexion: 0 deg = straight leg, larger = more bent.

    The proposal's "knee angle > 150 deg" (included angle) is the same as
    "flexion < 30 deg" here, because flexion = 180 - included angle.
    """
    return 180.0 - joint_angle(hip, knee, ankle)


def line_alignment(left, right):
    """Direction of the line left->right in the horizontal (x-z) plane, degrees.

    Used for the shoulder line and the hip line (transverse-plane alignment).
    A line has no arrow, so the value is only meaningful modulo 180;
    use wrap180() when comparing two alignments.
    """
    d = np.asarray(right, dtype=float) - np.asarray(left, dtype=float)
    return np.degrees(np.arctan2(d[..., 2], d[..., 0]))


def wrap180(delta):
    """Difference between two line alignments, wrapped to [-90, 90)."""
    return (np.asarray(delta) + 90.0) % 180.0 - 90.0


def trunk_lateral_flexion(left_hip, right_hip, left_shoulder, right_shoulder):
    """Side-bend of the trunk, degrees from vertical, in the pelvis frontal plane.

    trunk   = mid-hip -> mid-shoulder
    lateral = hip line, made horizontal
    The trunk is projected onto the plane spanned by "up" and "lateral",
    and the angle from vertical in that plane is returned (always >= 0).
    Using the pelvis frame keeps the value independent of camera direction,
    as long as the depth (z) estimate is reasonable.
    """
    lh, rh = np.asarray(left_hip, float), np.asarray(right_hip, float)
    ls, rs = np.asarray(left_shoulder, float), np.asarray(right_shoulder, float)
    trunk = (ls + rs) / 2.0 - (lh + rh) / 2.0

    lateral = rh - lh
    lateral = lateral - np.sum(lateral * UP, axis=-1, keepdims=True) * UP  # remove vertical part
    lat_len = _norm(lateral)
    with np.errstate(invalid="ignore", divide="ignore"):
        lateral = lateral / lat_len[..., None]

    up_part = np.sum(trunk * UP, axis=-1)
    side_part = np.sum(trunk * lateral, axis=-1)
    out = np.degrees(np.arctan2(np.abs(side_part), up_part))
    return np.where(lat_len > 1e-9, out, np.nan)


def _xy(p):
    """Drop depth: keep image x, y and set z to 0 (2-D angle in the image plane)."""
    p = np.array(p, dtype=float)
    p[..., 2] = 0.0
    return p


def trunk_tilt_2d(left_hip, right_hip, left_shoulder, right_shoulder):
    """Trunk angle from the image vertical, in the image plane (degrees, >= 0).

    With a front-on (or rear) camera the image plane is the bowler's frontal
    plane, so this is the trunk side-bend without using the noisy depth (z).
    """
    lh, rh, ls, rs = (np.asarray(a, float)[..., :2] for a in
                      (left_hip, right_hip, left_shoulder, right_shoulder))
    trunk = (ls + rs) / 2.0 - (lh + rh) / 2.0
    return angle_between(np.pad(trunk, [(0, 0)] * (trunk.ndim - 1) + [(0, 1)]), UP)


def angle_series(points, bowling_arm):
    """All C2 angle time series for one delivery.

    points: (frames, 33, 3). Returns a dict of name -> (frames,) arrays.
    "_3d" uses x, y, z; "_2d" uses image x, y only (z is MediaPipe's weakest axis).
    Which one a feature uses depends on the camera view (see features.VIEW_METHOD).
    """
    from . import keypoints as kp

    s = kp.sides(bowling_arm)
    P = points
    shoulder_align = line_alignment(P[:, kp.LEFT_SHOULDER], P[:, kp.RIGHT_SHOULDER])
    hip_align = line_alignment(P[:, kp.LEFT_HIP], P[:, kp.RIGHT_HIP])
    leg = (P[:, s["front_hip"]], P[:, s["front_knee"]], P[:, s["front_ankle"]])
    trunk = (P[:, kp.LEFT_HIP], P[:, kp.RIGHT_HIP], P[:, kp.LEFT_SHOULDER], P[:, kp.RIGHT_SHOULDER])
    return {
        "shoulder_alignment_deg": shoulder_align,
        "hip_alignment_deg": hip_align,
        "hip_shoulder_separation_deg": np.abs(wrap180(shoulder_align - hip_align)),
        "front_knee_flexion_3d_deg": knee_flexion(*leg),
        "front_knee_flexion_2d_deg": knee_flexion(*(_xy(p) for p in leg)),
        "trunk_lateral_flexion_3d_deg": trunk_lateral_flexion(*trunk),
        "trunk_lateral_flexion_2d_deg": trunk_tilt_2d(*trunk),
    }
