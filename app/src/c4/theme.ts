import type { Category, Tier } from './types';

// Dark theme based on the Prevention Plan wireframe (Proposal Fig. 4.3.4.1).
// Text colours meet WCAG AA contrast on the card background (NFR accessibility).
export const colors = {
  bg: '#0A1120',
  card: '#111B2E',
  cardAlt: '#16223A',
  border: '#22314F',
  text: '#E8EEF8',
  muted: '#93A3BF',
  accent: '#22D3EE',
  accentDim: '#0E3A47',
  danger: '#F87171',
  dangerBg: '#2A1218',
  dangerBorder: '#7F1D2D',
  ok: '#4ADE80',
  okBg: '#0F2A1C',
  okBorder: '#166534',
  warn: '#FBBF24',
};

export const tierColor: Record<Tier, string> = {
  Low: '#4ADE80',
  Moderate: '#FBBF24',
  High: '#FB923C',
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
