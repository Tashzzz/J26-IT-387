// C2 (Samarasinghe) - shapes returned by /features on the shared backend
// (backend/app/routers/features.py, contract: contracts/c2_features.schema.json).

/** Traffic light from thresholds.py: red = breach, amber = close to the limit, none = no limit or no value. */
export type Level = 'red' | 'amber' | 'green' | 'none';

/** How well one camera view can measure this angle (features.py VIEW_METHOD). */
export type ViewSuitability = 'good' | 'limited' | 'poor';

export type FeatureName =
  | 'shoulder_counter_rotation_deg'
  | 'front_knee_flexion_ffc_deg'
  | 'front_knee_flexion_release_deg'
  | 'trunk_lateral_flexion_deg'
  | 'hip_shoulder_separation_bfc_deg'
  | 'rear_knee_flexion_bfc_deg'
  | 'rear_hip_flexion_bfc_deg'
  | 'front_hip_flexion_ffc_deg';

export type Feature = {
  value: number | null; // degrees, null when an event or keypoint is missing
  threshold: number | null; // published limit in degrees, null = reported only
  rule: 'above' | 'below' | null; // breach when value is above / below the threshold
  breach: boolean;
  level: Level;
  reliable: boolean; // false = camera view or C1's ICC says do not trust this value
  source: string; // paper the limit comes from
  event: string; // when it is measured: release, ffc, bfc, bfc_to_ffc
  method: '2d' | '3d';
  view_suitability: ViewSuitability;
  keypoints: string[];
  unusable_keypoints?: string[]; // keypoints C1's ICC study marked unreliable
  label?: string; // plain name for coaches, e.g. "Shoulder twist"
  note?: string; // extra advice, e.g. front knee judged together with twist and lean
};

export type EventName = 'bfc_frame' | 'ffc_frame' | 'release_frame';
export type Events = Partial<Record<EventName, number>>;
// estimated = from foot movement relative to the hips (no image position from C1), about +/- 2-4 frames
export type EventMethod = 'manual' | 'c1_window' | 'auto' | 'estimated' | 'not_detected';

/** Per-frame angles for a chart later (column name -> one value per frame). */
export type Series = Record<string, (number | null)[]>;

export type FeatureRow = {
  video_id: string;
  bowler_id: string | null;
  events: Events;
  event_method: Record<EventName, EventMethod>;
  features: Record<FeatureName, Feature>;
  n_breaches: number;
  view: string | null; // camera view from C1: side, semi_side, front, rear
  fps: number;
  warnings: string[];
  c2_version: string;
  series?: Series;
  synthetic?: boolean; // only on /features/demo
  true_values?: Record<string, number>; // only on /features/demo: the angles the demo was built with
};

export type Threshold = {
  threshold: number | null;
  rule: 'above' | 'below' | null;
  amber_band: number | null;
  source: string;
  meaning: string;
  evidence?: string; // the numbers behind the limit (injured vs uninjured groups)
  label?: string; // plain name for coaches
};

export type Thresholds = Record<FeatureName, Threshold>;

/** C1 -> C2 handoff JSON (contracts/c1_keypoints.schema.json). C2 only passes it on to the backend. */
export type C1Keypoints = { video_id: string; fps: number; bowling_arm: string; frames: unknown[] } & Record<string, unknown>;

/** The few athlete fields C2 needs from C4 (/recommend/athletes). Full type: src/c4/types.ts. */
export type AthleteRef = { id: number; bowler_id: string; dominant_arm: 'right' | 'left' };

/** What C4 stores per athlete and C3 reads: latest C3 risk + C2 rows (one per delivery, max 50). */
export type Upstream = { c3: unknown | null; c2: (Omit<FeatureRow, 'series'> & Record<string, unknown>)[]; received_at?: string };
