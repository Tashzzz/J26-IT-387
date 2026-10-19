"""Feature specification for the C3 risk model.

One place that says, for every model feature:
  * which modality it belongs to (contract enum: kinematics / workload / metadata),
  * which *factor* it is grouped under in the output. Factor names follow the names
    the rest of the team already uses (C2 feature names, C4 rule names), so C4's
    SHAP-guided rules recognise them (knowledge_base.json -> related_features),
  * how to show it to a coach.
"""

# ---------------------------------------------------------------------------
# Model features, in model order: (name, factor, modality)
# ---------------------------------------------------------------------------
FEATURES = [
    # kinematics - aggregated over the analysed deliveries of the session (C2 rows)
    ("scr_mean", "shoulder_counter_rotation_deg", "kinematics"),
    ("scr_peak", "shoulder_counter_rotation_deg", "kinematics"),
    ("scr_slope", "shoulder_counter_rotation_deg", "kinematics"),
    ("scr_breach_share", "shoulder_counter_rotation_deg", "kinematics"),
    ("tlf_mean", "trunk_lateral_flexion_deg", "kinematics"),
    ("tlf_peak", "trunk_lateral_flexion_deg", "kinematics"),
    ("tlf_slope", "trunk_lateral_flexion_deg", "kinematics"),
    ("tlf_breach_share", "trunk_lateral_flexion_deg", "kinematics"),
    ("knee_ffc_mean", "front_knee_flexion_ffc_deg", "kinematics"),
    ("knee_rel_mean", "front_knee_flexion_release_deg", "kinematics"),
    ("knee_rel_breach_share", "front_knee_flexion_release_deg", "kinematics"),
    # workload - from the logged sessions (C4 workload log)
    ("deliveries_7d", "acute_overs", "workload"),
    ("deliveries_28d_weekly", "weekly_overs", "workload"),
    ("acwr_7_28", "acute_chronic_workload_ratio", "workload"),
    ("ewma_ratio", "acute_chronic_workload_ratio", "workload"),
    ("differential_load_7d", "workload_spike", "workload"),
    ("bowling_days_7d", "days_bowled_7", "workload"),
    ("matches_14d", "matches_14d", "workload"),
    ("max_daily_deliveries_7d", "daily_overs", "workload"),
    ("rest_days_7d", "rest_days_7d", "workload"),
    ("consecutive_bowling_days", "consecutive_days", "workload"),
    # metadata - athlete profile (C4 athlete registry)
    ("age", "age", "metadata"),
    ("level_school", "playing_level", "metadata"),
    ("level_club", "playing_level", "metadata"),
    ("level_higher", "playing_level", "metadata"),
    ("lumbar_12m", "injury_history", "metadata"),
    ("hamstring_12m", "injury_history", "metadata"),
    ("side_strain_12m", "injury_history", "metadata"),
    ("injuries_12m", "injury_history", "metadata"),
    ("injuries_6m", "injury_history", "metadata"),
    ("months_since_last_injury", "injury_history", "metadata"),
    ("days_since_return", "injury_history", "metadata"),
]
FEATURE_NAMES = [f[0] for f in FEATURES]

# Clinically agreed direction of effect (+1 = can only raise risk, -1 = can only lower it,
# 0 = free, e.g. the chronic load where both under- and overload matter).
# XGBoost enforces these, so an explanation can never say "fewer matches raised the risk"
# because of a quirk in the training data. DRAFT - to review with the physiotherapist.
MONOTONE = {
    "scr_mean": 1, "scr_peak": 1, "scr_slope": 1, "scr_breach_share": 1,
    "tlf_mean": 1, "tlf_peak": 1, "tlf_slope": 1, "tlf_breach_share": 1,
    "knee_ffc_mean": -1, "knee_rel_mean": -1, "knee_rel_breach_share": 1,   # straighter front knee = risk (C2 limit)
    "acwr_7_28": 1, "ewma_ratio": 1,          # spikes; under-load is carried by the chronic-load feature
    "differential_load_7d": 1, "bowling_days_7d": 1, "matches_14d": 1, "max_daily_deliveries_7d": 1,
    "rest_days_7d": -1, "consecutive_bowling_days": 1,
    "lumbar_12m": 1, "hamstring_12m": 1, "side_strain_12m": 1, "injuries_12m": 1, "injuries_6m": 1,
    "months_since_last_injury": -1, "days_since_return": -1,
}
FACTOR_OF = {f[0]: f[1] for f in FEATURES}
MODALITY_OF = {f[0]: f[2] for f in FEATURES}
MODALITIES = ["kinematics", "workload", "metadata"]
MODALITY_LABEL = {"kinematics": "Technique", "workload": "Workload", "metadata": "Athlete history"}

# ---------------------------------------------------------------------------
# C2 feature names read by C3 (contracts/c2_features.schema.json) and the published
# limits used when a C2 row has no `breach` flag. C2 owns these limits
# (components/c2_biomech/src/c2_biomech/thresholds.py); this is a read-only copy.
# ---------------------------------------------------------------------------
C2_INPUTS = {
    "shoulder_counter_rotation_deg": {"prefix": "scr", "threshold": 30.0, "rule": "above"},
    "trunk_lateral_flexion_deg": {"prefix": "tlf", "threshold": 40.0, "rule": "above"},
    "front_knee_flexion_ffc_deg": {"prefix": "knee_ffc", "threshold": None, "rule": None},
    "front_knee_flexion_release_deg": {"prefix": "knee_rel", "threshold": 30.0, "rule": "below"},
}

# ---------------------------------------------------------------------------
# How each factor is shown (label, unit, reference). References are the same
# sources C2 and C4 cite, so the three screens agree.
# ---------------------------------------------------------------------------
FACTORS = {
    "shoulder_counter_rotation_deg": {
        "label": "Shoulder counter-rotation", "unit": "°",
        "reference": "Mixed-action limit 30° (Portus et al. 2004; Elliott et al. 2007)"},
    "trunk_lateral_flexion_deg": {
        "label": "Trunk side-bend at release", "unit": "°",
        "reference": "Limit 40° (Alway et al. 2021 – to be confirmed by C2)"},
    "front_knee_flexion_ffc_deg": {
        "label": "Front-knee bend at landing", "unit": "°", "reference": None},
    "front_knee_flexion_release_deg": {
        "label": "Front-knee bend at release", "unit": "°",
        "reference": "Below 30° = nearly straight knee (proposal limit)"},
    "acute_chronic_workload_ratio": {
        "label": "Acute:chronic workload ratio", "unit": "",
        "reference": "0.8–1.3 safer range; above 1.5 is a spike (Gabbett 2016; Hulin et al. 2014)"},
    "workload_spike": {"label": "Week-to-week change in balls bowled", "unit": " balls", "reference": None},
    "acute_overs": {"label": "Overs in the last 7 days", "unit": " overs", "reference": None},
    "weekly_overs": {"label": "Average weekly overs (last 4 weeks)", "unit": " overs", "reference": None},
    "daily_overs": {"label": "Most overs in one day (last 7 days)", "unit": " overs", "reference": None},
    "days_bowled_7": {"label": "Bowling days in the last 7", "unit": " days",
                      "reference": "ECB directive: at most 4 bowling days in 7"},
    "consecutive_days": {"label": "Bowling days in a row", "unit": " days",
                         "reference": "ECB directive: at most 2 days in a row"},
    "rest_days_7d": {"label": "Rest days in the last 7", "unit": " days", "reference": None},
    "matches_14d": {"label": "Matches in the last 14 days", "unit": "", "reference": None},
    "age": {"label": "Age", "unit": " y", "reference": None},
    "playing_level": {"label": "Playing level", "unit": "", "reference": None},
    "injury_history": {"label": "Injury history", "unit": "", "reference": None},
}

# Typical days lost per injury site, used to estimate days since return to play
# (the athlete profile stores the injury date, not the return date).
# Lumbar / hamstring / side strain follow the cricket injury literature used for the
# synthetic data; the others are conservative defaults. DRAFT - physio to confirm.
TYPICAL_TIME_LOSS_DAYS = {
    "lumbar": 75, "hamstring": 21, "side_strain": 35, "shoulder": 28, "knee": 28, "ankle": 21, "other": 14,
}

HORIZON_DAYS = 28
# Risk-score cut-offs shared with C4 (knowledge_base.json -> risk_tiers).
SCORE_CUTS = {"Moderate": 0.30, "High": 0.55, "Critical": 0.75}
