"""CricShield Component 1 - lite vs full vs heavy model comparison.

Reads the <clip>_summary.json files written by extract.py for each model and
compares the three MediaPipe PoseLandmarker models on the same clips.

Reads:
  <processed>/lite|full|heavy/<clip>_summary.json   (only clips present for all three)
  metadata.csv                                       (bowling arm per clip)

Writes (aggregate numbers only - no file paths or bowler names, safe to commit):
  <out>/model_comparison.csv   one row per clip and model
  <out>/model_comparison.png   grouped bars: detection rate and processing fps per model
  <out>/model_comparison.md    mean per model + a short note on the trade-off

Bowling arm, in this order: a bowling_arm column in metadata.csv, then "left-arm" /
"right-arm" in its notes, then --bowling-arm. If it is still unknown, the
arm visibility for that clip is left blank (and a warning is printed).

Visibility numbers come from extract.py and are averaged over frames where a pose
was detected, so they say how sure the model is when it does find the bowler.

Usage (run from components/c1_pose):
  python src/c1_pose/compare_models.py
  python src/c1_pose/compare_models.py --processed ../../data/processed --out experiments
"""

import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from keypoints import KEYPOINT_NAMES

MODELS = ["lite", "full", "heavy"]
ARM_JOINTS = ["shoulder", "elbow", "wrist"]

# Decision rule for the app (also written into the .md): choose the fastest model
# unless a slower one finds the bowler clearly more often or sees the bowling arm
# clearly better.
MIN_DETECTION_GAIN = 0.05     # 5 percentage points of detection rate
MIN_VISIBILITY_GAIN = 0.05    # on the 0-1 visibility scale

COLUMNS = ["clip_id", "model", "detection_rate", "processing_fps",
           "arm_visibility", "all_visibility"]


def common_clips(processed_dir):
    """Clip IDs that have a summary for every model."""
    sets = []
    for model in MODELS:
        files = (Path(processed_dir) / model).glob("*_summary.json")
        sets.append({f.name[: -len("_summary.json")] for f in files})
    return sorted(set.intersection(*sets))


def bowling_arms(metadata_path, fallback=None):
    """clip_id -> "left" / "right" / None."""
    meta = pd.read_csv(metadata_path, dtype=str, encoding="utf-8-sig").fillna("")
    arms = {}
    for _, row in meta[meta["clip_id"] != ""].iterrows():
        arm = row.get("bowling_arm", "").strip().lower()
        notes = row.get("notes", "").lower()
        if arm not in ("left", "right"):
            arm = "left" if "left-arm" in notes else "right" if "right-arm" in notes else fallback
        arms[row["clip_id"]] = arm
    return arms


def summary_row(summary, clip_id, model, arm):
    vis = {name: kp["mean_visibility"] for name, kp in summary["per_keypoint"].items()}
    all_vis = [vis[n] for n in KEYPOINT_NAMES if vis.get(n) is not None]
    arm_vis = [vis[f"{arm}_{j}"] for j in ARM_JOINTS if arm and vis.get(f"{arm}_{j}") is not None]
    return {
        "clip_id": clip_id,
        "model": model,
        "detection_rate": summary["detection_rate"],
        "processing_fps": summary["processing_fps"],
        "arm_visibility": round(sum(arm_vis) / len(arm_vis), 4) if arm_vis else None,
        "all_visibility": round(sum(all_vis) / len(all_vis), 4) if all_vis else None,
    }


def collect(processed_dir, metadata_path, fallback_arm=None):
    clips = common_clips(processed_dir)
    if not clips:
        raise ValueError(f"no clip has a summary for all of {MODELS} in {processed_dir}")
    arms = bowling_arms(metadata_path, fallback_arm)
    unknown = [c for c in clips if not arms.get(c)]
    if unknown:
        print(f"warning: bowling arm unknown for {unknown}; arm visibility left blank "
              "(add a bowling_arm column or use --bowling-arm)")
    rows = []
    for clip_id in clips:
        for model in MODELS:
            with open(Path(processed_dir) / model / f"{clip_id}_summary.json") as f:
                rows.append(summary_row(json.load(f), clip_id, model, arms.get(clip_id)))
    return pd.DataFrame(rows, columns=COLUMNS)


def model_means(df):
    means = df.groupby("model", sort=False)[COLUMNS[2:]].mean().reindex(MODELS)
    means["clips"] = df.groupby("model")["clip_id"].nunique().reindex(MODELS)
    means["arm_clips"] = df.dropna(subset=["arm_visibility"]).groupby("model")["clip_id"] \
        .nunique().reindex(MODELS).fillna(0).astype(int)
    return means


def recommend(means):
    """Fastest model, unless a slower one is clearly better (see MIN_*_GAIN)."""
    by_speed = means.sort_values("processing_fps", ascending=False)
    choice = by_speed.index[0]
    for model in by_speed.index[1:]:
        better_detection = means.at[model, "detection_rate"] - means.at[choice, "detection_rate"]
        better_arm = means.at[model, "arm_visibility"] - means.at[choice, "arm_visibility"]
        if better_detection >= MIN_DETECTION_GAIN or better_arm >= MIN_VISIBILITY_GAIN:
            choice = model
    return choice


def plot(means, path):
    fig, ax1 = plt.subplots(figsize=(7, 4))
    x = range(len(MODELS))
    w = 0.38
    bars1 = ax1.bar([i - w / 2 for i in x], means["detection_rate"] * 100, w,
                    color="#4C72B0", label="Detection rate (%)")
    ax1.set_ylabel("Detection rate (%)")
    ax1.set_ylim(0, 100)
    ax2 = ax1.twinx()
    bars2 = ax2.bar([i + w / 2 for i in x], means["processing_fps"], w,
                    color="#DD8452", label="Processing speed (frames/s)")
    ax2.set_ylabel("Processing speed (frames/s)")
    ax2.set_ylim(0, max(means["processing_fps"]) * 1.3)
    ax1.bar_label(bars1, fmt="%.0f", padding=2)
    ax2.bar_label(bars2, fmt="%.1f", padding=2)
    ax1.set_xticks(list(x), MODELS)
    ax1.set_title(f"PoseLandmarker models, mean of {int(means['clips'].iloc[0])} clips")
    ax1.legend(handles=[bars1, bars2], loc="upper right", fontsize=8)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def write_markdown(means, path):
    choice = recommend(means)
    fastest = means["processing_fps"].idxmax()
    best_det = means["detection_rate"].idxmax()
    n = int(means["clips"].iloc[0])
    arm_n = int(means["arm_clips"].min())

    def fmt(v, spec):
        return "-" if pd.isna(v) else format(v, spec)

    lines = [
        "# Model comparison: lite vs full vs heavy",
        "",
        f"Mean over {n} clips processed by all three models "
        f"(bowling-arm visibility over {arm_n} clips with a known bowling arm). "
        "Visibility is averaged over frames where a pose was detected. "
        "Processing speed depends on the computer used, so compare the models with each other, "
        "not with other machines.",
        "",
        "| Model | Detection rate | Processing speed (frames/s) | Bowling-arm visibility | All-keypoint visibility |",
        "|---|---|---|---|---|",
    ]
    for model, r in means.iterrows():
        lines.append(f"| {model} | {fmt(r.detection_rate, '.1%')} | {fmt(r.processing_fps, '.1f')} "
                     f"| {fmt(r.arm_visibility, '.3f')} | {fmt(r.all_visibility, '.3f')} |")

    c, f = means.loc[choice], means.loc[fastest]
    slowest = means["processing_fps"].idxmin()
    if best_det == fastest:
        detection = (f"It also found the bowler most often ({f.detection_rate:.1%} of frames), "
                     "so here a bigger model did not mean better detection. ")
    else:
        detection = (f"{best_det.capitalize()} found the bowler most often "
                     f"({means.at[best_det, 'detection_rate']:.1%} of frames, against "
                     f"{f.detection_rate:.1%} for {fastest}). ")
    lines += [
        "",
        f"{fastest.capitalize()} is the fastest model at {f.processing_fps:.1f} frames/s, "
        f"about {f.processing_fps / means.at[slowest, 'processing_fps']:.1f}x the speed of {slowest}. "
        + detection +
        f"Rule used for the app: take the fastest model unless a slower one raises the detection "
        f"rate by at least {MIN_DETECTION_GAIN * 100:.0f} percentage points or the bowling-arm "
        f"visibility by at least {MIN_VISIBILITY_GAIN:.2f}. "
        f"Recommendation: use **{choice}** in the app"
        + (", because the slower models do not detect the bowler or the bowling arm clearly better, "
           "so their extra processing time is not worth it."
           if choice == fastest else
           f", because its better detection ({c.detection_rate:.1%}) and bowling-arm visibility "
           f"({fmt(c.arm_visibility, '.3f')}) are worth the slower speed ({c.processing_fps:.1f} frames/s)."),
        "",
    ]
    Path(path).write_text("\n".join(lines), encoding="utf-8")
    return choice


def compare_models(processed_dir, metadata_path, out_dir, fallback_arm=None):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    df = collect(processed_dir, metadata_path, fallback_arm)
    df.to_csv(out_dir / "model_comparison.csv", index=False)
    means = model_means(df)
    plot(means, out_dir / "model_comparison.png")
    choice = write_markdown(means, out_dir / "model_comparison.md")
    return df, means, choice


def main():
    parser = argparse.ArgumentParser(description="Compare lite/full/heavy PoseLandmarker summaries.")
    parser.add_argument("--processed", default="../../data/processed",
                        help="folder with lite/, full/, heavy/ (default ../../data/processed)")
    parser.add_argument("--metadata", default="../../data/metadata.csv", help="metadata.csv")
    parser.add_argument("--out", default="experiments", help="output folder (default experiments)")
    parser.add_argument("--bowling-arm", choices=["left", "right"],
                        help="used for clips whose bowling arm is not in metadata.csv")
    args = parser.parse_args()

    df, means, choice = compare_models(args.processed, args.metadata, args.out, args.bowling_arm)
    print(f"{df['clip_id'].nunique()} clips x {len(MODELS)} models")
    print(means.round(4).to_string())
    print(f"recommended for the app: {choice} -> {Path(args.out) / 'model_comparison.md'}")


if __name__ == "__main__":
    main()
