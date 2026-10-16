"""Command line: run C2 on one delivery or a folder of deliveries.

Usage (from components/c2_biomech, venv active, after `pip install -e .`):
    python -m c2_biomech ../../data/handoff/B01_D01_front_5m.json
    python -m c2_biomech ../../data/handoff                      # every C1 *.json / *_stable.csv
    python -m c2_biomech ../../data/handoff --events events.csv   # manual BFC / FFC per clip
    python -m c2_biomech <file> --bfc 112 --ffc 121 --release 131  # manual events, one clip
    python -m c2_biomech <file> --cutoff auto                    # residual-analysis cutoff
    python -m c2_biomech --synthetic                              # known-answer demo delivery

events.csv columns: video_id,bfc_frame,ffc_frame,release_frame (leave a cell empty = auto).
Frame numbers are indexes into the C1 file's "frames" list (= frame number in the clip).

Writes to experiments/ (or --out):
    <video_id>_c2_features.json   C2 contract output for C3
    <video_id>_angles.csv         every angle per frame
    <video_id>_angles.png         figure: filter, events, angles and limits
    c2_batch_summary.csv          one row per clip (folder input)
"""

import argparse
import json
import time
from pathlib import Path

import pandas as pd

from .features import DEFAULT_CUTOFF_HZ, compute_features
from .loader import from_c1_json, load_delivery
from .plot import plot_delivery

DEFAULT_OUT = "experiments"
SKIP_SUFFIXES = ("_summary.json", "_report.json", "_c2_features.json", "_info.json")


def read_events_csv(path):
    """{video_id: {bfc_frame, ffc_frame, release_frame}} from a CSV (empty cell = auto)."""
    df = pd.read_csv(path, dtype=str).fillna("")
    out = {}
    for _, r in df.iterrows():
        out[r["video_id"].strip()] = {
            k: int(float(r[k])) for k in ("bfc_frame", "ffc_frame", "release_frame")
            if k in r and str(r[k]).strip() != ""}
    return out


def run_one(delivery, out_dir, overrides=None, make_plot=True, cutoff=DEFAULT_CUTOFF_HZ,
            filter_mode="auto"):
    start = time.perf_counter()
    row, series = compute_features(delivery, overrides, filter_mode=filter_mode, cutoff=cutoff)
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
    print(f"{row['video_id']} ({row.get('view')}): BFC {ev.get('bfc_frame')}  FFC {ev.get('ffc_frame')}  "
          f"release {ev.get('release_frame')}  ({row['processing_seconds'] * 1000:.0f} ms)")
    for name, f in row["features"].items():
        val = "n/a" if f["value"] is None else f"{f['value']:6.1f}"
        lim = "" if f["threshold"] is None else f"limit {f['rule']} {f['threshold']:g}"
        rel = "" if f["reliable"] or f["value"] is None else "  NOT RELIABLE"
        print(f"  {name:34s} {val:>6}  {f['level']:5s} {f['method']} {f['view_suitability']:8s} {lim}{rel}")
    for w in row["warnings"]:
        print(f"  ! {w}")


def summary_row(row):
    return {"video_id": row["video_id"], "view": row.get("view"), **row["events"],
            **{k: v["value"] for k, v in row["features"].items()},
            **{f"{k}_reliable": v["reliable"] for k, v in row["features"].items()},
            "n_breaches": row["n_breaches"], "cutoff_hz": row["filter"]["cutoff_hz"],
            "frames_kept": row["quality"]["frames_kept"], "warnings": len(row["warnings"])}


def main():
    p = argparse.ArgumentParser(description="CricShield C2 - biomechanical features for a delivery")
    p.add_argument("input", nargs="?", help="C1 JSON, C1 *_stable.csv, or a folder of them")
    p.add_argument("--fps", type=float, help="frame rate (CSV input; default: C1 summary JSON)")
    p.add_argument("--arm", choices=["left", "right"], default="right", help="bowling arm (CSV input)")
    p.add_argument("--bfc", type=int, help="manual back-foot contact frame")
    p.add_argument("--ffc", type=int, help="manual front-foot contact frame")
    p.add_argument("--release", type=int, help="manual release frame")
    p.add_argument("--events", help="CSV with manual event frames per video_id")
    p.add_argument("--cutoff", default=str(DEFAULT_CUTOFF_HZ),
                   help=f"Butterworth cutoff in Hz, or 'auto' (default {DEFAULT_CUTOFF_HZ})")
    p.add_argument("--filter", choices=["auto", "on", "off"], default="auto")
    p.add_argument("--out", default=DEFAULT_OUT, help=f"output folder (default {DEFAULT_OUT})")
    p.add_argument("--no-plot", action="store_true")
    p.add_argument("--synthetic", action="store_true", help="run on a synthetic delivery with known angles")
    a = p.parse_args()

    cutoff = "auto" if a.cutoff == "auto" else float(a.cutoff)
    manual = read_events_csv(a.events) if a.events else {}
    cli = {k: v for k, v in {"bfc_frame": a.bfc, "ffc_frame": a.ffc,
                             "release_frame": a.release}.items() if v is not None}
    opts = dict(make_plot=not a.no_plot, cutoff=cutoff, filter_mode=a.filter)

    if a.synthetic:
        from .synthetic import make_delivery
        data = make_delivery()
        truth = data.pop("_truth")
        row = run_one(from_c1_json(data), a.out, cli, **opts)
        print_row(row)
        print("  true values:", truth)
        return
    if not a.input:
        p.error("give an input file/folder or --synthetic")

    path = Path(a.input)
    files = [path]
    if path.is_dir():
        files = sorted(list(path.glob("*_stable.csv")) + list(path.glob("*.json")))
        files = [f for f in files if not f.name.endswith(SKIP_SUFFIXES)]

    rows = []
    for f in files:
        try:
            d = load_delivery(f, a.fps, a.arm)
            row = run_one(d, a.out, {**manual.get(d.video_id, {}), **cli}, **opts)
            print_row(row)
            rows.append(summary_row(row))
        except Exception as e:  # one bad clip must not stop the batch
            print(f"{f.name}: FAILED - {e}")
            rows.append({"video_id": f.stem, "error": str(e)})
    if len(files) > 1 and rows:
        out = Path(a.out) / "c2_batch_summary.csv"
        pd.DataFrame(rows).to_csv(out, index=False)
        print(f"\n{len(rows)} files -> {out}")


if __name__ == "__main__":
    main()
