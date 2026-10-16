"""Angle-over-time figure for one delivery (report / PP1 slide / app fallback)."""

import matplotlib

matplotlib.use("Agg")  # no screen needed
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

LEVEL_COLOUR = {"red": "#c0392b", "amber": "#b9770e", "green": "#1e8449", "none": "#333333"}
EVENT_LABEL = {"bfc_frame": "BFC", "ffc_frame": "FFC", "release_frame": "Release"}

# (series column, y-axis label, feature it illustrates, draw limit as +/-?)
PANELS = [
    ("shoulder_rotation_from_bfc_deg", "Shoulder twist\nfrom BFC (deg)", "shoulder_counter_rotation_deg", True),
    ("front_knee_flexion_deg", "Front-knee\nflexion (deg)", "front_knee_flexion_release_deg", False),
    ("trunk_lateral_flexion_deg", "Trunk\nside-bend (deg)", "trunk_lateral_flexion_deg", False),
]


def plot_delivery(row, series, out_path):
    fig, axes = plt.subplots(len(PANELS), 1, figsize=(8, 7.5), sharex=True)
    t = series["t"]
    for ax, (col, label, feat_name, symmetric) in zip(axes, PANELS):
        y = series[col]
        ax.plot(t, y, color="#1f4e79", lw=1.8)
        ax.set_ylabel(label)
        ax.grid(alpha=0.3)

        feat = row["features"][feat_name]
        if feat["threshold"] is not None:
            limits = [feat["threshold"], -feat["threshold"]] if symmetric else [feat["threshold"]]
            for lim in limits:
                ax.axhline(lim, ls="--", color="#c0392b", lw=1)
            ax.text(0.005, feat["threshold"], f" limit {feat['threshold']:g}", color="#c0392b",
                    va="bottom", fontsize=8, transform=ax.get_yaxis_transform())

        for ev, frame in row["events"].items():
            ax.axvline(t.iloc[frame], color="#888888", lw=0.8, ls=":")
            ax.text(t.iloc[frame], 0.97, EVENT_LABEL[ev], ha="center", va="top", fontsize=8,
                    color="#444444", transform=ax.get_xaxis_transform(),
                    bbox=dict(facecolor="white", edgecolor="none", pad=1))

        value = feat["value"]
        title = f"{feat_name}: {'n/a' if value is None else f'{value:g} deg'}"
        if feat["threshold"] is not None:
            title += f"  [{feat['level'].upper()}]"
        if not feat["reliable"]:
            title += "  (low reliability)"
        ax.set_title(title, fontsize=9, loc="left", color=LEVEL_COLOUR[feat["level"]])
        if np.isfinite(y).any():
            lo, hi = np.nanmin(y), np.nanmax(y)
            if feat["threshold"] is not None:
                lo = min(lo, -feat["threshold"] if symmetric else feat["threshold"])
                hi = max(hi, feat["threshold"])
            pad = 0.15 * (hi - lo or 1)
            ax.set_ylim(lo - pad, hi + pad)

    axes[-1].set_xlabel("Time (s)")
    fig.suptitle(f"C2 biomechanics - {row['video_id']}", fontsize=11)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)
    return out_path
