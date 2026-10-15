"""CricShield Component 1 - Step 0: prepare the clip dataset.

Reads metadata.csv (one row per recorded video) and copies each usable video
to a new folder under its anonymised clip ID, e.g. B01_D02_side_5m.MOV.
The original files are not changed. Rows with use = "exclude" are skipped.

metadata.csv columns:
  original_file  file name in the raw folder (may contain the bowler's name -
                 keep metadata.csv on the team's private storage, never in git)
  clip_id        B<bowler>_D<delivery>_<angle>_<distance>, used everywhere after this step
  use            icc | test_occlusion | test_multi_person | check | exclude

Usage (run from components/c1_pose):
  python src/c1_pose/prepare_clips.py --metadata <metadata.csv> --raw <raw folder> --out <clips folder>
"""

import argparse
import shutil
from pathlib import Path

import pandas as pd


def prepare(metadata_path, raw_dir, out_dir):
    meta = pd.read_csv(metadata_path, dtype=str).fillna("")
    raw_dir, out_dir = Path(raw_dir), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    copied, skipped, missing = [], [], []
    for row in meta.itertuples(index=False):
        if row.use == "exclude" or not row.clip_id:
            skipped.append(row.original_file)
            continue
        src = raw_dir / row.original_file
        if not src.exists():
            missing.append(row.original_file)
            continue
        dst = out_dir / f"{row.clip_id}{src.suffix}"
        if not dst.exists():
            shutil.copy2(src, dst)
        copied.append((row.clip_id, row.use))
    return copied, skipped, missing


def main():
    parser = argparse.ArgumentParser(description="Copy usable videos under anonymised clip IDs.")
    parser.add_argument("--metadata", required=True, help="metadata.csv")
    parser.add_argument("--raw", required=True, help="folder with the original videos")
    parser.add_argument("--out", required=True, help="folder for the renamed copies")
    args = parser.parse_args()

    copied, skipped, missing = prepare(args.metadata, args.raw, args.out)
    for clip_id, use in copied:
        print(f"  {clip_id:<26} {use}")
    print(f"{len(copied)} clips ready in {args.out}, {len(skipped)} excluded")
    if missing:
        print("WARNING - listed in metadata but not found: " + ", ".join(missing))


if __name__ == "__main__":
    main()
