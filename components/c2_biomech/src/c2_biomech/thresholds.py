"""Published risk thresholds used for clinical mapping (key function 2).

Kept in one place so they can be changed after physiotherapist review without
touching the angle code. Each entry:
    threshold  limit in degrees (None = no published limit, value is reported only)
    rule       "above" -> breach when value > threshold
               "below" -> breach when value < threshold
    amber_band how close (in degrees, on the safe side) counts as "amber"
    source     reference shown in the app and in the C2 JSON

TO CONFIRM BEFORE PP1 (recorded in docs/decisions.md):
    - Trunk lateral flexion: the proposal says > 10 deg, the C2 contract sample
      says 40 deg. Fast bowlers commonly side-bend well past 10 deg at release,
      so 10 deg would flag almost every delivery. 40 deg is used here until the
      limit is checked against the cited paper / physiotherapist.
    - Front knee: the proposal states the limit as "included angle > 150 deg at
      release", i.e. flexion < 30 deg. Applied at release; the FFC value is
      reported without a threshold, as in the contract sample.
"""

THRESHOLDS = {
    "shoulder_counter_rotation_deg": {
        "threshold": 30.0, "rule": "above", "amber_band": 5.0,
        "source": "Portus et al. (2004); Elliott et al. (2007)",
        "meaning": "Mixed action: shoulders twist back against the hips between BFC and FFC",
    },
    "front_knee_flexion_ffc_deg": {
        "threshold": None, "rule": None, "amber_band": None,
        "source": "Felton et al. (2019)",
        "meaning": "Front-knee bend as the front foot lands",
    },
    "front_knee_flexion_release_deg": {
        "threshold": 30.0, "rule": "below", "amber_band": 5.0,
        "source": "Proposal limit: knee angle > 150 deg at release (flexion < 30 deg)",
        "meaning": "Locked, nearly straight front knee at release",
    },
    "trunk_lateral_flexion_deg": {
        "threshold": 40.0, "rule": "above", "amber_band": 5.0,
        "source": "Alway et al. (2021) - limit to be confirmed",
        "meaning": "Side-bend of the trunk at ball release",
    },
    "hip_shoulder_separation_bfc_deg": {
        "threshold": None, "rule": None, "amber_band": None,
        "source": "Portus et al. (2004) - used to classify the action type",
        "meaning": "Angle between the hip line and shoulder line at BFC",
    },
}


def classify(name, value, thresholds=None):
    """Return (breach, level) for one feature value.

    level: 'red' (breach), 'amber' (within amber_band of the limit), 'green',
           or 'none' when there is no threshold or no value.
    """
    t = (thresholds or THRESHOLDS)[name]
    if value is None or t["threshold"] is None:
        return False, "none"
    limit, band = t["threshold"], t["amber_band"] or 0.0
    if t["rule"] == "above":
        if value > limit:
            return True, "red"
        return False, "amber" if value > limit - band else "green"
    if t["rule"] == "below":
        if value < limit:
            return True, "red"
        return False, "amber" if value < limit + band else "green"
    raise ValueError(f"unknown rule {t['rule']!r} for {name}")
