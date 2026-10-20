// C4 types - mirror components/c4_recommend/src/c4_recommend/models.py.

export type Tier = 'Low' | 'Moderate' | 'High' | 'Critical';
export type Category = 'training' | 'workload' | 'recovery' | 'rehabilitation' | 'preventive_exercise';
export type InjurySite = 'lumbar' | 'hamstring' | 'shoulder' | 'knee' | 'ankle' | 'side_strain' | 'other';

export interface InjuryRecord {
  site: InjurySite;
  injury_date: string;
  returned_to_play: boolean;
  notes?: string | null;
}

export interface AthleteInput {
  bowler_id: string;
  birth_year: number;
  dominant_arm: 'right' | 'left';
  playing_level: 'school' | 'club' | 'provincial' | 'national';
  injury_history: InjuryRecord[];
}

export interface Athlete extends AthleteInput {
  id: number;
}

export interface WorkloadInput {
  session_date: string;
  session_type: 'training' | 'match' | 'nets';
  overs: number;
  spells?: number;
  longest_spell_overs?: number | null;
  rpe?: number | null;
  soreness?: number | null;
}

export interface Workload extends WorkloadInput {
  id: number;
  athlete_id: number;
}

export interface Exercise {
  name: string;
  dose: string;
  targets: string;
}

export interface Recommendation {
  rule_id: string;
  category: Category;
  contract_type: string;
  title: string;
  action: string;
  priority: number;
  explanation: string;
  reason: string;
  contributing_factors: string[];
  evidence: string[];
  exercises: Exercise[];
}

export interface ShapTop {
  feature: string;
  shap: number;
  value?: number | string | null;
  modality?: string | null;
}

export interface FlagInfo {
  value: number | null;
  threshold: number | null;
  reliable: boolean | null;
}

export interface PreventionPlan {
  id?: number;
  bowler_id: string;
  session_id: string | null;
  generated_at: string;
  risk_tier: Tier;
  risk_level: 'low' | 'medium' | 'high';
  risk_score: number | null;
  risk_source: 'c3' | 'fallback_guidelines';
  summary: string;
  limits: {
    daily_limit_overs: number;
    spell_cap_overs: number;
    rest_window: string;
    max_bowling_days_per_week: number;
  };
  referral: { required: boolean; reasons: string[]; to?: string | null };
  recommendations: Recommendation[];
  plan: { type: string; action: string; reason: string }[];
  metrics: {
    age: number;
    age_group: string;
    acute_overs: number;
    chronic_weekly_overs: number;
    acwr: number | null;
    days_bowled_7: number;
    consecutive_days: number;
    avg_rest_days: number | null;
    max_daily_overs_7: number;
    soreness_max_7: number;
    recent_injury_sites: string[];
    shap_top: ShapTop[];
    c3_risk_level: string | null;
    tier_reasons: string[];
    flags: Record<string, FlagInfo>;
  };
  data_quality: string[];
  engine_version: string;
  latency_ms: number;
}

export interface C2Feature {
  value: number | null;
  threshold?: number | null;
  breach?: boolean;
  reliable?: boolean;
  source?: string | null;
}

export interface Upstream {
  c3: {
    bowler_id: string;
    session_id: string;
    model: string;
    risk_score: number;
    risk_level: string;
    top_factors: ShapTop[];
    explanation?: string | null;
  } | null;
  c2: { video_id: string; bowler_id: string; features: Record<string, C2Feature> }[];
  received_at?: string;
}

export interface FeedbackInput {
  reviewer: string;
  role: 'physiotherapist' | 'coach' | 'sports_scientist';
  decision: 'accept' | 'modify' | 'reject';
  usefulness?: number | null;
  rule_id?: string | null;
  comment: string;
  modified_action?: string | null;
}

export interface Feedback extends FeedbackInput {
  id: number;
  plan_id: number;
  created_at: string;
}

// ---- model-guided what-if check (POST /recommend/athletes/{id}/whatif) ----
export interface WhatIfScenario {
  id: string;
  title: string;
  category: 'workload' | 'technique' | 'recovery';
  change: string;
  linked_rules: string[];
  risk: number;
  effect: number;
  tier: Tier;
  meaningful: boolean;
}

export interface WhatIfResult {
  bowler_id: string;
  model: string;
  base_risk: number;
  base_tier: Tier;
  scenarios: WhatIfScenario[];
  best_plan: { steps: { id: string; title: string; risk_after: number; gain: number }[]; risk: number; effect: number; tier: Tier };
  rule_effect: Record<string, number>;
  min_effect: number;
  notes: string[];
  model_calls: number;
  latency_ms: number;
  plan_tier: Tier;
  referral_required: boolean;
}
