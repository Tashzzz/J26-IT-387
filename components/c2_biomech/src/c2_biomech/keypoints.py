"""Keypoint indices used by C2.

The order is the MediaPipe 33-landmark order agreed in contracts/README.md
(the full list lives in components/c1_pose/src/c1_pose/keypoints.py).
Only the keypoints C2 needs are named here.
"""

NOSE = 0
LEFT_SHOULDER, RIGHT_SHOULDER = 11, 12
LEFT_ELBOW, RIGHT_ELBOW = 13, 14
LEFT_WRIST, RIGHT_WRIST = 15, 16
LEFT_HIP, RIGHT_HIP = 23, 24
LEFT_KNEE, RIGHT_KNEE = 25, 26
LEFT_ANKLE, RIGHT_ANKLE = 27, 28
LEFT_HEEL, RIGHT_HEEL = 29, 30
LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX = 31, 32

NAMES = {
    LEFT_SHOULDER: "left_shoulder", RIGHT_SHOULDER: "right_shoulder",
    LEFT_ELBOW: "left_elbow", RIGHT_ELBOW: "right_elbow",
    LEFT_WRIST: "left_wrist", RIGHT_WRIST: "right_wrist",
    LEFT_HIP: "left_hip", RIGHT_HIP: "right_hip",
    LEFT_KNEE: "left_knee", RIGHT_KNEE: "right_knee",
    LEFT_ANKLE: "left_ankle", RIGHT_ANKLE: "right_ankle",
}


def sides(bowling_arm):
    """Return the keypoints for the bowling side, the front leg and the back (rear) leg.

    A right-arm bowler lands on the LEFT foot at front-foot contact and on the
    RIGHT foot at back-foot contact; a left-arm bowler is the mirror image.
    """
    if bowling_arm == "right":
        return {
            "wrist": RIGHT_WRIST,
            "front_shoulder": LEFT_SHOULDER,
            "front_hip": LEFT_HIP, "front_knee": LEFT_KNEE, "front_ankle": LEFT_ANKLE,
            "back_shoulder": RIGHT_SHOULDER,
            "back_hip": RIGHT_HIP, "back_knee": RIGHT_KNEE, "back_ankle": RIGHT_ANKLE,
        }
    if bowling_arm == "left":
        return {
            "wrist": LEFT_WRIST,
            "front_shoulder": RIGHT_SHOULDER,
            "front_hip": RIGHT_HIP, "front_knee": RIGHT_KNEE, "front_ankle": RIGHT_ANKLE,
            "back_shoulder": LEFT_SHOULDER,
            "back_hip": LEFT_HIP, "back_knee": LEFT_KNEE, "back_ankle": LEFT_ANKLE,
        }
    raise ValueError(f"bowling_arm must be 'left' or 'right', got {bowling_arm!r}")
