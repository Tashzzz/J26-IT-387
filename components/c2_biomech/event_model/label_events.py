"""
Step 2: Mark BFC, FFC and BR by hand, one video at a time.

Usage:
    python label_events.py --video data/videos/clip01.mp4 --bowler B01 --arm R --labels data/labels.csv

Keys (click the video window first):
    d / a      next / previous frame
    l / j      +10 / -10 frames
    b          mark BACK FOOT CONTACT  (first frame rear foot touches the ground)
    f          mark FRONT FOOT CONTACT (first frame front foot touches the ground)
    r          mark BALL RELEASE       (last frame the ball is still touching the hand)
    s          save to labels.csv and quit
    q          quit without saving

Labelling rules - write these in your thesis and keep them identical for every clip:
  * Contact = the FIRST frame any part of that foot touches the ground.
  * Release = the LAST frame the ball is still in contact with the fingers.
  * Re-label 10 clips a week later to report your own (intra-rater) labelling error.
"""

import argparse
from pathlib import Path

import cv2
import pandas as pd


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--bowler", required=True, help="anonymous bowler id, e.g. B01")
    ap.add_argument("--arm", choices=["R", "L"], required=True)
    ap.add_argument("--labels", default="data/labels.csv")
    a = ap.parse_args()

    cap = cv2.VideoCapture(a.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f)
    cap.release()
    if not frames:
        raise SystemExit("Could not read video.")

    marks, i, win = {}, 0, "label - d/a step, b/f/r mark, s save"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    while True:
        img = frames[i].copy()
        txt = f"frame {i}/{len(frames)-1}  fps {fps:.0f}   " + "  ".join(
            f"{k.upper()}={v}" for k, v in sorted(marks.items()))
        cv2.putText(img, txt, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 4)
        cv2.putText(img, txt, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        for k, v in marks.items():
            if v == i:
                cv2.putText(img, k.upper(), (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 3)
        cv2.imshow(win, img)
        key = cv2.waitKey(0) & 0xFF
        if key == ord("d"):
            i = min(i + 1, len(frames) - 1)
        elif key == ord("a"):
            i = max(i - 1, 0)
        elif key == ord("l"):
            i = min(i + 10, len(frames) - 1)
        elif key == ord("j"):
            i = max(i - 10, 0)
        elif key in (ord("b"), ord("f"), ord("r")):
            marks[{"b": "bfc", "f": "ffc", "r": "br"}[chr(key)]] = i
        elif key == ord("q"):
            cv2.destroyAllWindows()
            return
        elif key == ord("s"):
            if set(marks) != {"bfc", "ffc", "br"}:
                print("Mark all three events first (b, f, r).")
                continue
            if not marks["bfc"] < marks["ffc"] < marks["br"]:
                print("Order must be BFC < FFC < BR - check your marks.")
                continue
            break
    cv2.destroyAllWindows()

    clip_id = Path(a.video).stem
    row = dict(clip_id=clip_id, bowler_id=a.bowler, bowling_arm=a.arm, fps=round(fps, 3), **marks)
    p = Path(a.labels)
    p.parent.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(p) if p.exists() else pd.DataFrame(columns=row.keys())
    df = df[df.clip_id != clip_id]  # re-labelling replaces the old row
    df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    df.to_csv(p, index=False)
    print(f"Saved {row} -> {p}")


if __name__ == "__main__":
    main()
