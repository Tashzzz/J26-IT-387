"""Shared keypoint definitions for CricShield Component 1.

MediaPipe PoseLandmarker returns 33 landmarks per frame. The names and the
skeleton connections are defined here once, so that extract.py, overlay.py
and later modules (normalise, ICC) all use the same ones.
"""

KEYPOINT_NAMES = [
    "nose",                 # 0
    "left_eye_inner",       # 1
    "left_eye",             # 2
    "left_eye_outer",       # 3
    "right_eye_inner",      # 4
    "right_eye",            # 5
    "right_eye_outer",      # 6
    "left_ear",             # 7
    "right_ear",            # 8
    "mouth_left",           # 9
    "mouth_right",          # 10
    "left_shoulder",        # 11
    "right_shoulder",       # 12
    "left_elbow",           # 13
    "right_elbow",          # 14
    "left_wrist",           # 15
    "right_wrist",          # 16
    "left_pinky",           # 17
    "right_pinky",          # 18
    "left_index",           # 19
    "right_index",          # 20
    "left_thumb",           # 21
    "right_thumb",          # 22
    "left_hip",             # 23
    "right_hip",            # 24
    "left_knee",            # 25
    "right_knee",           # 26
    "left_ankle",           # 27
    "right_ankle",          # 28
    "left_heel",            # 29
    "right_heel",           # 30
    "left_foot_index",      # 31
    "right_foot_index",     # 32
]

# Body region of each keypoint, used later by the reliability dashboard
# (the report groups ICC results by region rather than by index number).
REGION = {}
for i in range(0, 11):
    REGION[i] = "head"
for i in (11, 12):
    REGION[i] = "shoulder"
for i in (13, 14):
    REGION[i] = "elbow"
for i in range(15, 23):
    REGION[i] = "wrist_hand"
for i in (23, 24):
    REGION[i] = "hip"
for i in (25, 26):
    REGION[i] = "knee"
for i in range(27, 33):
    REGION[i] = "ankle_foot"

# Skeleton lines to draw (pairs of keypoint IDs). Same as MediaPipe's
# POSE_CONNECTIONS, written out so it doesn't depend on the MediaPipe version.
POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8), (9, 10),
    (11, 12), (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20),
    (11, 23), (12, 24), (23, 24),
    (23, 25), (24, 26), (25, 27), (26, 28),
    (27, 29), (28, 30), (29, 31), (30, 32), (27, 31), (28, 32),
]
