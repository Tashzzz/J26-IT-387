// CricShield design tokens (ui-v2). Shared presentation only - no business logic lives here.
// Contrast (WCAG AA, checked): text 14.5-17.7, muted 6.5-7.9 on bg/surface/surface2. Every component and
// risk colour passes 4.5 as text on surface and on its own 16% tint, except two that use a lighter "text" shade:
// critical #EF4444 (4.0 on tint -> text #F87171, 5.1) and brand indigo #6366F1 (3.5-4.3 -> text #818CF8, 4.6+).
// Gradient buttons use dark label text (5.6-6.7 over the middle of the gradient); white fails on the cyan end.
import type { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform, type ViewStyle } from 'react-native';

export type IconName = keyof typeof Ionicons.glyphMap;

export const color = {
  bg: '#0A0E1A',
  surface: '#121829',
  surface2: '#1A2238',
  border: '#263052',
  text: '#F2F5FF',
  muted: '#9AA6C7',
  onBrand: '#0A0E1A', // label text on gradient / bright fills
  brandText: '#818CF8',
  backdrop: 'rgba(5, 8, 16, 0.72)',
};

export const gradient = {
  brand: ['#6366F1', '#22D3EE'] as const,
};

export type ComponentKey = 'c1' | 'c2' | 'c3' | 'c4';

export const COMPONENT: Record<ComponentKey, { code: string; color: string; label: string; icon: IconName }> = {
  c1: { code: 'C1', color: '#22D3EE', label: 'Pose', icon: 'videocam' },
  c2: { code: 'C2', color: '#A78BFA', label: 'Biomechanics', icon: 'body' },
  c3: { code: 'C3', color: '#FB923C', label: 'Risk', icon: 'pulse' },
  c4: { code: 'C4', color: '#34D399', label: 'Plan', icon: 'clipboard' },
};
export const COMPONENT_KEYS: ComponentKey[] = ['c1', 'c2', 'c3', 'c4'];

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';

// Risk icons come from MaterialCommunityIcons so all four share one style (Ionicons has no octagon).
export type RiskIconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** Risk is always shown as colour + icon + word. `text` is the colour to use when the colour itself is text. */
export const RISK: Record<RiskLevel, { color: string; text: string; icon: RiskIconName; label: string }> = {
  low: { color: '#22C55E', text: '#22C55E', icon: 'check-circle', label: 'Low' },
  moderate: { color: '#FACC15', text: '#FACC15', icon: 'alert-circle', label: 'Moderate' },
  high: { color: '#F97316', text: '#F97316', icon: 'alert', label: 'High' },
  critical: { color: '#EF4444', text: '#F87171', icon: 'close-octagon', label: 'Critical' },
};

/**
 * Maps the level words the members' APIs already return (C3 'low'/'medium'/'high', C4 tiers 'Low'..'Critical')
 * onto one display level. Label mapping only - no thresholds are decided here.
 */
export function toRiskLevel(value: string | null | undefined): RiskLevel | null {
  const v = (value ?? '').toLowerCase();
  if (v === 'medium') return 'moderate';
  return v === 'low' || v === 'moderate' || v === 'high' || v === 'critical' ? v : null;
}

export const font = {
  display: { fontSize: 28, fontWeight: '800', lineHeight: 34, letterSpacing: -0.4 },
  title: { fontSize: 22, fontWeight: '800', lineHeight: 28, letterSpacing: -0.2 },
  h2: { fontSize: 17, fontWeight: '700', lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  caption: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
} as const;

/** 8-pt grid: sp(1) = 8, sp(0.5) = 4. */
export const sp = (n: number) => n * 8;

export const radius = { card: 20, button: 14, chip: 999, sm: 10 };

/** Hex colour + alpha (0-1) -> #RRGGBBAA. */
export const alpha = (hex: string, a: number) => hex + Math.round(a * 255).toString(16).padStart(2, '0');

/** Subtle coloured glow: iOS shadow, Android elevation (tinted on API 28+). */
export function glow(c: string = gradient.brand[0], strength = 1): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: { shadowColor: c, shadowOpacity: 0.35 * strength, shadowRadius: 14 * strength, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: Math.round(6 * strength), shadowColor: c },
    default: { shadowColor: c, shadowOpacity: 0.35 * strength, shadowRadius: 14 * strength, shadowOffset: { width: 0, height: 6 } },
  })!;
}

export const HIT = 48; // minimum touch target
