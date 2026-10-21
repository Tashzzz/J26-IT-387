// Small UI kit for the C4 screens (dark theme from the proposal wireframe).
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';

import { Skeleton } from '../ui/components/feedback';
import { colors, tierColor } from './theme';
import type { Tier } from './types';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={[s.screen, s.pad]}>{children}</View>;
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { paddingBottom: 48 }]} keyboardShouldPersistTaps="handled">
      <View style={s.inner}>{children}</View>
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export const H = ({ children }: { children: React.ReactNode }) => <Text style={s.h}>{children}</Text>;
export const Label = ({ children }: { children: React.ReactNode }) => <Text style={s.label}>{children}</Text>;
export const Body = ({ children, muted }: { children: React.ReactNode; muted?: boolean }) => (
  <Text style={[s.body, muted && { color: colors.muted }]}>{children}</Text>
);

export function TierBadge({ tier }: { tier: Tier }) {
  const c = tierColor[tier];
  return (
    <View style={[s.badge, { borderColor: c, backgroundColor: `${c}22` }]}>
      <Text style={[s.badgeText, { color: c }]}>{tier.toUpperCase()}</Text>
    </View>
  );
}

export function Tile({ label, value, tone = 'neutral', wide }: {
  label: string; value: string; tone?: 'danger' | 'ok' | 'neutral'; wide?: boolean;
}) {
  const t = {
    danger: { bg: colors.dangerBg, border: colors.dangerBorder, fg: colors.danger },
    ok: { bg: colors.okBg, border: colors.okBorder, fg: colors.ok },
    neutral: { bg: colors.cardAlt, border: colors.border, fg: colors.text },
  }[tone];
  return (
    <View style={[s.tile, { backgroundColor: t.bg, borderColor: t.border }, wide && { flexBasis: '100%' }]}>
      <Text style={[s.tileLabel, { color: t.fg }]}>{label}</Text>
      <Text style={[s.tileValue, { color: t.fg }, wide && { fontSize: 17 }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

export function Banner({ tone, icon, title, children }: {
  tone: 'danger' | 'warn' | 'info'; icon: keyof typeof Ionicons.glyphMap; title: string; children?: React.ReactNode;
}) {
  const c = tone === 'danger' ? colors.danger : tone === 'warn' ? colors.warn : colors.accent;
  return (
    <View style={[s.banner, { borderColor: c, backgroundColor: `${c}14` }]}>
      <Ionicons name={icon} size={20} color={c} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[s.bannerTitle, { color: c }]}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled }: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap; loading?: boolean; disabled?: boolean;
}) {
  const primary = variant === 'primary';
  const fg = primary ? '#04212A' : variant === 'danger' ? colors.danger : colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        primary ? { backgroundColor: colors.accent } : { borderColor: variant === 'danger' ? colors.danger : colors.accent, borderWidth: 1 },
        (pressed || disabled) && { opacity: 0.6 },
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={[s.btnText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, half, ...props }: TextInputProps & { label: string; hint?: string; half?: boolean }) {
  return (
    <View style={[{ marginBottom: 12 }, half && { flexGrow: 1, flexBasis: 140 }]}>
      <Label>{label}</Label>
      <TextInput placeholderTextColor={colors.muted} style={s.input} {...props} />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Chips<T extends string | number>({ label, options, value, onChange }: {
  label?: string; options: { label: string; value: T }[]; value: T | null | undefined; onChange: (v: T) => void;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Label>{label}</Label> : null}
      <View style={s.chips}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable key={String(o.value)} onPress={() => onChange(o.value)}
              accessibilityRole="button" accessibilityState={{ selected: active }}
              style={[s.chip, active && { backgroundColor: colors.accentDim, borderColor: colors.accent }]}>
              <Text style={[s.chipText, active && { color: colors.accent }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.row, style]}>{children}</View>;
}

/** Skeleton placeholder (shape of a card and two rows) with the status text underneath. */
export function Loading({ text = 'Loading…' }: { text?: string }) {
  return (
    <View style={{ gap: 12 }} accessibilityLabel={text}>
      <Skeleton height={140} round={20} />
      <Skeleton height={64} round={16} />
      <Skeleton height={64} round={16} />
      <Body muted>{text}</Body>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16 },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 14 },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  h: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 6 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  tile: { flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center' },
  tileLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', opacity: 0.9 },
  tileValue: { fontSize: 22, fontWeight: '700', marginTop: 4, textAlign: 'center' },
  banner: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  bannerTitle: { fontWeight: '700', fontSize: 14, marginBottom: 2 },
  btn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, minHeight: 48 },
  btnText: { fontSize: 15, fontWeight: '700' },
  input: { backgroundColor: colors.cardAlt, borderColor: colors.border, borderWidth: 1, borderRadius: 10, color: colors.text, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, minHeight: 36, justifyContent: 'center' },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
