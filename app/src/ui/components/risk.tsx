// Risk + score visuals: RiskIcon, RiskBadge, RiskGauge (semi-circle), ScoreRing (full ring).
// Levels come from the members' results (C3 / C4); nothing here decides a level from a score.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { alpha, color, font, gradient, RISK, sp, type RiskLevel } from '../theme';

export function RiskIcon({ level, size = 18 }: { level: RiskLevel; size?: number }) {
  return <MaterialCommunityIcons name={RISK[level].icon} size={size} color={RISK[level].color} />;
}

/** Colour + icon + word, always together. */
export function RiskBadge({ level, size = 'md', suffix = 'risk' }: { level: RiskLevel; size?: 'sm' | 'md' | 'lg'; suffix?: string }) {
  const r = RISK[level];
  const fs = size === 'lg' ? 17 : size === 'sm' ? 12 : 14;
  return (
    <View style={[s.badge, size === 'sm' && s.badgeSm, size === 'lg' && s.badgeLg, { backgroundColor: alpha(r.color, 0.16), borderColor: alpha(r.color, 0.55) }]}
      accessibilityRole="text" accessibilityLabel={`${r.label} ${suffix}`}>
      <RiskIcon level={level} size={fs + 3} />
      <Text style={[s.badgeText, { color: r.text, fontSize: fs }]}>{r.label}{suffix ? ` ${suffix}` : ''}</Text>
    </View>
  );
}

/** Semi-circle gauge for a 0-100 risk score, drawn in the level's colour. */
export function RiskGauge({ score, level, size = 240, caption }: { score: number; level: RiskLevel; size?: number; caption?: string }) {
  const stroke = Math.round(size * 0.075);
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = r + stroke / 2;
  const v = Math.min(100, Math.max(0, score)) / 100;
  const len = Math.PI * r;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const angle = Math.PI * (1 - v); // 180deg (left) -> 0deg (right)
  const dot = { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) };
  const c = RISK[level].color;

  return (
    <View style={{ alignItems: 'center' }} accessible accessibilityLabel={`Risk score ${Math.round(score)} out of 100, ${RISK[level].label}`}>
      <Svg width={size} height={cy + stroke / 2 + 2}>
        <Path d={arc} stroke={color.surface2} strokeWidth={stroke} strokeLinecap="round" fill="none" />
        <Path d={arc} stroke={alpha(c, 0.18)} strokeWidth={stroke + 10} strokeLinecap="round" fill="none"
          strokeDasharray={`${len * v} ${len}`} />
        <Path d={arc} stroke={c} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${len * v} ${len}`} />
        <Circle cx={dot.x} cy={dot.y} r={stroke * 0.32} fill={color.bg} />
      </Svg>
      <View style={[s.gaugeCenter, { top: cy - size * 0.27 }]}>
        <Text style={[s.gaugeNum, { fontSize: Math.round(size * 0.2) }]}>{Math.round(score)}</Text>
        <Text style={s.gaugeOf}>{caption ?? 'risk score / 100'}</Text>
      </View>
      <View style={{ marginTop: sp(1) }}><RiskBadge level={level} size="lg" /></View>
    </View>
  );
}

/** Ring for a percentage (0-100), e.g. keypoint detection rate. */
export function ScoreRing({ value, size = 96, stroke = 10, tint = gradient.brand[1], label, display }: {
  value: number;
  size?: number;
  stroke?: number;
  tint?: string;
  label?: string;
  /** Text in the middle; defaults to "NN%". */
  display?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const v = Math.min(100, Math.max(0, value)) / 100;
  const text = display ?? `${Math.round(value)}%`;
  return (
    <View style={{ alignItems: 'center', gap: sp(0.75) }} accessible accessibilityLabel={`${label ?? 'Score'} ${text}`}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={color.surface2} strokeWidth={stroke} fill="none" />
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={tint} strokeWidth={stroke} fill="none" strokeLinecap="round"
            strokeDasharray={`${circ * v} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        </Svg>
        <Text style={[s.ringText, { fontSize: Math.max(14, Math.round(size * 0.22)) }]}>{text}</Text>
      </View>
      {label ? <Text style={s.ringLabel} numberOfLines={2}>{label}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: sp(1.5), paddingVertical: 6 },
  badgeSm: { paddingHorizontal: sp(1), paddingVertical: 3, gap: 4 },
  badgeLg: { paddingHorizontal: sp(2), paddingVertical: sp(1) },
  badgeText: { fontWeight: '700' },
  gaugeCenter: { position: 'absolute', alignItems: 'center' },
  gaugeNum: { color: color.text, fontWeight: '700', letterSpacing: -1 },
  gaugeOf: { ...font.caption, color: color.muted },
  ringText: { color: color.text, fontWeight: '700' },
  ringLabel: { ...font.caption, color: color.muted, textAlign: 'center', maxWidth: 120 },
});
