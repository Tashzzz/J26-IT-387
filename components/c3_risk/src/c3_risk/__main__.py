"""Command line.

  python -m c3_risk train --data ../../data/c3_synthetic/data      train + save the model
  python -m c3_risk predict --c2 ../../contracts/samples/c2_sample.json   score the contract sample
  python -m c3_risk card                                            print the model card
"""
import argparse
import json
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parents[2]


def main() -> None:
    ap = argparse.ArgumentParser(prog="c3_risk")
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train", help="train on the synthetic development dataset")
    t.add_argument("--data", required=True, help="folder with athletes.csv, spells.csv, deliveries.csv ...")
    t.add_argument("--out", default=None, help="model folder (default components/c3_risk/models)")
    t.add_argument("--seed", type=int, default=2026)
    t.add_argument("--no-experiments", action="store_true", help="do not write experiments/ metrics files")
    p = sub.add_parser("predict", help="score a C2 file with a demo profile and workload")
    p.add_argument("--c2", default=str(HERE.parents[1] / "contracts" / "samples" / "c2_sample.json"))
    sub.add_parser("card", help="print the saved model card")
    a = ap.parse_args()

    if a.cmd == "train":
        from .train import train
        train(Path(a.data), Path(a.out) if a.out else None, a.seed,
              experiments_dir=None if a.no_experiments else HERE / "experiments")
    elif a.cmd == "predict":
        from .service import run
        rows = json.loads(Path(a.c2).read_text(encoding="utf-8"))
        rows = rows if isinstance(rows, list) else [rows]
        bowler = rows[0]["bowler_id"]
        today = date.today()
        athlete = {"bowler_id": bowler, "birth_year": today.year - 17, "playing_level": "club", "injury_history": []}
        log = [{"session_date": today - timedelta(days=d), "session_type": "nets", "overs": o}
               for d, o in [(27, 6), (24, 6), (20, 7), (17, 6), (13, 7), (10, 6), (6, 9), (4, 10), (2, 8), (1, 7)]]
        r = run(athlete, log, rows)
        print(json.dumps({k: r[k] for k in ("bowler_id", "risk_score", "risk_level", "probability_28d",
                                             "top_factors", "explanation", "data_quality")}, indent=2, default=str))
    elif a.cmd == "card":
        from .model import get_model
        print(json.dumps(get_model().card, indent=2))


if __name__ == "__main__":
    main()
