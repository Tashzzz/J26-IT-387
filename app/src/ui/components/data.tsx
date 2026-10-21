// Small data displays: ComponentBadge, MetricTile, ProgressBar, Tag.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useResearchMode } from '../prefs';
import { alpha, color, COMPONENT, font, gradient, radius, sp, type ComponentKey, type IconName } from '../theme';

/**
 * Research-component chip in its colour: "C2 · Biomechanics" (compact: "C2").
 * Research mode only - coaches never see component codes, so it renders nothing in coach mode.
 */
export function ComponentBadge({ component, compact }: { component: ComponentKey; compact?: boolean }) {
  const research = useResearchMode();
  if (!research) return null;
  const c = COMPONENT[component];
  const text = compact ? c.code : `${c.code} · ${c.label}`;
  return (
    <View style={[s.badge, { backgroundColor: alpha(c.color, 0.16), borderColor: alpha(c.color, 0.5) }]}
      accessibilityLabel={`${c.code} ${c.label}`}>
      <Ionicons name={c.icon} size={13} color={c.color} />
      <Text style={[s.badgeText, { color: c.color }]}>{text}</Text>
    </View>
  );
}

/** Label / big value / optional unit + hint. tint colours the value and the icon. */
export function MetricTile({ label, value, unit, hint, icon, tint = color.text, onPress }: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  icon?: IconName;
  tint?: string;
  onPress?: () => void;
}) {
  const body = (
    <>
      <View style={s.tileTop}>
        {icon && <Ionicons name={icon} size={16} color={tint === color.text ? color.muted : tint} />}
        <Text style={s.tileLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[s.tileValue, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}{unit ? <Text style={s.tileUnit}> {unit}</Text> : null}
      </Text>
      {hint ? <Text style={s.tileHint} numberOfLines={2}>{hint}</Text> : null}
    </>
  );
  if (!onPress) return <View style={s.tile}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.tile, pressed && { opacity: 0.75 }]}>{body}</Pressable>
  );
}

/** value 0-1. Gradient fill unless tint is given. */
export function ProgressBar({ value, tint, height = 8, label }: { value: number; tint?: string; height?: number; label?: string }) {
  const v = Math.min(1, Math.max(0, value));
  return (
    <View style={{ gap: sp(0.5) }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}>
      {label ? <Text style={s.tileHint}>{label}</Text> : null}
      <View style={[s.track, { height, borderRadius: height / 2 }]}>
        {v > 0 && (
          <LinearGradient colors={tint ? [tint, tint] : gradient.brand} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
            style={{ width: `${v * 100}%`, height, borderRadius: height / 2 }} />
        )}
      </View>
    </View>
  );
}

/** Small neutral or tinted label (e.g. "synthetic", "offline", "right-arm"). */
export function Tag({ label, tint, icon }: { label: string; tint?: string; icon?: IconName }) {
  const c = tint ?? color.muted;
  return (
    <View style={[s.tag, tint ? { backgroundColor: alpha(tint, 0.14), borderColor: alpha(tint, 0.4) } : null]}>
      {icon && <Ionicons name={icon} size={12} color={c} />}
      <Text style={[s.tagText, { color: tint ?? color.muted }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, borderWidth: 1, borderRadius: radius.chip, paddingHorizontal: sp(1.25), paddingVertical: 4 },
  badgeText: { ...font.caption, fontWeight: '700', letterSpacing: 0.3 },
  tile: { flex: 1, minWidth: 140, backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: radius.button + 2, padding: sp(1.5), gap: 4 },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileLabel: { ...font.overline, color: color.muted, flexShrink: 1 },
  tileValue: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  tileUnit: { ...font.body, color: color.muted },
  tileHint: { ...font.caption, color: color.muted },
  track: { backgroundColor: color.surface2, overflow: 'hidden' },
  tag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, borderRadius: 8, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { ...font.caption, fontWeight: '700' },
});
