"""C1's keypoint reliability (ICC gate), used when the C1 file does not carry it yet.

C1 measures test-retest ICC per keypoint and camera view and gates keypoints at
ICC >= 0.75. The C1 -> C2 contract has a "reliability" field for this, but the
handoff files of 18 Oct 2026 leave it empty. Until C1 fills it, C2 applies the
result C1 reported on 18 Oct 2026:

    side-on clips: knee and ankle keypoints ICC < 0.75 -> not usable
    wrist / elbow: reliable in every view

A "reliability" block inside the C1 file always takes priority over this table.
"""

C1_ICC_SOURCE = "C1 ICC study (reported by C1 on 2026-10-18): knee/ankle ICC < 0.75 in side-on clips"

_UNRELIABLE = {"icc": None, "band": "moderate", "usable": False, "source": C1_ICC_SOURCE}

DEFAULT_BY_VIEW = {
    "side": {name: dict(_UNRELIABLE) for name in
             ("left_knee", "right_knee", "left_ankle", "right_ankle")},
}


def reliability_for(delivery):
    """Return (reliability dict, where it came from)."""
    if delivery.reliability:
        return delivery.reliability, "c1_file"
    table = DEFAULT_BY_VIEW.get(delivery.view)
    if table:
        return table, "c1_icc_table"
    return {}, "none"
