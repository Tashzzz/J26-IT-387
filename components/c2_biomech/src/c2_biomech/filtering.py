"""Signal filtering: 4th-order zero-lag Butterworth low-pass (C2 pipeline step 1).

Why
    MediaPipe keypoints jitter from frame to frame. Angles are computed from
    differences between keypoints, which amplifies that jitter, and event
    detection uses velocities, which amplifies it again. The jitter has to be
    removed first.

What
    1. Mask    keypoints with visibility < MIN_VISIBILITY are treated as missing
    2. Fill    gaps of up to MAX_GAP frames are linearly interpolated;
               longer gaps stay missing (motion is not invented)
    3. Filter  2nd-order Butterworth run forwards then backwards (scipy filtfilt)
               = 4th-order, zero phase lag, so event timing (FFC, release) is not shifted
               (Winter 1990; standard in sports biomechanics)

Cutoff frequency
    Chosen per clip by Winter's residual analysis (Winter 1990, ch. 2):
    the residual between raw and filtered signal is computed for a range of
    cutoffs. At high cutoffs only noise is removed, so the residual falls on a
    straight line; extending that line to 0 Hz gives the noise level. The
    cutoff where the residual curve meets that noise level is chosen.
    A fixed cutoff can also be given (the pipeline default is 8 Hz, see features.py); it must be
    below half the frame rate (Nyquist), so 20 Hz needs video above 40 fps.

Double filtering
    C1 does not smooth its output (C1 stabilise.py: smoothing belongs to C2), so
    C2 is the only filter. If an input ever says it is already filtered
    (normalisation.filter), mode "auto" skips filtering so peak angles are not
    flattened twice; residual analysis is still reported.
"""

import numpy as np
from scipy.signal import butter, filtfilt

from . import keypoints as kp

FILTER_ORDER = 2          # applied forwards + backwards -> effective 4th order
MIN_VISIBILITY = 0.5
MAX_GAP = 5               # frames
MIN_CUTOFF_HZ = 2.0
MAX_CUTOFF_HZ = 20.0      # proposal value; capped further by the frame rate
NYQUIST_MARGIN = 0.45     # cutoff never above 0.45 * fps

# Keypoints C2 uses (residual analysis is computed on these only).
C2_KEYPOINTS = [kp.LEFT_SHOULDER, kp.RIGHT_SHOULDER, kp.LEFT_WRIST, kp.RIGHT_WRIST,
                kp.LEFT_HIP, kp.RIGHT_HIP, kp.LEFT_KNEE, kp.RIGHT_KNEE,
                kp.LEFT_ANKLE, kp.RIGHT_ANKLE]


def max_cutoff(fps):
    return min(MAX_CUTOFF_HZ, NYQUIST_MARGIN * fps)


def check_cutoff(cutoff_hz, fps):
    if not cutoff_hz > 0:
        raise ValueError(f"cutoff must be positive, got {cutoff_hz}")
    if cutoff_hz >= fps / 2.0:
        raise ValueError(f"cutoff {cutoff_hz:g} Hz must be below half the frame rate "
                         f"({fps / 2:g} Hz for {fps:g} fps video)")


def fill_short_gaps(track, max_gap=MAX_GAP):
    """Linearly interpolate NaN runs of at most max_gap frames with data on both sides."""
    out = np.array(track, dtype=float)
    filled = np.zeros(len(out), dtype=bool)
    valid = np.isfinite(out)
    n, i = len(out), 0
    while i < n:
        if valid[i]:
            i += 1
            continue
        start = i
        while i < n and not valid[i]:
            i += 1
        if start > 0 and i < n and i - start <= max_gap:
            steps = np.arange(1, i - start + 1) / (i - start + 1)
            out[start:i] = out[start - 1] + (out[i] - out[start - 1]) * steps
            filled[start:i] = True
    return out, filled


def lowpass(track, fps, cutoff_hz, order=FILTER_ORDER):
    """Zero-lag Butterworth on each continuous (non-NaN) run of a 1-D track.

    Runs shorter than filtfilt's padding length are left unfiltered.
    """
    check_cutoff(cutoff_hz, fps)
    b, a = butter(order, cutoff_hz / (fps / 2.0), btype="low")
    min_len = 3 * max(len(a), len(b)) + 1
    out = np.array(track, dtype=float)
    valid = np.isfinite(out)
    n, i = len(out), 0
    while i < n:
        if not valid[i]:
            i += 1
            continue
        start = i
        while i < n and valid[i]:
            i += 1
        if i - start >= min_len:
            out[start:i] = filtfilt(b, a, out[start:i])
    return out


def prepare(points, visibility, min_visibility=MIN_VISIBILITY, max_gap=MAX_GAP):
    """Mask low-visibility keypoints and fill short gaps. Returns (points, filled_mask)."""
    P = np.array(points, dtype=float)
    vis = np.asarray(visibility, dtype=float)
    P[np.isfinite(vis) & (vis < min_visibility)] = np.nan
    filled = np.zeros(P.shape[:2], dtype=bool)
    for k in range(P.shape[1]):
        for c in range(P.shape[2]):
            P[:, k, c], f = fill_short_gaps(P[:, k, c], max_gap)
            if c == 0:
                filled[:, k] = f
    return P, filled


def filter_points(points, fps, cutoff_hz):
    """Butterworth-filter every coordinate track of a (frames, 33, 3) array."""
    out = np.array(points, dtype=float)
    for k in range(out.shape[1]):
        for c in range(out.shape[2]):
            out[:, k, c] = lowpass(out[:, k, c], fps, cutoff_hz)
    return out


def residual_analysis(points, fps, keypoint_ids=None, step=0.5):
    """Winter's residual analysis. Returns dict with the chosen cutoff and the curve.

    residual(fc) = RMS over C2 keypoints/axes/frames of (raw - filtered at fc).
    """
    keypoint_ids = keypoint_ids or C2_KEYPOINTS
    fmax = max_cutoff(fps)
    cutoffs = np.arange(1.0, fmax + 1e-9, step)
    tracks = [points[:, k, c] for k in keypoint_ids for c in range(points.shape[2])]
    tracks = [t for t in tracks if np.isfinite(t).sum() >= 15]
    if not tracks or len(cutoffs) < 6:
        return {"cutoff_hz": None, "reason": "not enough data for residual analysis",
                "cutoffs": cutoffs.tolist(), "residuals": []}

    residuals = []
    for fc in cutoffs:
        sq, n = 0.0, 0
        for t in tracks:
            d = t - lowpass(t, fps, fc)
            ok = np.isfinite(d)
            sq += float(np.sum(d[ok] ** 2))
            n += int(ok.sum())
        residuals.append(np.sqrt(sq / n) if n else np.nan)
    residuals = np.array(residuals)

    # Straight line through the noise-only part (upper half of the cutoff range).
    hi = cutoffs >= cutoffs[0] + 0.5 * (cutoffs[-1] - cutoffs[0])
    slope, intercept = np.polyfit(cutoffs[hi], residuals[hi], 1)
    noise_level = max(float(intercept), 0.0)
    below = np.where(residuals <= noise_level)[0]
    chosen = float(cutoffs[below[0]]) if len(below) else float(cutoffs[-1])
    chosen = float(np.clip(chosen, MIN_CUTOFF_HZ, fmax))
    return {
        "cutoff_hz": chosen,
        "noise_rms": noise_level,
        "fit": {"slope": float(slope), "intercept": float(intercept)},
        "cutoffs": [round(float(c), 2) for c in cutoffs],
        "residuals": [float(r) for r in residuals],
    }


def jitter(points, keypoint_ids=None):
    """Mean |second difference| over C2 keypoints: lower = steadier (noise indicator)."""
    keypoint_ids = keypoint_ids or C2_KEYPOINTS
    acc = np.abs(np.diff(points[:, keypoint_ids, :], n=2, axis=0))
    return float(np.nanmean(acc)) if np.isfinite(acc).any() else None


def filter_delivery(delivery, mode="auto", cutoff="auto"):
    """Apply C2's Butterworth stage to a Delivery.

    mode   "auto" - filter unless the input is already filtered (C1 stabilised output)
           "on"   - always filter
           "off"  - never filter
    cutoff "auto" (residual analysis) or a number in Hz.

    Returns (filtered_points, raw_points, info). raw_points are the masked +
    gap-filled points before filtering, kept for the raw-vs-filtered plot.
    """
    if mode not in ("auto", "on", "off"):
        raise ValueError("filter mode must be 'auto', 'on' or 'off'")
    fps = delivery.fps
    prepared, filled = prepare(delivery.points, delivery.visibility)
    residual = residual_analysis(prepared, fps)

    if cutoff == "auto":
        cutoff_hz = residual["cutoff_hz"]
        cutoff_source = "residual_analysis"
    else:
        cutoff_hz = float(cutoff)
        check_cutoff(cutoff_hz, fps)
        cutoff_source = "fixed"

    apply = mode == "on" or (mode == "auto" and not delivery.prefiltered)
    if apply and cutoff_hz is None:
        apply, skip_reason = False, residual.get("reason", "cutoff could not be chosen")
    else:
        skip_reason = None if apply else (
            "input already filtered by C1" if mode == "auto" else "filtering turned off")

    filtered = filter_points(prepared, fps, cutoff_hz) if apply else prepared
    info = {
        "applied": bool(apply),
        "type": f"butterworth order {FILTER_ORDER} forward-backward "
                f"(effective order {2 * FILTER_ORDER}, zero lag)",
        "cutoff_hz": None if cutoff_hz is None else round(cutoff_hz, 2),
        "cutoff_source": cutoff_source,
        "residual_analysis_cutoff_hz": residual["cutoff_hz"],
        "fps": fps,
        "input_prefiltered": bool(delivery.prefiltered),
        "min_visibility": MIN_VISIBILITY,
        "max_gap_frames": MAX_GAP,
        "frames_gap_filled": int(filled[:, C2_KEYPOINTS].sum()),
        "jitter_before": jitter(prepared),
        "jitter_after": jitter(filtered),
    }
    if info["jitter_before"] and info["jitter_after"] is not None and apply:
        info["jitter_reduction_pct"] = round(100 * (1 - info["jitter_after"] / info["jitter_before"]), 1)
    if skip_reason:
        info["skipped_because"] = skip_reason
    info["_residual_curve"] = residual  # used by the plot; removed from the JSON output
    return filtered, prepared, info
