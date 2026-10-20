// C3 UI pieces: risk meter, two-level SHAP bars, factor detail, history strip, bowler picker.
// Built from plain Views (no extra chart library) and the shared tokens in src/ui/theme.ts.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, tierColor, tierLabel } from '../ui/theme';
import type { Factor, HistoryItem, Modality, ModalityShare, RiskAthlete, RiskLevel, RiskTier } from './types';

type IconName = keyof typeof Ionicons.glyphMap;

export const modalityMeta: Record<Modality, { label: string; icon: IconName; color: string }> = {
  kinematics: { label: 'Technique', icon: 'body-outline', color: '#1D4ED8' },
  workload: { label: 'Workload', icon: 'speedometer-outline', color: '#B45309' },
  metadata: { label: 'Injury history & age', icon: 'person-outline', color: '#7C3AED' },
};

export const levelColor: Record<RiskLevel, string> = { low: tierColor.Low, medium: tierColor.Moderate, high: tierColor.High };
const pct = (v: number) => `${Math.max(0, Math.min(100, v * 100))}%` as const;
const signed = (v: number, d = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;

export function LevelBadge({ level, tier }: { level: RiskLevel; tier?: RiskTier }) {
  const c = tier ? tierColor[tier] : levelColor[level];
  return (
    <View style={[s.badge, { backgroundColor: `${c}1A` }]} accessibilityLabel={`Risk level ${level}`}>
      <Ionicons name={level === 'low' ? 'shield-checkmark-outline' : 'warning-outline'} size={13} color={c} />
      <Text style={[s.badgeText, { color: c }]}>{tier ? tierLabel[tier] : `${level[0].toUpperCase()}${level.slice(1)} risk`}</Text>
    </View>
  );
}

/** Linear gauge with the four tiers shared with C4 (0.30 / 0.55 / 0.75). */
export function RiskMeter({ score, tier }: { score: number; tier: RiskTier }) {
  const bands: { from: number; to: number; tier: RiskTier }[] = [
    { from: 0, to: 0.3, tier: 'Low' }, { from: 0.3, to: 0.55, tier: 'Moderate' },
    { from: 0.55, to: 0.75, tier: 'High' }, { from: 0.75, to: 1, tier: 'Critical' },
  ];
  const c = tierColor[tier];
  return (
    <View accessible accessibilityLabel={`Risk score ${Math.round(score * 100)} out of 100, ${tierLabel[tier].toLowerCase()}`}>
      <View style={s.scoreRow}>
        <Text style={[s.score, { color: c }]}>{Math.round(score * 100)}</Text>
        <Text style={s.scoreOf}>/ 100</Text>
      </View>
      <View style={s.track}>
        {bands.map((b) => (
          <View key={b.tier} style={[s.band, { left: pct(b.from), width: pct(b.to - b.from), backgroundColor: `${tierColor[b.tier]}33` }]} />
        ))}
        <View style={[s.marker, { left: pct(score), backgroundColor: c }]} />
      </View>
      <View style={s.ticks}>
        {[0, 30, 55, 75, 100].map((t) => (
          <Text key={t} style={[s.tick, { left: `${t}%`, transform: [{ translateX: t === 0 ? 0 : t === 100 ? -22 : -8 }] }]}>{t}</Text>
        ))}
      </View>
    </View>
  );
}

/** Diverging bar: left = lowers risk, right = raises risk. */
function Diverging({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.min(1, Math.abs(value) / max) * 50 : 0;
  return (
    <View style={s.div}>
      <View style={s.divMid} />
      <View style={[s.divBar, { backgroundColor: color, width: `${w}%`, left: value >= 0 ? '50%' : `${50 - w}%` }]} />
    </View>
  );
}

/** Level 1 - modality contributions. */
export function ModalityBars({ items }: { items: ModalityShare[] }) {
  const max = Math.max(...items.map((i) => Math.abs(i.shap)), 1e-6);
  return (
    <View style={{ gap: 12 }}>
      <View style={s.axis}><Text style={s.axisText}>◀ lowers risk</Text><Text style={s.axisText}>raises risk ▶</Text></View>
      {items.map((m) => {
        const meta = modalityMeta[m.modality];
        return (
          <View key={m.modality} style={{ gap: 4 }} accessible
            accessibilityLabel={`${meta.label}: ${m.shap >= 0 ? 'raises' : 'lowers'} the score by ${Math.abs(m.shap * 100).toFixed(1)} points`}>
            <View style={s.rowBetween}>
              <View style={s.rowCenter}>
                <Ionicons name={meta.icon} size={16} color={meta.color} />
                <Text style={s.modLabel}>{meta.label}</Text>
              </View>
              <Text style={s.modValue}>
                {signed(m.shap * 100, 1)} pts{m.share_of_upward_push > 0 ? `  ·  ${Math.round(m.share_of_upward_push * 100)}% of the push up` : ''}
              </Text>
            </View>
            <Diverging value={m.shap} max={max} color={meta.color} />
          </View>
        );
      })}
    </View>
  );
}

/** Level 2 - one factor (tap for detail). */
export function FactorRow({ f, max, onPress, last }: { f: Factor; max: number; onPress: () => void; last?: boolean }) {
  const meta = modalityMeta[f.modality];
  const measured = f.measured !== false;
  const pts = f.shap * 100;
  const tiny = Math.abs(pts) < 0.05;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Shows how this factor was measured"
      style={({ pressed }) => [s.factor, last && { borderBottomWidth: 0 }, pressed && { opacity: 0.75 }]}>
      <View style={s.rowBetween}>
        <View style={[s.rowCenter, { flex: 1 }]}>
          <View style={[s.dot, { backgroundColor: meta.color }]} />
          <Text style={s.factorLabel} numberOfLines={2}>{f.label}</Text>
          {f.reliable === false && <Ionicons name="eye-off-outline" size={15} color={colors.warn} accessibilityLabel="measured from an unreliable camera view" />}
        </View>
        <Text style={[s.factorEffect, { color: !measured || tiny ? colors.muted : pts > 0 ? colors.danger : colors.ok }]}>
          {!measured ? '—' : tiny ? '0.0 pts' : `${signed(pts, 1)} pts`}
        </Text>
      </View>
      <Text style={s.factorValue} numberOfLines={2}>{f.display_value}</Text>
      {measured && <Diverging value={f.shap} max={max} color={meta.color} />}
    </Pressable>
  );
}

export function FactorDetail({ f, onClose }: { f: Factor | null; onClose: () => void }) {
  if (!f) return null;
  const meta = modalityMeta[f.modality];
  const verb = f.direction === 'increases_risk' ? 'raised' : f.direction === 'decreases_risk' ? 'lowered' : 'did not change';
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={s.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            <View style={s.rowBetween}>
              <View style={s.rowCenter}>
                <Ionicons name={meta.icon} size={18} color={meta.color} />
                <Text style={s.sheetKicker}>{meta.label.toUpperCase()}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={s.sheetTitle}>{f.label}</Text>
            <Text style={s.sheetValue}>{f.display_value}</Text>
            {f.measured !== false && (
              <Text style={s.body}>
                This {f.strength && f.strength !== 'moderately' ? `${f.strength} ` : ''}{verb} the risk score by{' '}
                <Text style={{ fontWeight: '800' }}>{Math.abs(f.shap * 100).toFixed(1)} points</Text> (SHAP {signed(f.shap_logodds)} log-odds).
              </Text>
            )}
            {f.squad_typical ? <Text style={s.muted}>Squad typical: {f.squad_typical}</Text> : null}
            {f.reference ? <Text style={s.muted}>Reference: {f.reference}</Text> : null}
            {f.reliable === false && (
              <View style={s.warnBox}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.warn} />
                <Text style={[s.muted, { flex: 1, color: colors.warn }]}>Some values come from a camera position that cannot see this joint clearly. Check them on video before acting.</Text>
              </View>
            )}
            {f.deliveries_used != null && <Text style={s.muted}>Deliveries used: {f.deliveries_used}</Text>}
            {f.components && f.components.length > 1 && (
              <View style={{ gap: 4, marginTop: 4 }}>
                <Text style={s.small}>MODEL INPUTS IN THIS FACTOR</Text>
                {f.components.map((c) => (
                  <View key={c.feature} style={s.rowBetween}>
                    <Text style={s.mono}>{c.feature}</Text>
                    <Text style={s.mono}>{c.value == null ? '—' : Number(c.value).toFixed(2)}   {signed(c.shap_logodds)}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Earlier assessments, oldest -> newest, coloured by tier. */
export function HistoryStrip({ items }: { items: HistoryItem[] }) {
  const list = [...items].reverse();
  return (
    <View>
      <View style={s.histRow} accessible accessibilityLabel={`Last ${list.length} risk scores`}>
        <View style={[s.histLine, { bottom: `${30}%` }]} />
        {list.map((h) => {
          const c = h.risk_tier ? tierColor[h.risk_tier] : levelColor[h.risk_level];
          return (
            <View key={h.id} style={s.histCol}>
              <View style={[s.histBar, { height: `${Math.max(4, h.risk_score * 100)}%`, backgroundColor: c }]} />
            </View>
          );
        })}
      </View>
      <View style={s.rowBetween}>
        <Text style={s.tick2}>{list[0]?.as_of ?? ''}</Text>
        <Text style={s.tick2}>dashed line = alert level (30)</Text>
        <Text style={s.tick2}>{list[list.length - 1]?.as_of ?? ''}</Text>
      </View>
    </View>
  );
}

export function BowlerPicker({ athletes, value, onChange }: { athletes: RiskAthlete[]; value: number | null; onChange: (id: number) => void }) {
  return (
    <View style={s.chips}>
      {athletes.map((a) => {
        const active = a.athlete_id === value;
        const c = a.latest ? (a.latest.risk_tier ? tierColor[a.latest.risk_tier] : levelColor[a.latest.risk_level]) : colors.border;
        return (
          <Pressable key={a.athlete_id} onPress={() => onChange(a.athlete_id)} accessibilityRole="button"
            accessibilityState={{ selected: active }} accessibilityLabel={`Bowler ${a.bowler_id}${a.latest ? `, last risk ${a.latest.risk_level}` : ''}`}
            style={[s.chip, active && { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
            <View style={[s.dot, { backgroundColor: c }]} />
            <Text style={[s.chipText, active && { color: colors.primary }]}>{a.bowler_id}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 10 },
  score: { fontSize: 56, fontWeight: '800', lineHeight: 60, letterSpacing: -1 },
  scoreOf: { color: colors.muted, fontSize: 16, marginBottom: 10 },
  track: { height: 14, borderRadius: 7, backgroundColor: colors.surfaceAlt, overflow: 'hidden', position: 'relative' },
  band: { position: 'absolute', top: 0, bottom: 0 },
  marker: { position: 'absolute', top: -1, width: 6, height: 16, marginLeft: -3, borderRadius: 3, borderWidth: 2, borderColor: colors.surface },
  ticks: { height: 16, marginTop: 4, position: 'relative' },
  tick: { position: 'absolute', color: colors.muted, fontSize: 11 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { color: colors.muted, fontSize: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modLabel: { color: colors.text, fontWeight: '700', fontSize: 15 },
  modValue: { color: colors.muted, fontSize: 12 },
  div: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, position: 'relative', overflow: 'hidden' },
  divMid: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: colors.borderStrong },
  divBar: { position: 'absolute', top: 1, bottom: 1, borderRadius: 4 },
  factor: { gap: 6, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dot: { width: 9, height: 9, borderRadius: 5 },
  factorLabel: { color: colors.text, fontWeight: '700', fontSize: 15, flexShrink: 1 },
  factorEffect: { fontWeight: '800', fontSize: 14 },
  factorValue: { color: colors.muted, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, maxHeight: '85%', width: '100%', maxWidth: 720, alignSelf: 'center' },
  sheetKicker: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  sheetTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  sheetValue: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  body: { color: colors.textSoft, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  small: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  mono: { color: colors.text, fontSize: 12, fontFamily: 'monospace' },
  warnBox: { flexDirection: 'row', gap: 8, borderRadius: radius.md, padding: 12, backgroundColor: colors.warnSoft },
  histRow: { height: 90, flexDirection: 'row', alignItems: 'flex-end', gap: 4, position: 'relative', marginBottom: 6 },
  histLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.muted },
  histCol: { flex: 1, height: '100%', justifyContent: 'flex-end', maxWidth: 34 },
  histBar: { borderTopLeftRadius: 4, borderTopRightRadius: 4, width: '100%' },
  tick2: { color: colors.muted, fontSize: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, minHeight: 40 },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
