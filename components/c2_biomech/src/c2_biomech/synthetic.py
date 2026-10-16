"""Synthetic delivery with KNOWN angles, in the C1 contract format.

Purpose: testing only. Because the true SCR, knee flexion and trunk side-bend
are set by hand, the tests can check that C2 recovers them (a unit test with a
known answer). It is NOT bowler data and must be labelled "synthetic" if shown.

The skeleton is simple: a hip line, a trunk, a shoulder line, two legs and a
bowling arm, hip-centred, y pointing down (same as C1's normalised output).
"""

import numpy as np

from . import keypoints as kp


def make_delivery(
    fps=60.0,
    n_frames=60,
    bfc=15,
    ffc=30,
    release=42,
    scr_deg=35.0,           # true shoulder counter-rotation between BFC and FFC
    separation_bfc=20.0,    # hip vs shoulder line at BFC
    knee_ffc=25.0,          # front-knee flexion at FFC
    knee_release=15.0,      # front-knee flexion at release
    trunk_release=42.0,     # trunk side-bend at release
    bowling_arm="right",
    noise=0.0,              # std of Gaussian noise added to every coordinate
    missing=None,           # list of (frame, keypoint) to set to null
    seed=0,
    video_id="SYN_D01_front_10m",
    view="front",           # the synthetic skeleton's image plane is the frontal plane
    with_origin=True,       # include origin_px/scale_px so foot contacts can be auto-detected
):
    rng = np.random.default_rng(seed)
    side = kp.sides(bowling_arm)
    t = np.arange(n_frames)
    up = np.array([0.0, -1.0, 0.0])

    # Hip alignment stays fixed; shoulders counter-rotate between BFC and FFC.
    hip_align = np.full(n_frames, 0.0)
    shoulder = np.full(n_frames, separation_bfc)
    w = (t >= bfc) & (t <= ffc)
    # Smooth hump (zero slope at both ends, like real motion): 0 at BFC,
    # scr_deg halfway, back to 0 at FFC.
    shoulder[w] += scr_deg * np.sin(np.pi * (t[w] - bfc) / (ffc - bfc)) ** 2
    after = t > ffc
    shoulder[after] = separation_bfc - 0.15 * (t[after] - ffc) ** 2  # rotates forward, smooth start

    # Knee flexion and trunk side-bend over time.
    knee = np.interp(t, [0, ffc, release, n_frames - 1], [15.0, knee_ffc, knee_release, knee_release])
    trunk_tilt = np.interp(t, [0, bfc, release, n_frames - 1], [0.0, 0.0, trunk_release, trunk_release])

    # Foot heights above their planted level (0 = on the ground). Linear descent,
    # then an abrupt stop, like a real foot strike.
    def landing_lift(contact, height=0.4, duration=8, lift_off=None):
        lift = np.where(t < contact - duration, height, height * (contact - t) / duration)
        lift = np.clip(lift, 0, height)
        if lift_off is not None:
            lift = np.where(t > lift_off, 0.05 * (t - lift_off), lift)
        return lift

    front_lift = landing_lift(ffc)
    back_lift = landing_lift(bfc, lift_off=ffc + 4)

    # Bowling arm swings from down (0 deg) to straight up (180 deg) at release.
    arm = np.interp(t, [0, release, n_frames - 1], [0.0, 180.0, 300.0])

    frames = []
    for i in range(n_frames):
        lm = np.zeros((33, 3))
        h = np.radians(hip_align[i])
        s = np.radians(shoulder[i])
        lat_h = np.array([np.cos(h), 0.0, np.sin(h)])
        lat_s = np.array([np.cos(s), 0.0, np.sin(s)])
        fwd = np.array([-np.sin(h), 0.0, np.cos(h)])

        # Hips (left at +lat, right at -lat).
        lm[kp.LEFT_HIP], lm[kp.RIGHT_HIP] = 0.3 * lat_h, -0.3 * lat_h

        # Trunk tilted sideways in the pelvis frontal plane.
        th = np.radians(trunk_tilt[i])
        mid_sh = 1.7 * (np.cos(th) * up + np.sin(th) * lat_h)
        lm[kp.LEFT_SHOULDER], lm[kp.RIGHT_SHOULDER] = mid_sh + 0.5 * lat_s, mid_sh - 0.5 * lat_s
        lm[0:11] = mid_sh + 0.6 * up  # head points

        # Legs: thigh slightly forward, shank bent back by the flexion angle.
        down = -up
        for hip_id, knee_id, ankle_id, flex, lift in (
            (side["front_hip"], side["front_knee"], side["front_ankle"], knee[i], front_lift[i]),
            (24 if side["front_hip"] == 23 else 23, 26 if side["front_knee"] == 25 else 25,
             side["back_ankle"], 10.0, back_lift[i]),
        ):
            a = np.radians(20.0)
            b = np.radians(20.0 - flex)
            knee_p = lm[hip_id] + 1.0 * (np.cos(a) * down + np.sin(a) * fwd)
            ankle_p = knee_p + 1.0 * (np.cos(b) * down + np.sin(b) * fwd)
            # Lift the whole lower leg so the hip-knee-ankle angle is unchanged.
            shift = lift * up
            lm[knee_id], lm[ankle_id] = knee_p + shift, ankle_p + shift
            lm[ankle_id + 2] = lm[ankle_id] - 0.1 * fwd + 0.05 * down   # heel
            lm[ankle_id + 4] = lm[ankle_id] + 0.2 * fwd + 0.05 * down   # foot index

        # Arms.
        for sh_id, el_id, wr_id, ang in (
            (kp.RIGHT_SHOULDER if bowling_arm == "right" else kp.LEFT_SHOULDER,
             kp.RIGHT_ELBOW if bowling_arm == "right" else kp.LEFT_ELBOW, side["wrist"], arm[i]),
            (kp.LEFT_SHOULDER if bowling_arm == "right" else kp.RIGHT_SHOULDER,
             kp.LEFT_ELBOW if bowling_arm == "right" else kp.RIGHT_ELBOW,
             kp.LEFT_WRIST if bowling_arm == "right" else kp.RIGHT_WRIST, 90.0),
        ):
            r = np.radians(ang)
            d = np.cos(r) * down + np.sin(r) * fwd
            # Swing the arm from a fixed height so the wrist peaks exactly at the
            # set release frame (keeps the known-answer test exact).
            base = lm[sh_id].copy()
            base[1] = -1.7
            lm[el_id] = base + 0.6 * d
            lm[wr_id] = base + 1.2 * d
            for extra in (2, 4, 6):  # pinky, index, thumb next to the wrist
                lm[wr_id + extra] = lm[wr_id] + 0.05 * d

        if noise:
            lm = lm + rng.normal(0.0, noise, lm.shape)
        landmarks = [[round(float(v), 5) for v in p] + [0.95] for p in lm]
        frame = {"t": round(i / fps, 4), "landmarks": landmarks}
        if with_origin:
            frame["origin_px"] = [0.0, 0.0]  # hips stay put, so image = hip-centred coords
        frames.append(frame)

    for f, k in missing or []:
        frames[f]["landmarks"][k] = None

    return {
        "video_id": video_id,
        "fps": fps,
        "bowling_arm": bowling_arm,
        "model": "synthetic",
        "conditions": {"distance_m": 10, "angle": view, "lighting": "daylight", "device": "synthetic"},
        "window": {},
        "normalisation": {"origin": "hip_centre", "scale": "shoulder_width", "filter": "none (synthetic)",
                          **({"scale_px": 1.0} if with_origin else {})},
        "frames": frames,
        "reliability": {},
        "_truth": {
            "bfc_frame": bfc, "ffc_frame": ffc, "release_frame": release,
            "shoulder_counter_rotation_deg": scr_deg, "hip_shoulder_separation_bfc_deg": separation_bfc,
            "front_knee_flexion_ffc_deg": knee_ffc, "front_knee_flexion_release_deg": knee_release,
            "trunk_lateral_flexion_deg": trunk_release,
        },
    }
