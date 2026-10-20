import type { Category, Tier } from './types';

// Dark theme based on the Prevention Plan wireframe (Proposal Fig. 4.3.4.1).
// Text colours meet WCAG AA contrast on the card background (NFR accessibility).
export const colors = {
  bg: '#0A0E1A',
  card: '#121829',
  cardAlt: '#1A2238',
  border: '#263052',
  text: '#F2F5FF',
  muted: '#9AA6C7',
  accent: '#22D3EE',
  accentDim: '#0E3A47',
  danger: '#F87171',
  dangerBg: '#2A1218',
  dangerBorder: '#7F1D2D',
  ok: '#22C55E',
  okBg: '#0F2A1C',
  okBorder: '#166534',
  warn: '#FACC15',
};

export const tierColor: Record<Tier, string> = {
  Low: '#22C55E',
  Moderate: '#FACC15',
  High: '#F97316',
  Critical: '#F87171',
};

export const categoryMeta: Record<Category, { label: string; icon: string; color: string }> = {
  training: { label: 'Training & technique', icon: 'fitness-outline', color: '#22D3EE' },
  workload: { label: 'Workload', icon: 'speedometer-outline', color: '#FBBF24' },
  recovery: { label: 'Recovery', icon: 'bed-outline', color: '#4ADE80' },
  rehabilitation: { label: 'Rehabilitation', icon: 'medkit-outline', color: '#F87171' },
  preventive_exercise: { label: 'Preventive exercises', icon: 'barbell-outline', color: '#A78BFA' },
};

export const space = (n: number) => n * 4;
