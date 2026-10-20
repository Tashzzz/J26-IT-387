"""Validation: automatic BFC / FFC / release vs frames marked by hand from the videos.

Run from components/c2_biomech, with C1's keypoint files for the clips in a folder:
    python experiments/validate_events.py ../../data/handoff

Uses the newest experiments/events_manual_*.csv. Keypoint files stay in data/ (not in git).
Prints the error per clip and the mean / max error in frames and milliseconds.
"""

import csv
import json
import sys
from pathlib import Path

from c2_biomech.features import compute_features
from c2_biomech.loader import from_c1_json

HERE = Path(__file__).parent
EVENTS = ("bfc_frame", "ffc_frame", "release_frame")


def main(folder):
    manual_csv = sorted(HERE.glob("events_manual_*.csv"))[-1]
    manual = {r["video_id"]: r for r in csv.DictReader(open(manual_csv, newline=""))}
    errors = {e: [] for e in EVENTS}
    print(f"{'clip':24s} {'view':10s} " + "  ".join(f"{e[:-6].upper():>12s}" for e in EVENTS) + "   (auto vs hand)")
    for path in sorted(Path(folder).glob("*.json")):
        c1 = json.loads(path.read_text())
        if c1.get("video_id") not in manual:
            continue
        delivery = from_c1_json(c1)
        row, _ = compute_features(delivery)
        cells = []
        for e in EVENTS:
            auto, hand = row["events"].get(e), int(manual[c1["video_id"]][e])
            if auto is None:
                cells.append(f"{'-':>5s} vs {hand:<4d}")
                continue
            errors[e].append((abs(auto - hand), abs(auto - hand) / delivery.fps * 1000))
            cells.append(f"{auto:>5d} vs {hand:<4d}")
        print(f"{delivery.video_id:24s} {delivery.view or '-':10s} " + "  ".join(cells))
    print()
    for e, errs in errors.items():
        if errs:
            fr, ms = zip(*errs)
            print(f"{e[:-6].upper():8s} n={len(errs):2d}  mean {sum(fr)/len(fr):.1f} frames ({sum(ms)/len(ms):.0f} ms)"
                  f"  max {max(fr)} frames ({max(ms):.0f} ms)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "../../data/handoff")
