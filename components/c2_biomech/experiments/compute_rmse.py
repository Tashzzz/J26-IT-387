"""Validation: compare C2 angles with angles measured by hand in Kinovea.

Fill the kinovea_value_deg column of kinovea_validation.csv, then run (from components/c2_biomech):
    python experiments/compute_rmse.py

Knee: Kinovea's Angle tool gives the INCLUDED angle at the knee (180 = straight leg).
C2 reports FLEXION (0 = straight), so the script converts: flexion = 180 - included angle.
Trunk: measured directly as the angle between the vertical and the mid-hip -> mid-shoulder line.

Prints, per feature and overall: n, mean difference (C2 - manual, i.e. bias), mean absolute
error, RMSE and the largest error. Proposal target: RMSE < 5 deg.
"""

import csv
import math
from collections import defaultdict
from pathlib import Path

SHEET = Path(__file__).with_name("kinovea_validation.csv")


def main():
    rows = list(csv.DictReader(open(SHEET, newline="")))
    diffs = defaultdict(list)
    for r in rows:
        if not r["kinovea_value_deg"].strip():
            continue
        manual = float(r["kinovea_value_deg"])
        if "knee" in r["feature"]:
            manual = 180.0 - manual  # included angle -> flexion
        d = float(r["c2_value_deg"]) - manual
        diffs[r["feature"]].append(d)
        diffs["ALL"].append(d)
    if not diffs:
        raise SystemExit(f"No Kinovea values filled in {SHEET.name} yet.")

    print(f"{'feature':34s} {'n':>3s} {'bias':>7s} {'MAE':>7s} {'RMSE':>7s} {'max':>7s}")
    for feat, d in sorted(diffs.items(), key=lambda kv: kv[0] == "ALL"):
        n = len(d)
        bias = sum(d) / n
        mae = sum(abs(x) for x in d) / n
        rmse = math.sqrt(sum(x * x for x in d) / n)
        print(f"{feat:34s} {n:3d} {bias:7.1f} {mae:7.1f} {rmse:7.1f} {max(abs(x) for x in d):7.1f}")
    print("\nTarget from the proposal: RMSE < 5 deg. bias > 0 means C2 reads higher than the manual value.")


if __name__ == "__main__":
    main()
