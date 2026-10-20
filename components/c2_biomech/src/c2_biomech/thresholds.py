"""Published risk thresholds used for clinical mapping (key function 2).

Kept in one place so they can be changed after physiotherapist review without
touching the angle code. Each entry:
    threshold  red limit in degrees (None = no published limit, value is reported only)
    rule       "above" -> breach when value > threshold
               "below" -> breach when value < threshold
    amber_band how close (in degrees, on the safe side) counts as "amber"
    source     reference shown in the app and in the C2 JSON
    evidence   the numbers behind the limit (injured vs uninjured groups)

How the limits were chosen (20 Oct 2026, see docs/decisions.md):
    The red limits are where the published injured-bowler groups sit, so a
    breach means "like the bowlers who got injured"; the amber band reaches back
    towards the uninjured groups. They are screening limits for a coach or
    physiotherapist to review, not a diagnosis. All come from studies of male
    bowlers (adolescent and adult); none is validated for Sri Lankan school or
    club bowlers yet. C3 keeps the same red limits (c3_risk/spec.py C2_INPUTS) -
    change both together.

    Shoulder counter-rotation  > 30 deg  Portus et al. mixed-action criterion. Stress-fracture
                                         bowlers 41 +/- 10 deg vs uninjured 19 +/- 10 deg.
                                         Alway et al. (2021, elite adults) found no difference
                                         (43 vs 40 deg), so it is strongest for young bowlers.
    Front knee at release      < 30 deg  flexion, i.e. knee straighter than 150 deg. Trunk-injured
                                         bowlers 149-155 deg vs uninjured 131 +/- 12 deg (Portus);
                                         a more extended front knee raised impact/braking forces
                                         (Portus) and lumbo-pelvic loading in adolescents (Crewe
                                         et al. 2013). Amber 30-40 deg reaches the midpoint
                                         (about 141 deg). NOTE: a braced knee also adds pace, so
                                         coaches often call it "good bracing" - the risk is load.
    Trunk side-bend at release > 40 deg  Bayne et al. (2016, adolescents, prospective): injured
                                         50 +/- 6 deg vs uninjured 40 +/- 8 deg. 40 deg = above the
                                         uninjured average (sensitive screening); 50 deg = injured
                                         average. Not the 10 deg in the proposal: most fast bowlers
                                         exceed 10 deg.
    Hip-shoulder separation    > 30 deg  at BFC: the other half of the Portus mixed-action
                                         definition (separation >= 30 deg at BFC or SCR >= 30 deg).
    Front knee at FFC          reported  Portus: injured 165-167 deg vs uninjured 154 deg, no
                                         published cut-off; Alway (2021) no difference (163 deg both).
"""

THRESHOLDS = {
    "shoulder_counter_rotation_deg": {
        "threshold": 30.0, "rule": "above", "amber_band": 5.0,
        "source": "Portus et al. (2004) - mixed-action criterion",
        "evidence": "Stress-fracture bowlers 41° vs uninjured 19° (Portus); not confirmed in elite adults (Alway 2021)",
        "meaning": "Mixed action: shoulders twist back against the hips between BFC and FFC - linked to lower-back stress fractures",
    },
    "front_knee_flexion_ffc_deg": {
        "threshold": None, "rule": None, "amber_band": None,
        "source": "Portus et al. (2004); Alway et al. (2021) - no published limit",
        "evidence": "Injured 165-167° vs uninjured 154° knee angle (Portus); no difference in Alway 2021",
        "meaning": "Front-knee bend as the front foot lands",
    },
    "front_knee_flexion_release_deg": {
        "threshold": 30.0, "rule": "below", "amber_band": 10.0,
        "source": "Portus et al. (2004); Crewe et al. (2013)",
        "evidence": "Trunk-injured bowlers 149-155° vs uninjured 131° knee angle at release; straighter knee = more lumbar load",
        "meaning": "Straight, braced front knee at release (knee angle over 150°): more force goes up into the lower back",
    },
    "trunk_lateral_flexion_deg": {
        "threshold": 40.0, "rule": "above", "amber_band": 5.0,
        "source": "Bayne et al. (2016); Ranson et al. (2008)",
        "evidence": "Injured 50° vs uninjured 40° side-bend at release (Bayne 2016, adolescents)",
        "meaning": "Side-bend of the trunk at ball release - more side-bend loads the lower back",
    },
    "hip_shoulder_separation_bfc_deg": {
        "threshold": 30.0, "rule": "above", "amber_band": 5.0,
        "source": "Portus et al. (2004) - mixed-action criterion",
        "evidence": "Mixed action = hip-shoulder separation of 30° or more at BFC, or SCR of 30° or more",
        "meaning": "Hips and shoulders point in different directions at back-foot contact (part of a mixed action)",
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
