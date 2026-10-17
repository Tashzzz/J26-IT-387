"""Figure for one delivery: filter evidence, events, angles with limits (report / PP1 / app fallback)."""

import matplotlib

matplotlib.use("Agg")  # no screen needed
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

INK, INK2, GRID = "#0b0b0b", "#52514e", "#e4e3df"
BLUE, GREY = "#2a78d6", "#b9b8b2"
LEVEL_COLOUR = {"red": "#c0392b", "amber": "#b9770e", "green": "#1e8449", "none": INK}
EVENT_LABEL = {"bfc_frame": "BFC", "ffc_frame": "FFC", "release_frame": "Release"}


def _events(ax, row, t, label):
    for ev, frame in row["events"].items():
        ax.axvline(t.iloc[frame], color="#888888", lw=0.8, ls=":")
        if label:
            ax.text(t.iloc[frame], 0.97, EVENT_LABEL[ev], ha="center", va="top", fontsize=8,
                    color="#444444", transform=ax.get_xaxis_transform(),
                    bbox=dict(facecolor="white", edgecolor="none", pad=1))


def _feature_title(ax, row, name):
    f = row["features"][name]
    v = "n/a" if f["value"] is None else f"{f['value']:g} deg"
    title = f"{name}: {v}"
    if f["threshold"] is not None and f["value"] is not None:
        title += f"  [{f['level'].upper()}]"
    title += f"   ({f['method']}, view {f['view_suitability']})"
    if not f["reliable"] and f["value"] is not None:
        title += "  - not reliable"
    ax.set_title(title, fontsize=8.5, loc="left", color=LEVEL_COLOUR[f["level"]])


def _limit(ax, row, name, symmetric=False):
    f = row["features"][name]
    if f["threshold"] is None:
        return
    for lim in ([f["threshold"], -f["threshold"]] if symmetric else [f["threshold"]]):
        ax.axhline(lim, ls="--", color="#c0392b", lw=1)
    ax.text(0.005, f["threshold"], f" limit {f['threshold']:g}", color="#c0392b", va="bottom",
            fontsize=7.5, transform=ax.get_yaxis_transform())


def plot_delivery(row, series, out_path):
    t = series["t"]
    has_scr = "bfc_frame" in row["events"] and "ffc_frame" in row["events"]
    n = 5 if has_scr else 4
    fig, axes = plt.subplots(n, 1, figsize=(9, 2.1 * n + 0.6), sharex=True)
    for ax in axes:
        ax.grid(color=GRID, lw=0.7)
        ax.set_axisbelow(True)
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)

    # 1. Filter evidence: bowling wrist height, raw vs Butterworth.
    ax = axes[0]
    ax.plot(t, series["raw_wrist_y"], color=GREY, lw=1, label="raw")
    ax.plot(t, series["wrist_y"], color=BLUE, lw=1.8, label="filtered")
    f = row["filter"]
    ax.set_title(f"Bowling wrist height - Butterworth {f['cutoff_hz']} Hz, zero lag"
                 + (f"; jitter -{f['jitter_reduction_pct']}%" if f.get("jitter_reduction_pct") else ""),
                 fontsize=8.5, loc="left", color=INK)
    ax.set_ylabel("y (down)", fontsize=8, color=INK2)
    ax.invert_yaxis()
    ax.legend(frameon=False, fontsize=7.5, loc="lower right")
    _events(ax, row, t, True)

    # 2. Arm elevation (release detection).
    ax = axes[1]
    ax.plot(t, series["arm_elevation"], color=BLUE, lw=1.8)
    ax.set_ylabel("arm above\nshoulder", fontsize=8, color=INK2)
    ax.set_title(f"Release = highest arm (method: {row['event_method'].get('release_frame')})",
                 fontsize=8.5, loc="left", color=INK)
    _events(ax, row, t, False)

    # 3/4. Knee and trunk.
    for ax, col, raw_col, name, lab in (
        (axes[2], "front_knee_flexion_deg", "raw_front_knee_flexion_deg",
         "front_knee_flexion_release_deg", "front-knee\nflexion"),
        (axes[3], "trunk_lateral_flexion_deg", "raw_trunk_lateral_flexion_deg",
         "trunk_lateral_flexion_deg", "trunk\nside-bend"),
    ):
        ax.plot(t, series[raw_col], color=GREY, lw=1)
        ax.plot(t, series[col], color=BLUE, lw=1.8)
        ax.set_ylabel(lab + " (deg)", fontsize=8, color=INK2)
        _limit(ax, row, name)
        _feature_title(ax, row, name)
        _events(ax, row, t, False)

    # 5. SCR, only when BFC and FFC are known.
    if has_scr:
        ax = axes[4]
        ax.plot(t, series["shoulder_rotation_from_bfc_deg"], color=BLUE, lw=1.8)
        ax.set_ylabel("shoulder twist\nfrom BFC (deg)", fontsize=8, color=INK2)
        _limit(ax, row, "shoulder_counter_rotation_deg", symmetric=True)
        _feature_title(ax, row, "shoulder_counter_rotation_deg")
        _events(ax, row, t, False)

    # Zoom to the delivery stretch when known.
    stretch = (row.get("delivery") or {}).get("delivery_stretch")
    if stretch:
        a, b = stretch
        axes[-1].set_xlim(t.iloc[a] - 0.05, t.iloc[b] + 0.05)
    axes[-1].set_xlabel("Time (s)", color=INK2)
    fig.suptitle(f"C2 biomechanics - {row['video_id']} (view: {row.get('view')})", fontsize=10.5)
    fig.tight_layout()
    fig.savefig(out_path, dpi=140)
    plt.close(fig)
    return out_path
