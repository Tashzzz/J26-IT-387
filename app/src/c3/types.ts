// C3 types - mirror the /risk API (components/c3_risk/src/c3_risk/explain.py, contracts/c3_risk.schema.json).

export type Modality = 'kinematics' | 'workload' | 'metadata';
export type RiskLevel = 'low' | 'medium' | 'high';
export type RiskTier = 'Low' | 'Moderate' | 'High' | 'Critical';
export type Direction = 'increases_risk' | 'decreases_risk' | 'neutral';

export interface FactorComponent {
  feature: string;
  value: number | null;
  shap_logodds: number;
}

export interface Factor {
  feature: string;
  label: string;
  modality: Modality;
  value: number | string | null;
  display_value: string;
  measured?: boolean;
  shap: number;
  shap_logodds: number;
  direction: Direction;
  strength?: string;
  reference?: string | null;
  squad_typical?: string | null;
  reliable?: boolean;
  deliveries_used?: number;
  components?: FactorComponent[];
}

export interface ModalityShare {
  modality: Modality;
  label: string;
  shap: number;
  shap_logodds: number;
  share_of_upward_push: number;
}

export interface Assessment {
  id?: number;
  athlete_id?: number;
  bowler_id: string;
  session_id: string;
  model: string;
  risk_score: number;
  risk_level: RiskLevel;
  risk_tier: RiskTier;
  alert: boolean;
  probability_28d: number;
  base_probability_28d: number;
  relative_risk: number | null;
  horizon_days: number;
  base_score: number;
  thresholds: { score: { medium: number; high: number; critical: number }; probability: { medium: number; high: number; critical: number } };
  top_factors: Factor[];
  all_factors: Factor[];
  modality_attribution: ModalityShare[];
  factor_lines: string[];
  explanation: string;
  data_quality: string[];
  inputs: {
    as_of: string;
    kinematics: { deliveries: number; per_feature: Record<string, { n: number; unreliable: number }> };
    workload: { sessions: number; history_days: number };
    athlete: { age: number; playing_level: string; injuries_12m: number };
  };
  synthetic_model: boolean;
  generated_at: string;
  latency_ms: number;
  sent_to_c4?: boolean;
  created_at?: string;
}

export interface HistoryItem {
  id: number;
  bowler_id: string;
  session_id: string;
  as_of: string;
  created_at: string;
  risk_score: number;
  risk_level: RiskLevel;
  risk_tier: RiskTier | null;
  probability_28d: number | null;
  model: string;
  top_factors: { feature: string; label: string | null; shap: number }[];
}

export interface RiskAthlete {
  athlete_id: number;
  bowler_id: string;
  playing_level: string | null;
  birth_year: number | null;
  latest: HistoryItem | null;
}

export interface ModelCard {
  model: string;
  created: string;
  synthetic: boolean;
  training_data: { source: string; sessions?: number; bowlers?: number; positive_rate?: number; label?: string };
  base_rate: number;
  thresholds: { probability: { alert: number; high: number; critical: number }; score: Record<string, number>; rule?: string };
  metrics: {
    cv_auc_mean: number;
    cv_auc_sd?: number;
    test?: { auc?: number; recall?: number; precision?: number; f1?: number; flagged_share?: number };
    test_ci95?: Record<string, [number, number]>;
    test_bowlers?: number;
    shap_modality_share_test?: Record<Modality, number>;
  };
}
