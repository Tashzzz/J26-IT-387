// C1 (Nethmi) - shapes returned by /pose on the shared backend (backend/app/routers/pose.py).

export type BowlingArm = 'left' | 'right';
export type CameraAngle = 'front' | 'semi_side' | 'side' | 'rear'; // backend /pose/process accepts all four
export type CameraDistance = 4 | 5 | 6 | 10; // metres; the distances used in the ICC study

/** Reliability of this clip's keypoints, from the ICC study of the matching camera setup. */
export type ReliabilitySummary = {
  setup_matched: string | null; // e.g. "side 4 m"; null = no study for this setup yet
  usable: number;
  total: number;
  reliable_regions: string[]; // e.g. ["elbows", "wrists", "hips"]
  less_reliable_regions: string[];
  gate?: number; // ICC needed to count as reliable (0.75)
  note?: string;
};

export type ProcessResult = {
  run_id: string;
  clip_id: string;
  bowling_arm: BowlingArm;
  frames: number;
  detection_rate: number; // 0-1, frames where the bowler was found
  processing_seconds: number;
  overlay_url: string; // relative to the API base
  keypoints_url: string;
  reliability: ReliabilitySummary;
};

export type Band = 'excellent' | 'good' | 'moderate' | 'poor';

export type KeypointIcc = { keypoint: string; icc: number | null; band: Band; usable: boolean };

export type RegionIcc = {
  region: string;
  label: string;
  mean_icc: number | null;
  usable: number;
  total: number;
  keypoints: KeypointIcc[];
};

export type Setup = {
  group: string; // e.g. "B01_semi_side_5m"
  bowler: string | null;
  angle: string | null;
  distance_m: number | null;
  usable: number;
  total: number;
  regions: RegionIcc[];
};

export type Reliability = { icc_type: string; gate: number; setups: Setup[] };
