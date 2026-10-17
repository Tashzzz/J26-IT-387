"""CricShield Component 1 - Step 3: keypoint normalisation.

Takes the stabilised keypoints CSV from stabilise.py and makes keypoint
positions comparable between clips filmed at different distances and
positions in the frame. This must happen before the ICC reliability study:
a bowler filmed from 10 m has smaller raw coordinates than the same bowler
at 4 m, for reasons that have nothing to do with tracking reliability.

  1. Pixels  - MediaPipe gives x as a fraction of frame width and y as a
               fraction of frame height. These are converted to pixels first,
               otherwise distances are distorted by the aspect ratio
               (a portrait video stretches y). MediaPipe's z uses roughly the
               same scale as x, so z is also multiplied by the width.
  2. Origin  - every keypoint is moved so the hip centre (midpoint of left hip
               23 and right hip 24) is at (0, 0, 0) in every frame. This removes
               where the bowler is in the frame and the run-up movement.
               If either hip is missing in a frame, that whole frame is left
               empty: without an origin the other keypoints cannot be placed.
  3. Scale   - every coordinate is divided by ONE body length for the whole
               clip: the median over all frames of
                 shoulder_width : distance between shoulders 11 and 12 (default)
                 torso_length   : distance from shoulder centre to hip centre
               One value per clip (not per frame) so that the body turning
               during the delivery does not make the ruler grow and shrink.
               Shoulder width shrinks when the camera is side-on and the
               shoulders line up, so torso length is offered as an option.
               Both are measured and saved so the choice can be made from data.

Image y points down. It is kept that way (not flipped) so the numbers match
what is drawn on the overlay video.

Outputs (next to the input CSV unless --out is given):
  <clip>_norm.csv        stabilised CSV plus nx, ny, nz (normalised coordinates)
  <clip>_norm_info.json  origin/scale method, scale in pixels, frames left empty

Usage (run from components/c1_pose):
  python src/c1_pose/normalise.py ../../data/processed/B01_D01_side_10m_stable.csv
  python src/c1_pose/normalise.py <csv> --scale torso_length
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

LEFT_SHOULDER, RIGHT_SHOULDER = 11, 12
LEFT_HIP, RIGHT_HIP = 23, 24
SCALE_METHODS = ("shoulder_width", "torso_length")
DEFAULT_SCALE = "shoulder_width"


def to_pixels(coords, width, height):
    """Image coords (fractions of the frame) -> pixels. coords: (frames, 33, 3)."""
    return coords * np.array([width, height, width], dtype=float)


def segment_lengths(px):
    """Per-frame shoulder width and torso length in pixels (x and y only).

    z is left out: MediaPipe's depth estimate from a single camera is much
    noisier than x and y and would make the ruler itself unreliable.
    Frames where a needed keypoint is missing give NaN.
    """
    shoulder_mid = (px[:, LEFT_SHOULDER, :2] + px[:, RIGHT_SHOULDER, :2]) / 2
    hip_mid = (px[:, LEFT_HIP, :2] + px[:, RIGHT_HIP, :2]) / 2
    shoulder_width = np.linalg.norm(px[:, LEFT_SHOULDER, :2] - px[:, RIGHT_SHOULDER, :2], axis=1)
    torso_length = np.linalg.norm(shoulder_mid - hip_mid, axis=1)
    return {"shoulder_width": shoulder_width, "torso_length": torso_length}


def normalise_frames(px, scale_method=DEFAULT_SCALE):
    """Hip-centre origin + one body-length scale per clip.

    px: (frames, 33, 3) pixel coordinates, NaN where a keypoint is missing.
    Returns (normalised array of the same shape, info dict).
    """
    if scale_method not in SCALE_METHODS:
        raise ValueError(f"scale_method must be one of {SCALE_METHODS}, got {scale_method!r}")

    hip_centre = (px[:, LEFT_HIP] + px[:, RIGHT_HIP]) / 2          # (frames, 3)
    no_origin = np.isnan(hip_centre).any(axis=1)                    # either hip missing

    lengths = segment_lengths(px)
    medians = {name: float(np.nanmedian(v)) if np.isfinite(v).any() else None
               for name, v in lengths.items()}
    scale = medians[scale_method]
    if scale is None or scale <= 0:
        raise ValueError(f"cannot normalise: {scale_method} could not be measured in any frame")

    normed = (px - hip_centre[:, None, :]) / scale
    normed[no_origin] = np.nan   # already NaN via hip_centre; kept explicit for readers

    info = {
        "origin": "hip_centre",
        "scale": scale_method,
        "scale_px": round(scale, 3),
        "median_px": {k: (round(v, 3) if v is not None else None) for k, v in medians.items()},
        "frames": int(px.shape[0]),
        "frames_without_origin": int(no_origin.sum()),
    }
    return normed, info


def normalise(csv_path, width, height, scale_method=DEFAULT_SCALE, out_dir=None):
    """Read <clip>_stable.csv, write <clip>_norm.csv and <clip>_norm_info.json."""
    csv_path = Path(csv_path)
    out_dir = Path(out_dir) if out_dir else csv_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(csv_path).sort_values(["frame", "kp_id"]).reset_index(drop=True)
    clip_id = str(df["clip_id"].iloc[0])
    n_frames = int(df["frame"].max()) + 1
    coords = df[["x", "y", "z"]].to_numpy(dtype=float).reshape(n_frames, 33, 3)

    normed, info = normalise_frames(to_pixels(coords, width, height), scale_method)

    flat = normed.reshape(-1, 3)
    df["nx"], df["ny"], df["nz"] = flat[:, 0].round(6), flat[:, 1].round(6), flat[:, 2].round(6)
    out_csv = out_dir / f"{clip_id}_norm.csv"
    df.to_csv(out_csv, index=False)

    info.update({"clip_id": clip_id, "width": width, "height": height, "csv": str(out_csv)})
    with open(out_dir / f"{clip_id}_norm_info.json", "w") as f:
        json.dump(info, f, indent=2)
    return info


def size_from_summary(csv_path):
    """Read frame width/height from the <clip>_summary.json written by extract.py."""
    csv_path = Path(csv_path)
    summary = csv_path.with_name(csv_path.name.replace("_stable.csv", "_summary.json"))
    if summary.exists():
        with open(summary) as f:
            s = json.load(f)
        return int(s["width"]), int(s["height"])
    return None, None


def main():
    parser = argparse.ArgumentParser(description="Hip-centre and scale-normalise stabilised keypoints.")
    parser.add_argument("csv", help="stabilised keypoints CSV from stabilise.py")
    parser.add_argument("--scale", choices=SCALE_METHODS, default=DEFAULT_SCALE,
                        help=f"body length used as the ruler (default {DEFAULT_SCALE})")
    parser.add_argument("--width", type=int, help="frame width in pixels (default: from summary JSON)")
    parser.add_argument("--height", type=int, help="frame height in pixels (default: from summary JSON)")
    parser.add_argument("--out", help="output folder (default: same folder as the CSV)")
    args = parser.parse_args()

    width, height = size_from_summary(args.csv)
    width, height = args.width or width, args.height or height
    if not (width and height):
        raise SystemExit("Frame size unknown: pass --width/--height or keep the _summary.json next to the CSV")

    info = normalise(args.csv, width, height, args.scale, args.out)
    m = info["median_px"]
    print(f"{info['clip_id']}: {info['frames']} frames, {width}x{height}")
    print(f"  median shoulder width {m['shoulder_width']} px, torso length {m['torso_length']} px")
    print(f"  scale = {info['scale']} ({info['scale_px']} px), "
          f"frames with no hip centre: {info['frames_without_origin']}")
    print(f"  saved: {info['csv']}")


if __name__ == "__main__":
    main()
