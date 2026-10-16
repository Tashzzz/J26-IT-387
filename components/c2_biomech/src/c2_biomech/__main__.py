"""Command line: run C2 on one delivery or a folder of deliveries.

Usage (from components/c2_biomech, venv active, after `pip install -e .`):
    python -m c2_biomech ../../contracts/samples/c1_sample.json
    python -m c2_biomech ../../data/processed/B01_D01_side_10m_stable.csv --fps 60 --arm right
    python -m c2_biomech ../../data/processed --arm right            # every *_stable.csv / *.json
    python -m c2_biomech <file> --bfc 112 --ffc 121 --release 131    # manual event frames
    python -m c2_biomech --synthetic                                  # known-answer demo delivery

Writes to experiments/ (or --out):
    <video_id>_c2_features.json   C2 contract output for C3
    <video_id>_angles.csv         every angle per frame
    <video_id>_angles.png         figure with events and limits
and a summary table c2_batch_summary.csv when a folder is given.
"""

import argparse
import json
import time
from pathlib import Path

import pandas as pd

from .features import compute_features
from .loader import from_c1_json, load_delivery
from .plot import plot_delivery

DEFAULT_OUT = "experiments"


def run_one(delivery, out_dir, overrides=None, make_plot=True):
    start = time.perf_counter()
    row, series = compute_features(delivery, overrides)
    row["processing_seconds"] = round(time.perf_counter() - start, 4)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = out_dir / delivery.video_id
    with open(f"{stem}_c2_features.json", "w") as f:
        json.dump(row, f, indent=2)
    series.to_csv(f"{stem}_angles.csv", index=False)
    if make_plot:
        plot_delivery(row, series, f"{stem}_angles.png")
    return row


def print_row(row):
    ev = row["events"]
    print(f"{row['video_id']}: BFC {ev.get('bfc_frame')}  FFC {ev.get('ffc_frame')}  "
          f"release {ev.get('release_frame')}  ({row['processing_seconds'] * 1000:.0f} ms)")
    for name, f in row["features"].items():
        val = "n/a" if f["value"] is None else f"{f['value']:6.1f}"
        lim = "" if f["threshold"] is None else f"limit {f['rule']} {f['threshold']:g}"
        rel = "" if f["reliable"] else "  low reliability"
        print(f"  {name:34s} {val}  {f['level']:5s} {lim}{rel}")
    for w in row["warnings"]:
        print(f"  ! {w}")


def main():
    p = argparse.ArgumentParser(description="CricShield C2 - biomechanical features for a delivery")
    p.add_argument("input", nargs="?", help="C1 JSON, C1 *_stable.csv, or a folder of them")
    p.add_argument("--fps", type=float, help="frame rate (CSV input; default: C1 summary JSON)")
    p.add_argument("--arm", choices=["left", "right"], default="right", help="bowling arm (CSV input)")
    p.add_argument("--bfc", type=int, help="manual back-foot contact frame")
    p.add_argument("--ffc", type=int, help="manual front-foot contact frame")
    p.add_argument("--release", type=int, help="manual release frame")
    p.add_argument("--out", default=DEFAULT_OUT, help=f"output folder (default {DEFAULT_OUT})")
    p.add_argument("--no-plot", action="store_true")
    p.add_argument("--synthetic", action="store_true", help="run on a synthetic delivery with known angles")
    a = p.parse_args()

    overrides = {"bfc_frame": a.bfc, "ffc_frame": a.ffc, "release_frame": a.release}

    if a.synthetic:
        from .synthetic import make_delivery
        data = make_delivery()
        row = run_one(from_c1_json(data), a.out, overrides, not a.no_plot)
        print_row(row)
        print("  true values:", {k: v for k, v in data["_truth"].items()})
        return
    if not a.input:
        p.error("give an input file/folder or --synthetic")

    path = Path(a.input)
    if path.is_dir():
        files = sorted(list(path.glob("*_stable.csv")) + list(path.glob("*.json")))
        files = [f for f in files if not f.name.endswith(("_summary.json", "_report.json",
                                                          "_c2_features.json"))]
        rows = []
        for f in files:
            try:
                row = run_one(load_delivery(f, a.fps, a.arm), a.out, None, not a.no_plot)
                print_row(row)
                rows.append({"video_id": row["video_id"], **row["events"],
                             **{k: v["value"] for k, v in row["features"].items()},
                             "n_breaches": row["n_breaches"], "warnings": len(row["warnings"])})
            except Exception as e:  # one bad clip must not stop the batch
                print(f"{f.name}: FAILED - {e}")
                rows.append({"video_id": f.stem, "error": str(e)})
        if rows:
            pd.DataFrame(rows).to_csv(Path(a.out) / "c2_batch_summary.csv", index=False)
            print(f"\n{len(rows)} files -> {Path(a.out) / 'c2_batch_summary.csv'}")
        return

    row = run_one(load_delivery(path, a.fps, a.arm), a.out, overrides, not a.no_plot)
    print_row(row)


if __name__ == "__main__":
    main()
