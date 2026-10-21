"""CricShield Component 1 - Step 4b: keypoint robustness to phone frame rate and low light.

Two checks on the clips that are already in the ICC pilot (use=icc), run before
the real side-by-side phone and dusk sessions are filmed:

  phone_proxy    The Samsung clips (60 fps, 4K) are turned into iPhone-like clips:
                 every 2nd frame is kept (-> 30 fps) and the frame is shrunk to a
                 1920 px long side (1080p). This tests frame rate + resolution only;
                 lens, colour processing and compression of a real second phone are
                 not simulated. Clips that are already 30 fps are skipped (n/a).
  dim_2ev        2 stops less light (1/4 of the light): darker image + sensor noise.
  dark_4ev       4 stops less light (1/16): much darker image + sensor noise.
  dark_4ev_gain  4 stops less light, then brightened 16x the way a phone's
                 auto-exposure does: normal brightness but strong noise.

Low light is simulated on linear light (sRGB is decoded first), with photon
(shot) noise for a pixel holding FULL_WELL electrons at white plus READ_NOISE
electrons of read noise. A fixed random seed per clip makes runs repeatable.
Longer shutter times at dusk also add motion blur; that is NOT simulated, so the
real dusk session is still needed.

The changed frames go straight into MediaPipe (extract_video(transform=...)),
are never written to a video, and the clip then runs through stabilise and
normalise exactly as in the pipeline. The baseline is the existing
data/processed/<model> output that the ICC pilot used.

For each condition it reports:
  - ICC(2,1) per keypoint inside each group, exactly as reliability.py
    (does the keypoint still trace the same path over repeated deliveries?)
  - agreement with the baseline on the same delivery: ICC(A,1) with
    baseline and condition as the two raters (targets = 101 time points x deliveries),
    and the mean absolute difference in body lengths
  - detection rate and how far the detected release moved (seconds)

Outputs (aggregate only - anonymised clip ids, no names, no paths - safe to commit):
  experiments/robustness_icc.csv        condition/group/keypoint/axis ICC
  experiments/robustness_agreement.csv  condition/group/keypoint agreement with baseline
  experiments/robustness_clips.csv      condition/clip detection rate and release shift
  experiments/robustness_by_region.png  mean ICC per body region, one panel per group
  experiments/robustness_summary.md     method, tables, limitations
Processed keypoints (under data/, never committed):
  data/processed/robustness/<model>/<condition>/<clip>_*.csv

Usage (run from components/c1_pose):
  python src/c1_pose/robustness.py                       # process missing clips, then analyse
  python src/c1_pose/robustness.py --analyse-only
  python src/c1_pose/robustness.py --conditions dim_2ev dark_4ev --redo
"""

import argparse
import json
import zlib
from pathlib import Path

import cv2
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import LinearSegmentedColormap

import reliability as rel
from extract import extract_video
from keypoints import KEYPOINT_NAMES, REGION
from normalise import normalise
from pipeline import MIN_DETECTION_RATE
from stabilise import stabilise

ROOT, C1 = rel.ROOT, rel.C1
MODELS_DIR = C1 / "models"

# name -> how the frames are changed
CONDITIONS = {
    "phone_proxy": {"frame_step": 2, "long_side": 1920, "ev": 0, "gain": False},
    "dim_2ev": {"frame_step": 1, "long_side": None, "ev": -2, "gain": False},
    "dark_4ev": {"frame_step": 1, "long_side": None, "ev": -4, "gain": False},
    "dark_4ev_gain": {"frame_step": 1, "long_side": None, "ev": -4, "gain": True},
}
CONDITION_LABELS = {
    "baseline": "baseline (as filmed)",
    "phone_proxy": "phone proxy (30 fps, 1080p)",
    "dim_2ev": "dim (-2 EV)",
    "dark_4ev": "dark (-4 EV)",
    "dark_4ev_gain": "dark + auto gain",
}
FULL_WELL = 4000.0     # electrons at white, typical small phone pixel
READ_NOISE = 2.0       # electrons
SEED = 387


# ---------------------------------------------------------------- 1. change frames

def _srgb_to_linear_lut():
    v = np.arange(256, dtype=np.float64) / 255
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4).astype(np.float32)


def _linear_to_srgb_lut(levels=4096):
    v = np.linspace(0, 1, levels)
    s = np.where(v <= 0.0031308, v * 12.92, 1.055 * v ** (1 / 2.4) - 0.055)
    return np.clip(np.round(s * 255), 0, 255).astype(np.uint8)


TO_LINEAR = _srgb_to_linear_lut()
TO_SRGB = _linear_to_srgb_lut()


def low_light(frame, ev, gain, full_well=FULL_WELL, read_noise=READ_NOISE):
    """Simulate ev stops less light on a uint8 BGR frame (ev < 0).

    Light is scaled in linear space, photon + read noise is added in electrons,
    and with gain=True the result is brightened back by 2**-ev (phone auto-exposure).
    Noise comes from OpenCV's random generator (cv2.setRNGSeed makes it repeatable);
    OpenCV is used throughout because a 4K frame is 25 million values.
    """
    k = 2.0 ** ev
    electrons = cv2.LUT(frame, TO_LINEAR)
    electrons *= np.float32(k * full_well)
    sigma = cv2.sqrt(electrons + np.float32(read_noise ** 2))
    noise = np.empty_like(electrons)
    cv2.randn(noise, 0, 1)
    electrons += cv2.multiply(noise, sigma)
    electrons *= np.float32((len(TO_SRGB) - 1) / (k * full_well if gain else full_well))
    np.clip(electrons, 0, len(TO_SRGB) - 1, out=electrons)
    return TO_SRGB[electrons.astype(np.uint16)]


def shrink(frame, long_side):
    """Resize so the longer side is long_side pixels (never enlarges)."""
    h, w = frame.shape[:2]
    scale = long_side / max(h, w)
    if scale >= 1:
        return frame
    return cv2.resize(frame, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)


def make_transform(condition, clip_id):
    """Frame transform for one condition, or None when frames are left as they are."""
    spec = CONDITIONS[condition]
    if spec["ev"] == 0 and not spec["long_side"]:
        return None
    cv2.setRNGSeed(SEED + zlib.crc32(clip_id.encode()) % 100000)   # same noise every run

    def transform(frame):
        if spec["long_side"]:
            frame = shrink(frame, spec["long_side"])
        if spec["ev"]:
            frame = low_light(frame, spec["ev"], spec["gain"])
        return frame
    return transform


def applies(condition, fps):
    """phone_proxy only makes sense for ~60 fps clips; low light applies to all."""
    return CONDITIONS[condition]["frame_step"] == 1 or round(float(fps) / 30) * 30 >= 60


# ---------------------------------------------------------------- 2. process clips

def lost(summary):
    """True when the app would reject the clip (bowler found in too few frames)."""
    return summary["detection_rate"] < MIN_DETECTION_RATE


def process_clip(video, condition, out_dir, model_file):
    """extract (with the condition's frame changes) -> stabilise -> normalise.

    A clip the app would reject (detection rate below MIN_DETECTION_RATE) stops
    after extract and has no _norm.csv: it counts as a lost delivery.
    """
    clip_id = video.stem
    summary = extract_video(video, model_file, out_dir,
                            frame_step=CONDITIONS[condition]["frame_step"],
                            transform=make_transform(condition, clip_id))
    if lost(summary):
        print(f"  lost: bowler found in {summary['detection_rate']:.0%} of frames")
        return summary
    stabilise(out_dir / f"{clip_id}_keypoints.csv", out_dir=out_dir, fps=summary["fps"])
    normalise(out_dir / f"{clip_id}_stable.csv", summary["width"], summary["height"])
    return summary


def done(out_dir, clip_id):
    if (out_dir / f"{clip_id}_norm.csv").exists():
        return True
    summary = out_dir / f"{clip_id}_summary.json"
    return summary.exists() and lost(json.loads(summary.read_text()))


def process_all(groups, conditions, raw_dir, robust_dir, model, redo=False):
    model_file = MODELS_DIR / f"pose_landmarker_{model}.task"
    for condition in conditions:
        out_dir = Path(robust_dir) / condition
        for clips in groups.values():
            for clip in clips.itertuples():
                if not applies(condition, clip.fps):
                    continue
                if done(out_dir, clip.clip_id) and not redo:
                    continue
                videos = sorted(Path(raw_dir).glob(f"{clip.clip_id}.*"))
                if not videos:
                    print(f"  WARNING: no video for {clip.clip_id} in {raw_dir}, skipped")
                    continue
                print(f"{condition}: {clip.clip_id}")
                process_clip(videos[0], condition, out_dir, model_file)


# ---------------------------------------------------------------- 3. analyse

def load_condition(groups, processed_dir):
    """{group: [(clip_id, aligned, release_s, detection_rate, fps, image, scale)]} for clips in processed_dir.

    aligned = normalised tracks (what C1 hands to C2), image = the same window in
    image coordinates (fractions of the frame), which do not depend on the
    per-clip body scale. scale = that body scale as a share of the frame width
    (so a smaller frame does not count as a change). A lost clip (no _norm.csv)
    has everything after clip_id set to None except detection_rate and fps.
    """
    out = {}
    for label, clips in groups.items():
        rows = []
        for clip in clips.itertuples():
            summary_json = Path(processed_dir) / f"{clip.clip_id}_summary.json"
            if not summary_json.exists():
                continue
            summary = json.loads(summary_json.read_text())
            fps = float(summary["fps"])
            norm_csv = Path(processed_dir) / f"{clip.clip_id}_norm.csv"
            if not norm_csv.exists() or lost(summary):
                rows.append((clip.clip_id, None, None, float(summary["detection_rate"]), fps, None, None))
                continue
            tracks = rel.load_tracks(norm_csv)
            release = rel.find_release(tracks[:, rel.bowling_wrist(clip.notes), 1])
            info = json.loads((Path(processed_dir) / f"{clip.clip_id}_norm_info.json").read_text())
            rows.append((clip.clip_id, rel.align_delivery(tracks, release, fps), release / fps,
                         float(summary["detection_rate"]), fps,
                         rel.align_delivery(load_image_tracks(norm_csv), release, fps),
                         info["scale_px"] / info["width"]))
        out[label] = rows
    return out


def load_image_tracks(norm_csv):
    """<clip>_norm.csv -> array (frames, 33, 2) of image (x, y) as fractions of the frame."""
    df = pd.read_csv(norm_csv).sort_values(["frame", "kp_id"])
    return df[["x", "y"]].to_numpy(dtype=float).reshape(int(df["frame"].max()) + 1, 33, 2)


def agreement(base, cond, index=1):
    """Agreement rows per keypoint between baseline and condition on the same deliveries.

    index picks the tracks in each row tuple: 1 = normalised, 5 = image coordinates.
    """
    base_by_clip = {r[0]: r[index] for r in base}
    pairs = [(base_by_clip[r[0]], r[index]) for r in cond if r[0] in base_by_clip]
    rows = []
    for kp in rel.ICC_KEYPOINTS:
        both = [(b[kp], c[kp]) for b, c in pairs
                if np.isfinite(b[kp]).all() and np.isfinite(c[kp]).all()]
        if not both:
            rows.append(dict(keypoint=KEYPOINT_NAMES[kp], region=REGION[kp], icc_vs_baseline=np.nan,
                             mean_abs_diff=np.nan, n_deliveries=0))
            continue
        b = np.stack([p[0] for p in both])      # (deliveries, 2, N_POINTS)
        c = np.stack([p[1] for p in both])
        icc = [rel.icc2(np.column_stack([b[:, a].ravel(), c[:, a].ravel()]))[0]
               for a in range(len(rel.AXES))]
        rows.append(dict(keypoint=KEYPOINT_NAMES[kp], region=REGION[kp],
                         icc_vs_baseline=float(np.mean(icc)),
                         mean_abs_diff=float(np.abs(b - c).mean()), n_deliveries=len(both)))
    return rows


def analyse(groups, baseline_dir, robust_dir, conditions):
    data = {"baseline": load_condition(groups, baseline_dir)}
    for condition in conditions:
        data[condition] = load_condition(groups, Path(robust_dir) / condition)

    icc_rows, agree_rows, clip_rows = [], [], []
    for condition, by_group in data.items():
        for group, rows in by_group.items():
            base = [r for r in data["baseline"][group] if r[1] is not None]
            base_release = {r[0]: r[2] for r in base}
            base_scale = {r[0]: r[6] for r in base}
            for clip_id, aligned, release_s, det, fps, _, scale in rows:
                kept_clip = aligned is not None
                clip_rows.append(dict(
                    condition=condition, group=group, clip_id=clip_id, fps=round(fps, 2),
                    detection_rate=det, lost=not kept_clip,
                    release_shift_s=release_s - base_release.get(clip_id, np.nan) if kept_clip else np.nan,
                    scale_ratio=scale / base_scale.get(clip_id, np.nan) if kept_clip else np.nan))
            kept = [r for r in rows if r[1] is not None]
            if len(kept) >= rel.MIN_DELIVERIES:      # fewer -> no ICC (n/a), as in the pilot
                for r in rel.group_icc(group, [r[1] for r in kept]):
                    icc_rows.append(dict(condition=condition, **r))
            if condition != "baseline" and kept:
                image = {r["keypoint"]: r for r in agreement(base, kept, index=5)}
                for r in agreement(base, kept):
                    img = image[r["keypoint"]]
                    agree_rows.append(dict(condition=condition, group=group, **r,
                                           icc_vs_baseline_image=img["icc_vs_baseline"],
                                           mean_abs_diff_image=img["mean_abs_diff"]))
    return pd.DataFrame(icc_rows), pd.DataFrame(agree_rows), pd.DataFrame(clip_rows)


# ---------------------------------------------------------------- 4. outputs

def region_table(icc, group, conditions):
    """Mean keypoint ICC per body region (rows) and condition (columns) for one group."""
    kp = icc[(icc["axis"] == "xy_mean") & (icc["group"] == group)]
    table = kp.pivot_table(index="region", columns="condition", values="icc", aggfunc="mean")
    return table.reindex(index=rel.REGION_ORDER, columns=conditions)


def plot_regions(icc, groups, conditions, out_png):
    cmap = LinearSegmentedColormap.from_list("icc", ["#cde2fb", "#6da7ec", "#256abf", "#0d366b"])
    cmap.set_bad("#e6e6e6")
    plt.rcParams["hatch.linewidth"] = 0.6
    fig, axes = plt.subplots(1, len(groups), figsize=(3.1 * len(groups) + 1.4, 4.4), sharey=True)
    axes = np.atleast_1d(axes)
    for ax, group in zip(axes, groups):
        values = region_table(icc, group, conditions).to_numpy(dtype=float)
        im = ax.imshow(np.ma.masked_invalid(values), cmap=cmap, vmin=0, vmax=1, aspect="auto")
        for i in range(values.shape[0]):
            for j in range(values.shape[1]):
                v = values[i, j]
                if not np.isfinite(v):
                    ax.text(j, i, "n/a", ha="center", va="center", fontsize=7, color="#555555")
                elif v < rel.GATE:
                    ax.add_patch(plt.Rectangle((j - 0.5, i - 0.5), 1, 1, fill=False, hatch="//",
                                               edgecolor="#b03a2e", linewidth=0))
                    ax.text(j, i, f"{v:.2f}", ha="center", va="center", fontsize=7, color="#1a1a1a",
                            bbox=dict(boxstyle="round,pad=0.12", facecolor="white", edgecolor="none"))
                else:
                    ax.text(j, i, f"{v:.2f}", ha="center", va="center", fontsize=7, color="white",
                            fontweight="bold")
        ax.set_xticks(range(len(conditions)),
                      [CONDITION_LABELS[c].replace(" (", "\n(") for c in conditions],
                      rotation=60, ha="right", fontsize=7)
        ax.set_yticks(range(len(rel.REGION_ORDER)), rel.REGION_ORDER, fontsize=8)
        ax.set_title(group, fontsize=9)
        ax.tick_params(length=0)
        for spine in ax.spines.values():
            spine.set_visible(False)
    cbar = fig.colorbar(im, ax=axes, fraction=0.03, pad=0.03)
    cbar.ax.axhline(rel.GATE, color="#b03a2e", linewidth=2)
    cbar.set_label("mean keypoint ICC(2,1) in region", fontsize=8)
    cbar.ax.tick_params(labelsize=8)
    fig.suptitle(f"C1 robustness: ICC per body region (hatched = below {rel.GATE})", fontsize=10)
    fig.savefig(out_png, dpi=150, bbox_inches="tight")
    plt.close(fig)


def _fmt(v, pattern="{:.2f}"):
    return "n/a" if v is None or not np.isfinite(v) else pattern.format(v)


def summary_markdown(icc, agree, clips, groups, conditions):
    all_conditions = ["baseline"] + conditions
    lines = ["# C1 robustness check: phone frame-rate proxy and simulated low light", "",
             "## Method", "",
             "The clips of the ICC pilot are processed again with their frames changed, and the same "
             "ICC as the pilot is computed for each condition. Nothing is re-filmed: these are controlled "
             "simulations on the same deliveries, run before the real side-by-side phone and dusk sessions.", "",
             "| condition | what changes |", "|---|---|",
             "| baseline | clips as filmed (the ICC pilot itself) |",
             "| phone proxy | 60 fps 4K Samsung clips -> every 2nd frame kept (30 fps) and shrunk to 1080p, "
             "like the iPhone clips. Only frame rate and resolution change. Clips already at 30 fps: n/a |",
             f"| dim (-2 EV) | 1/4 of the light, photon + read noise ({FULL_WELL:g} e- full well, "
             f"{READ_NOISE:g} e- read noise) |",
             "| dark (-4 EV) | 1/16 of the light, same noise model |",
             "| dark + auto gain | 1/16 of the light, then brightened 16x like a phone's auto-exposure "
             "(normal brightness, strong noise) |", "",
             "Light is reduced on linear (decoded sRGB) values. The changed frames go straight into MediaPipe "
             "and are never re-encoded, so no extra compression is added. Release is found again in every "
             "condition, as the app would do. Two measures:", "",
             "- **ICC within group**: ICC(2,1) over repeated deliveries per keypoint, as in icc_summary.md.",
             "- **Agreement with baseline**: ICC(A,1) with the baseline and the condition as the two raters "
             "on the same deliveries (101 time points x deliveries as targets), and the mean absolute "
             "difference in body lengths (normalised units).", ""]

    lines += ["## Detection rate and release", "",
              "Detection rate = mean share of frames where the bowler was found. Lost = clips the app would "
              f"reject (bowler found in fewer than {MIN_DETECTION_RATE:.0%} of frames); they have no keypoints "
              "and leave the ICC. A group with fewer than 3 kept deliveries gets no ICC (n/a). "
              "Release shift = mean absolute change of the detected release time against the baseline.", "",
              "| group | condition | clips | lost | detection rate | release shift (s) |",
              "|---|---|---|---|---|---|"]
    for group in groups:
        for c in all_conditions:
            rows = clips[(clips["group"] == group) & (clips["condition"] == c)]
            if rows.empty:
                lines.append(f"| {group} | {CONDITION_LABELS[c]} | 0 | n/a | n/a | n/a |")
                continue
            shift = rows["release_shift_s"].abs().mean() if c != "baseline" else np.nan
            lines.append(f"| {group} | {CONDITION_LABELS[c]} | {len(rows)} | {int(rows['lost'].sum())} | "
                         f"{rows['detection_rate'].mean():.1%} | {_fmt(shift, '{:.3f}')} |")

    lines += ["", "## Mean ICC per body region (within group)", ""]
    for group in groups:
        table = region_table(icc, group, all_conditions)
        lines += [f"**{group}**", "",
                  "| region | " + " | ".join(CONDITION_LABELS[c] for c in all_conditions) + " |",
                  "|---|" + "---|" * len(all_conditions)]
        for region, row in table.iterrows():
            lines.append(f"| {region} | " + " | ".join(_fmt(v) for v in row) + " |")
        lines.append("")

    kp = icc[icc["axis"] == "xy_mean"]
    lines += [f"## Usable keypoints (ICC >= {rel.GATE}) per condition", "",
              "| group | " + " | ".join(CONDITION_LABELS[c] for c in all_conditions) + " |",
              "|---|" + "---|" * len(all_conditions)]
    for group in groups:
        cells = []
        for c in all_conditions:
            rows = kp[(kp["group"] == group) & (kp["condition"] == c)]
            cells.append("n/a" if rows.empty else f"{int(rows['usable'].sum())}/{len(rows)}")
        lines.append(f"| {group} | " + " | ".join(cells) + " |")

    lines += ["", "## Agreement with baseline on the same deliveries", "",
              "Mean over keypoints in the region, as ICC(A,1) / mean absolute difference. Two versions:", "",
              "- **Normalised** (what C1 hands to C2): difference in body lengths. This includes any change in the "
              "per-clip body scale (shoulder width, see scale ratio below).",
              "- **Image coordinates**: difference in % of the frame. This leaves the body scale out, so it shows "
              "how far the keypoints themselves moved.", ""]
    for group in groups:
        sub = agree[agree["group"] == group]
        if sub.empty:
            continue
        for title, icc_col, diff_col, pattern in [
                ("normalised", "icc_vs_baseline", "mean_abs_diff", "{:.2f} / {:.3f}"),
                ("image coordinates", "icc_vs_baseline_image", "mean_abs_diff_image", "{:.2f} / {:.1%}")]:
            lines += [f"**{group}, {title}**", "",
                      "| region | " + " | ".join(CONDITION_LABELS[c] for c in conditions) + " |",
                      "|---|" + "---|" * len(conditions)]
            for region in rel.REGION_ORDER:
                cells = []
                for c in conditions:
                    r = sub[(sub["condition"] == c) & (sub["region"] == region)]
                    cells.append("n/a" if r.empty or not np.isfinite(r[icc_col]).any() else
                                 pattern.format(r[icc_col].mean(), r[diff_col].mean()))
                lines.append(f"| {region} | " + " | ".join(cells) + " |")
            lines.append("")

    lines += ["## Body scale per clip", "",
              "Scale ratio = the clip's normalisation scale (median shoulder width, as a share of the frame width) "
              "divided by the baseline's for the same delivery; 1.00 = unchanged. Range over the group's clips.", "",
              "| group | " + " | ".join(CONDITION_LABELS[c] for c in conditions) + " |",
              "|---|" + "---|" * len(conditions)]
    for group in groups:
        cells = []
        for c in conditions:
            r = clips[(clips["group"] == group) & (clips["condition"] == c) & ~clips["lost"]]
            cells.append("n/a" if r.empty else
                         f"{r['scale_ratio'].min():.2f}-{r['scale_ratio'].max():.2f}")
        lines.append(f"| {group} | " + " | ".join(cells) + " |")
    lines.append("")

    lines += ["## Limitations", "",
              "- These are simulations on 3 deliveries per group, not new recordings, so they show how sensitive "
              "each keypoint is, not how a real second phone or a real dusk session will behave.",
              "- The phone proxy changes frame rate and resolution only. A real iPhone also differs in lens, "
              "colour processing, stabilisation and compression, and the 2 Oct iPhone/Samsung clips were filmed "
              "from different positions, so they cannot be used to separate these effects. The side-by-side "
              "session is needed for that.",
              "- Simulated low light adds darkness and sensor noise but not the motion blur of the longer "
              "shutter a phone uses at dusk, and not floodlight flicker or colour cast. Real low light is "
              "therefore likely to be worse than this simulation, especially for the fast bowling arm.",
              "- The normalisation scale (median shoulder width) is fragile from side-on cameras, where the "
              "shoulders overlap and the width is small. When it changes, every normalised keypoint of the clip "
              "is rescaled, so the normalised ICC can fall even when the keypoints themselves (image coordinates) "
              "hardly move. Compare the two agreement tables before blaming the keypoints.",
              "- ICC within group still mixes pose-estimation error with the bowler's natural variation between "
              "deliveries; the agreement with baseline does not, because it compares the same delivery.",
              ""]
    return "\n".join(lines)


def write_outputs(icc, agree, clips, groups, conditions, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    icc.round(4).to_csv(out_dir / "robustness_icc.csv", index=False)
    agree.round(4).to_csv(out_dir / "robustness_agreement.csv", index=False)
    clips.round(4).to_csv(out_dir / "robustness_clips.csv", index=False)
    plot_regions(icc, list(groups), ["baseline"] + conditions, out_dir / "robustness_by_region.png")
    (out_dir / "robustness_summary.md").write_text(
        summary_markdown(icc, agree, clips, list(groups), conditions), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="C1 robustness: phone frame-rate proxy and simulated low light.")
    parser.add_argument("--metadata", default=ROOT / "data" / "metadata.csv")
    parser.add_argument("--model", default="lite", help="pose model; baseline is processed/<model>")
    parser.add_argument("--conditions", nargs="*", default=list(CONDITIONS), choices=list(CONDITIONS))
    parser.add_argument("--exclude", nargs="*", default=[], metavar="CLIP_ID")
    parser.add_argument("--redo", action="store_true", help="process clips again even if output exists")
    parser.add_argument("--analyse-only", action="store_true", help="skip processing, only analyse")
    parser.add_argument("--out", default=C1 / "experiments")
    args = parser.parse_args()

    groups = rel.icc_groups(pd.read_csv(args.metadata), exclude=tuple(args.exclude))
    baseline_dir = ROOT / "data" / "processed" / args.model
    robust_dir = ROOT / "data" / "processed" / "robustness" / args.model
    if not args.analyse_only:
        process_all(groups, args.conditions, ROOT / "data" / "raw", robust_dir, args.model, args.redo)
    icc, agree, clips = analyse(groups, baseline_dir, robust_dir, args.conditions)
    write_outputs(icc, agree, clips, groups, args.conditions, args.out)
    print(f"saved to {args.out}")


if __name__ == "__main__":
    main()
