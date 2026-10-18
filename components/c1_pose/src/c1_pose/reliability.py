"""CricShield Component 1 - Step 4: keypoint reliability (ICC pilot study).

Asks: "if the same bowler bowls the same delivery again, filmed the same way,
does each keypoint trace the same path?" A keypoint that does is reliable
enough to pass on to C2; one that does not is flagged.

  1. Groups  - clips with use=icc in data/metadata.csv are grouped by the
               metadata columns (bowler_id, angle, distance_m), never by the
               clip_id text. Only groups with >= 3 deliveries are kept.
               The bowling arm comes from the notes column ("left-arm"/"right-arm").
  2. Align   - release frame = the frame where the bowling-arm wrist is highest
               (smallest normalised y; image y points down), among frames where
               the wrist was found. A window from 0.4 s before to 0.3 s after
               release is cut using each clip's own fps, and every keypoint track
               is resampled to 101 points by linear interpolation. 30 fps and
               60 fps clips therefore end up on the same time axis.
               A keypoint with > 20 % missing frames in the window is marked
               missing for that delivery (not filled).
  3. ICC     - per group, keypoint and axis (x, y; z is skipped because depth
               from one camera is unreliable): ICC(2,1) from pingouin, i.e.
               two-way random effects, absolute agreement, single measure.
               targets = the 101 time points, raters = the deliveries.
               Keypoint ICC = mean of the x and y ICC.
               Bands: poor < 0.50 <= moderate < 0.75 <= good < 0.90 <= excellent.
               usable = keypoint ICC >= 0.75.
               Face keypoints 1-10 are skipped (they move with the head and add
               nothing for bowling); the nose is kept as the head keypoint.

Outputs (aggregate only - no names, no paths - safe to commit):
  experiments/icc_pilot.csv          one row per group/keypoint/axis (+ the x-y mean)
  experiments/icc_by_region.png      heatmap, keypoints grouped by body region
  experiments/c1_reliability.json    group -> keypoint -> {icc, band, usable}
  experiments/icc_summary.md         method, mean ICC per region, usable keypoints, limitations
For checking only (under data/, so never committed):
  data/processed/icc_checks/<clip>_release.jpg   detected release frame with the skeleton

Usage (run from components/c1_pose):
  python src/c1_pose/reliability.py
  python src/c1_pose/reliability.py --model full --no-checks
  python src/c1_pose/reliability.py --exclude B01_D01_semi_side_5m
"""

import argparse
import json
import math
import warnings
from pathlib import Path

import cv2
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import pingouin as pg
from matplotlib.colors import LinearSegmentedColormap

from keypoints import KEYPOINT_NAMES, REGION
from overlay import draw

LEFT_WRIST, RIGHT_WRIST = 15, 16
ICC_KEYPOINTS = [0] + list(range(11, 33))   # nose + body; face points 1-10 skipped
AXES = ("x", "y")                            # z skipped: unreliable from one camera
PRE_S, POST_S = 0.4, 0.3                     # window around release, seconds
N_POINTS = 101                               # resampled time points (0 %, 1 %, ... 100 %)
MAX_MISSING = 0.20                           # > 20 % missing in the window -> keypoint missing
MIN_DELIVERIES = 3
GATE = 0.75                                  # usable = ICC >= 0.75
BANDS = [(0.50, "poor"), (0.75, "moderate"), (0.90, "good"), (math.inf, "excellent")]
REGION_ORDER = ["head", "shoulder", "elbow", "wrist_hand", "hip", "knee", "ankle_foot"]

ROOT = Path(__file__).resolve().parents[4]   # repository root
C1 = Path(__file__).resolve().parents[2]     # components/c1_pose


# ---------------------------------------------------------------- 1. groups

def bowling_wrist(notes):
    """Keypoint id of the bowling-arm wrist, read from the metadata notes."""
    notes = str(notes).lower()
    if "left-arm" in notes:
        return LEFT_WRIST
    if "right-arm" in notes:
        return RIGHT_WRIST
    raise ValueError(f"bowling arm not found in notes: {notes!r}")


def group_label(bowler_id, angle, distance_m):
    d = float(distance_m)
    return f"{bowler_id}_{angle}_{int(d) if d.is_integer() else d}m"


def icc_groups(metadata, min_deliveries=MIN_DELIVERIES, exclude=()):
    """{group label: rows of metadata} for use=icc clips, grouped by metadata columns.

    Clips in exclude are left out. Groups with fewer than min_deliveries clips
    are dropped. Two clips with the same delivery number in one group means the
    metadata is inconsistent (e.g. two camera views under one angle), so it stops.
    """
    icc = metadata[(metadata["use"].astype(str).str.strip() == "icc")
                   & ~metadata["clip_id"].isin(list(exclude))]
    groups = {}
    for (bowler, angle, dist), rows in icc.groupby(["bowler_id", "angle", "distance_m"], sort=True):
        dup = rows[rows["delivery_no"].duplicated(keep=False)]
        if len(dup):
            raise ValueError(f"{group_label(bowler, angle, dist)}: same delivery number on clips "
                             f"{', '.join(dup['clip_id'])} - fix metadata.csv or use --exclude")
        if len(rows) >= min_deliveries:
            groups[group_label(bowler, angle, dist)] = rows.sort_values("delivery_no")
    return groups


# ---------------------------------------------------------------- 2. align

def load_tracks(norm_csv):
    """<clip>_norm.csv -> array (frames, 33, 2) of normalised (nx, ny), NaN where missing."""
    df = pd.read_csv(norm_csv).sort_values(["frame", "kp_id"])
    n_frames = int(df["frame"].max()) + 1
    return df[["nx", "ny"]].to_numpy(dtype=float).reshape(n_frames, 33, 2)


def find_release(wrist_y):
    """Index of the frame where the wrist is highest (smallest y), ignoring missing frames."""
    wrist_y = np.asarray(wrist_y, dtype=float)
    if not np.isfinite(wrist_y).any():
        raise ValueError("bowling wrist not detected in any frame")
    return int(np.nanargmin(wrist_y))


def window_offsets(fps):
    """Frame offsets from release that fall inside [-PRE_S, +POST_S]."""
    eps = 1e-9
    return np.arange(math.ceil(-PRE_S * fps - eps), math.floor(POST_S * fps + eps) + 1)


def resample(values, release, fps, n_points=N_POINTS, max_missing=MAX_MISSING):
    """Cut the release window out of one 1-D track and resample it to n_points.

    Frames outside the clip count as missing. Returns None if more than
    max_missing of the window is missing; otherwise gaps are bridged by linear
    interpolation and the ends are held at the nearest real value.
    """
    values = np.asarray(values, dtype=float)
    offsets = window_offsets(fps)
    frames = release + offsets
    inside = (frames >= 0) & (frames < len(values))
    window = np.full(len(offsets), np.nan)
    window[inside] = values[frames[inside]]

    ok = np.isfinite(window)
    if ok.sum() < 2 or 1 - ok.mean() > max_missing:
        return None
    t = offsets / fps
    return np.interp(np.linspace(-PRE_S, POST_S, n_points), t[ok], window[ok])


def align_delivery(tracks, release, fps):
    """(frames, 33, 2) tracks -> (33, 2, N_POINTS) aligned tracks, NaN rows for missing keypoints."""
    out = np.full((tracks.shape[1], tracks.shape[2], N_POINTS), np.nan)
    for kp in range(tracks.shape[1]):
        r = [resample(tracks[:, kp, a], release, fps) for a in range(tracks.shape[2])]
        if all(v is not None for v in r):          # missing in either axis -> missing keypoint
            out[kp] = r
    return out


# ---------------------------------------------------------------- 3. ICC

def icc2(curves):
    """ICC(2,1) for a (time points, deliveries) array. Returns (icc, ci_low, ci_high)."""
    curves = np.asarray(curves, dtype=float)
    n_t, n_d = curves.shape
    long = pd.DataFrame({
        "target": np.repeat(np.arange(n_t), n_d),
        "rater": np.tile(np.arange(n_d), n_t),
        "rating": curves.ravel(),
    })
    with warnings.catch_warnings():
        # identical deliveries make the F statistic infinite; ICC is still 1
        warnings.simplefilter("ignore", RuntimeWarning)
        res = pg.intraclass_corr(long, targets="target", raters="rater", ratings="rating")
    # Shrout & Fleiss "ICC2" = McGraw & Wong "ICC(A,1)" (the name pingouin >= 0.7 uses)
    row = res.set_index("Type").loc["ICC(A,1)"]
    lo, hi = row["CI95"]
    return float(row["ICC"]), float(lo), float(hi)


def band(icc):
    if icc is None or not np.isfinite(icc):
        return "not_enough_data"
    for upper, name in BANDS:
        if icc < upper:
            return name


def group_icc(group, aligned):
    """ICC rows for one group. aligned: list of (33, 2, N_POINTS) arrays, one per delivery."""
    stack = np.stack(aligned)                       # (deliveries, 33, 2, N_POINTS)
    rows = []
    for kp in ICC_KEYPOINTS:
        present = np.isfinite(stack[:, kp]).all(axis=(1, 2))
        n = int(present.sum())
        axis_icc = []
        for a, axis in enumerate(AXES):
            if n >= MIN_DELIVERIES:
                icc, lo, hi = icc2(stack[present, kp, a].T)
            else:
                icc = lo = hi = np.nan
            axis_icc.append(icc)
            rows.append(dict(group=group, keypoint=KEYPOINT_NAMES[kp], region=REGION[kp], axis=axis,
                             icc=icc, ci_low=lo, ci_high=hi, band=band(icc),
                             usable=bool(icc >= GATE), n_deliveries=n))
        mean = float(np.mean(axis_icc))
        # No CI for the mean: averaging two CIs does not give a valid interval.
        rows.append(dict(group=group, keypoint=KEYPOINT_NAMES[kp], region=REGION[kp], axis="xy_mean",
                         icc=mean, ci_low=np.nan, ci_high=np.nan, band=band(mean),
                         usable=bool(mean >= GATE), n_deliveries=n))
    return rows


# ---------------------------------------------------------------- 4. outputs

def keypoint_table(results):
    """Keypoint-level (x-y mean) ICC, rows = keypoints in region order, columns = groups."""
    kp = results[results["axis"] == "xy_mean"]
    table = kp.pivot(index="keypoint", columns="group", values="icc")
    order = sorted(ICC_KEYPOINTS, key=lambda k: (REGION_ORDER.index(REGION[k]), k))
    return table.reindex([KEYPOINT_NAMES[k] for k in order])


def plot_heatmap(results, out_png):
    table = keypoint_table(results)
    regions = [REGION[KEYPOINT_NAMES.index(k)] for k in table.index]
    values = table.to_numpy(dtype=float)

    # One-hue sequential ramp: light = low ICC, dark = high ICC.
    cmap = LinearSegmentedColormap.from_list("icc", ["#cde2fb", "#6da7ec", "#256abf", "#0d366b"])
    cmap.set_bad("#e6e6e6")
    plt.rcParams["hatch.linewidth"] = 0.6
    fig, ax = plt.subplots(figsize=(6.4, 0.34 * len(table) + 1.6))
    im = ax.imshow(np.ma.masked_invalid(values), cmap=cmap, vmin=0, vmax=1, aspect="auto")

    for i in range(values.shape[0]):
        for j in range(values.shape[1]):
            v = values[i, j]
            if not np.isfinite(v):
                ax.text(j, i, "n/a", ha="center", va="center", fontsize=8, color="#555555")
                continue
            if v < GATE:   # hatch = below the gate, so it does not rely on colour alone
                ax.add_patch(plt.Rectangle((j - 0.5, i - 0.5), 1, 1, fill=False, hatch="//",
                                           edgecolor="#b03a2e", linewidth=0))
                ax.text(j, i, f"{v:.2f}", ha="center", va="center", fontsize=8, color="#1a1a1a",
                        bbox=dict(boxstyle="round,pad=0.15", facecolor="white", edgecolor="none"))
            else:
                ax.text(j, i, f"{v:.2f}", ha="center", va="center", fontsize=8, color="white",
                        fontweight="bold")

    labels = [g.replace("_", " ").replace(" ", "\n", 1) for g in table.columns]
    ax.set_xticks(range(len(table.columns)), labels, fontsize=9)
    ax.xaxis.tick_top()
    ax.set_yticks(range(len(table)), [f"{k}" for k in table.index], fontsize=8)
    ax.tick_params(length=0)
    # thin white lines + region names between body regions
    starts = [i for i in range(len(regions)) if i == 0 or regions[i] != regions[i - 1]]
    for s in starts[1:]:
        ax.axhline(s - 0.5, color="white", linewidth=3)
    for n, s in enumerate(starts):
        end = starts[n + 1] if n + 1 < len(starts) else len(regions)
        ax.text(len(table.columns) - 0.4, (s + end - 1) / 2, regions[s], va="center",
                fontsize=8, color="#444444")
    for spine in ax.spines.values():
        spine.set_visible(False)

    cbar = fig.colorbar(im, ax=ax, fraction=0.05, pad=0.2)
    cbar.ax.axhline(GATE, color="#b03a2e", linewidth=2)
    cbar.set_label("ICC(2,1), mean of x and y", fontsize=8)
    cbar.ax.tick_params(labelsize=8)
    cbar.ax.text(1.6, GATE, f" gate {GATE}", transform=cbar.ax.get_yaxis_transform(),
                 va="center", fontsize=8, color="#b03a2e")
    ax.set_title(f"C1 pilot ICC per keypoint (hatched = below {GATE}, not usable)",
                 fontsize=10, pad=24)
    fig.tight_layout()
    fig.savefig(out_png, dpi=150)
    plt.close(fig)


def reliability_json(results):
    kp = results[results["axis"] == "xy_mean"]
    out = {"icc_type": "ICC(2,1) two-way random, absolute agreement, single measure",
           "gate": GATE, "groups": {}}
    for group, rows in kp.groupby("group", sort=True):
        out["groups"][group] = {
            r.keypoint: {"icc": None if not np.isfinite(r.icc) else round(float(r.icc), 3),
                         "band": r.band, "usable": bool(r.usable)}
            for r in rows.itertuples()}
    return out


def summary_markdown(results, group_info, exclude=()):
    table = keypoint_table(results)
    kp_regions = pd.Series({k: REGION[KEYPOINT_NAMES.index(k)] for k in table.index})
    by_region = table.groupby(kp_regions).mean().reindex(REGION_ORDER)
    groups = list(table.columns)

    lines = ["# C1 reliability pilot: ICC per keypoint", "",
             "## Method", "",
             "Each group is one bowler filmed several times from the same camera angle and distance "
             "(taken from the metadata columns, not the clip names). "
             "In every delivery the release frame is the frame where the bowling-arm wrist is highest, "
             "and a window from 0.4 s before to 0.3 s after release is cut using that clip's own frame rate. "
             "Each keypoint path in the window is resampled to 101 time points so that 30 fps and 60 fps "
             "clips line up; a keypoint missing in more than 20 % of the window is left out for that delivery. "
             "For every keypoint and axis (x and y; depth is skipped) ICC(2,1) is calculated with the 101 "
             "time points as targets and the deliveries as raters, and the keypoint ICC is the mean of x and y. "
             f"A keypoint is usable when its ICC is at least {GATE} (bands: poor < 0.50, moderate < 0.75, "
             "good < 0.90, excellent >= 0.90).",
             "", "## Groups", "",
             "| group | deliveries | release window usable | fps |", "|---|---|---|---|"]
    for g in groups:
        fps = ", ".join(f"{f:g}" for f in group_info[g]["fps"])
        n_ok = group_info[g]["n"] - len(group_info[g]["bad_release"])
        lines.append(f"| {g} | {group_info[g]['n']} | {n_ok} | {fps} |")
    bad = [c for g in groups for c in group_info[g]["bad_release"]]
    if bad:
        lines += ["", "Release window not usable (bowling wrist missing in more than 20 % of it, "
                  "so the release could not be found and the delivery is left out of every keypoint): "
                  + ", ".join(bad) + ". A group left with fewer than 3 deliveries gets no ICC (n/a)."]
    if exclude:
        lines += ["", "Excluded by hand: " + ", ".join(exclude) + " (different camera view from the "
                  "rest of its group in the notes; to be corrected in the metadata)."]

    lines += ["", "## Mean ICC per body region", "",
              "| region | " + " | ".join(groups) + " |",
              "|---|" + "---|" * len(groups)]
    for region, row in by_region.iterrows():
        cells = [("n/a" if not np.isfinite(v) else f"{v:.2f}") for v in row]
        lines.append(f"| {region} | " + " | ".join(cells) + " |")

    lines += ["", f"## Usable keypoints (ICC >= {GATE})", ""]
    for g in groups:
        usable = [k for k in table.index if table.loc[k, g] >= GATE]
        lines.append(f"- **{g}** ({len(usable)}/{len(table)}): " + (", ".join(usable) or "none"))
    all_usable = [k for k in table.index if (table.loc[k] >= GATE).all()]
    lines.append(f"- **Usable in every group** ({len(all_usable)}/{len(table)}): "
                 + (", ".join(all_usable) or "none"))

    lines += ["", "## Limitations", "",
              f"- This is a pilot with {MIN_DELIVERIES} deliveries per group, so the confidence intervals "
              "in icc_pilot.csv are wide and single values should not be over-read."]
    for g in groups:
        if len(group_info[g]["fps"]) > 1:
            rates = " and ".join(f"{f:g} fps" for f in group_info[g]["fps"])
            lines.append(f"- The {g} group mixes {rates} clips. Resampling to 101 time points puts them "
                         "on the same time axis, but frame rate will be a separate condition in the full study.")
    lines += ["- ICC here measures pose-estimation reliability together with the bowler's natural "
              "variation between deliveries; the two cannot be separated with this design.",
              "- The 101 time points of one keypoint path are not independent of each other, so the "
              "confidence intervals are likely narrower than they should be.",
              "- Release is found automatically (highest bowling wrist) and was checked by eye on the "
              "release-frame images; a wrong release would misalign a delivery and lower its ICC.",
              ""]
    return "\n".join(lines)


def save_release_check(video, norm_csv, release, out_jpg):
    """Draw the skeleton on the detected release frame (for checking by eye, not committed)."""
    cap = cv2.VideoCapture(str(video))
    frame = None
    try:
        for _ in range(release + 1):        # read in order: seeking is unreliable on phone videos
            ok, frame = cap.read()
            if not ok:
                return False
    finally:
        cap.release()
    df = pd.read_csv(norm_csv)
    df = df[(df["frame"] == release) & df["x"].notna() & df["y"].notna()]
    draw(frame, {int(r.kp_id): (float(r.x), float(r.y), float(r.visibility)) for r in df.itertuples()})
    cv2.putText(frame, f"release frame {release}", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.4,
                (255, 255, 255), 3)
    out_jpg.parent.mkdir(parents=True, exist_ok=True)
    return cv2.imwrite(str(out_jpg), frame)


# ---------------------------------------------------------------- run

def run_study(metadata_csv, processed_dir, out_dir, checks_dir=None, raw_dir=None, exclude=()):
    metadata = pd.read_csv(metadata_csv)     # read only - never written
    groups = icc_groups(metadata, exclude=exclude)
    if not groups:
        raise SystemExit(f"no group with >= {MIN_DELIVERIES} icc deliveries in {metadata_csv}")

    rows, group_info = [], {}
    for label, clips in groups.items():
        aligned, bad_release = [], []
        for clip in clips.itertuples():
            norm_csv = Path(processed_dir) / f"{clip.clip_id}_norm.csv"
            tracks = load_tracks(norm_csv)
            wrist = bowling_wrist(clip.notes)
            release = find_release(tracks[:, wrist, 1])
            aligned.append(align_delivery(tracks, release, float(clip.fps)))
            # the wrist that defines release must itself be usable in the window
            if np.isnan(aligned[-1][wrist]).all():
                bad_release.append(clip.clip_id)
            print(f"  {label}: {clip.clip_id} release at frame {release} "
                  f"({release / float(clip.fps):.2f} s, {clip.fps:g} fps)"
                  + ("  <- release window not usable" if clip.clip_id in bad_release else ""))
            if checks_dir is not None:
                videos = sorted(Path(raw_dir).glob(f"{clip.clip_id}.*"))
                if videos:
                    save_release_check(videos[0], norm_csv, release,
                                       Path(checks_dir) / f"{clip.clip_id}_release.jpg")
        # nominal frame rate (phones record 59.2-59.8 for "60 fps")
        group_info[label] = {"n": len(clips), "fps": sorted({30 * round(float(f) / 30) for f in clips["fps"]}),
                             "bad_release": bad_release}
        rows += group_icc(label, aligned)

    results = pd.DataFrame(rows)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    results.round(4).to_csv(out_dir / "icc_pilot.csv", index=False)
    plot_heatmap(results, out_dir / "icc_by_region.png")
    with open(out_dir / "c1_reliability.json", "w") as f:
        json.dump(reliability_json(results), f, indent=2)
    (out_dir / "icc_summary.md").write_text(summary_markdown(results, group_info, exclude), encoding="utf-8")
    return results


def main():
    parser = argparse.ArgumentParser(description="C1 pilot ICC reliability study.")
    parser.add_argument("--metadata", default=ROOT / "data" / "metadata.csv")
    parser.add_argument("--model", default="lite", help="which processed/<model> folder to read")
    parser.add_argument("--out", default=C1 / "experiments")
    parser.add_argument("--no-checks", action="store_true", help="skip the release-frame check images")
    parser.add_argument("--exclude", nargs="*", default=[], metavar="CLIP_ID",
                        help="clips to leave out (recorded in icc_summary.md)")
    args = parser.parse_args()

    processed = ROOT / "data" / "processed" / args.model
    checks = None if args.no_checks else ROOT / "data" / "processed" / "icc_checks"
    results = run_study(args.metadata, processed, args.out, checks, ROOT / "data" / "raw",
                        tuple(args.exclude))
    kp = results[results["axis"] == "xy_mean"]
    print(f"\n{kp['usable'].sum()}/{len(kp)} keypoint-group results usable (ICC >= {GATE})")
    print(f"saved to {args.out}")


if __name__ == "__main__":
    main()
