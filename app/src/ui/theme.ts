// CricShield design tokens. Every screen and component reads colours, spacing and type from here,
// so the whole app can be restyled in one place. Text colours meet WCAG AA on `surface` and `bg`.
import type { Category, Tier } from '../c4/types';

export const colors = {
  // surfaces
  bg: '#F4F6FB',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF2F8',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',

  // text
  text: '#0F172A',
  textSoft: '#334155',
  muted: '#5B6B82',
  onPrimary: '#FFFFFF',

  // brand
  primary: '#1D4ED8',
  primaryPressed: '#1E3A8A',
  primarySoft: '#E0E9FF',
  navy: '#0B1B3F',
  navySoft: '#16295A',
  onNavy: '#FFFFFF',
  onNavyMuted: '#B8C4E0',

  // status
  ok: '#15803D',
  okSoft: '#DCFCE7',
  warn: '#B45309',
  warnSoft: '#FEF3C7',
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  info: '#1D4ED8',
  infoSoft: '#E0E9FF',

  // aliases for component code written against the first (dark) theme
  card: '#FFFFFF',
  cardAlt: '#EEF2F8',
  accent: '#1D4ED8',
  accentDim: '#E0E9FF',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
export const space = (n: number) => n * 4;

export const type = {
  display: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.5, color: colors.text },
  title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3, color: colors.text },
  heading: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, lineHeight: 22, color: colors.textSoft },
  small: { fontSize: 13, lineHeight: 18, color: colors.muted },
  overline: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: colors.muted },
};

export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
};

// Risk tiers shared by the risk model and the prevention plan (cut-offs 30 / 55 / 75).
export const tierColor: Record<Tier, string> = {
  Low: '#15803D',
  Moderate: '#B45309',
  High: '#C2410C',
  Critical: '#B91C1C',
};
export const tierSoft: Record<Tier, string> = {
  Low: '#DCFCE7',
  Moderate: '#FEF3C7',
  High: '#FFEDD5',
  Critical: '#FEE2E2',
};
export const tierLabel: Record<Tier, string> = {
  Low: 'Low risk',
  Moderate: 'Moderate risk',
  High: 'High risk',
  Critical: 'Very high risk',
};

export const categoryMeta: Record<Category, { label: string; icon: string; color: string }> = {
  training: { label: 'Technique & training', icon: 'fitness-outline', color: '#1D4ED8' },
  workload: { label: 'Workload', icon: 'speedometer-outline', color: '#B45309' },
  recovery: { label: 'Recovery', icon: 'bed-outline', color: '#15803D' },
  rehabilitation: { label: 'Rehabilitation', icon: 'medkit-outline', color: '#B91C1C' },
  preventive_exercise: { label: 'Preventive exercises', icon: 'barbell-outline', color: '#7C3AED' },
};
