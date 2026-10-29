// C3 (Rizma) - full risk result for one assessment: gauge + level, technique vs workload split
// (ModalityBars), top factors in plain words (FactorRow / FactorDetail) and the narrative.
// Pieces and wording come from src/c3/ui.tsx and app/risk unchanged; no score is recomputed here.
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { alpha, Card, color, font, MetricTile, RISK, RiskGauge, sp, toRiskLevel, useResearchMode } from '../../ui';
import type { Assessment, Factor } from '../types';
import { FactorDetail, FactorRow, LevelBadge, ModalityBars } from '../ui';

const pctText = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

/** Coach mode: one factor in plain words (direction from C3, no SHAP numbers). */
function PlainFactor({ f }: { f: Factor }) {
  const up = f.direction === 'increases_risk';
  const down = f.direction === 'decreases_risk';
  const c = up ? RISK.high.text : down ? RISK.low.color : color.muted;
  return (
    <View style={s.plain}>
      <Ionicons name={up ? 'arrow-up-circle' : down ? 'arrow-down-circle' : 'remove-circle-outline'} size={22} color={c} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.plainLabel}>{f.label}</Text>
        <Text style={s.muted}>{f.display_value}</Text>
      </View>
      <Text style={[s.plainEffect, { color: c }]}>{up ? 'raises risk' : down ? 'lowers risk' : f.measured === false ? 'not measured' : 'no effect'}</Text>
    </View>
  );
}

export function RiskResultScreen({ result }: { result: Assessment }) {
  const [showAll, setShowAll] = useState(false);
  const [detail, setDetail] = useState<Factor | null>(null);
  const research = useResearchMode();
  const level = toRiskLevel(result.risk_tier ?? result.risk_level) ?? 'low';
  const tint = color.brandText;

  const factors = useMemo(() => {
    const measured = result.all_factors.filter((f) => f.measured !== false);
    const unmeasured = result.all_factors.filter((f) => f.measured === false);
    return showAll ? [...measured, ...unmeasured]
      : result.top_factors.map((t) => result.all_factors.find((f) => f.feature === t.feature) ?? t);
  }, [result, showAll]);
  const maxShap = Math.max(...result.all_factors.map((f) => Math.abs(f.shap)), 1e-6);

  return (
    <View style={{ gap: sp(2) }}>
      <Card variant="glow" accent={RISK[level].color}>
        <View style={s.rowBetween}>
          <Text style={s.code}>{result.bowler_id} · {result.inputs.as_of}</Text>
          <LevelBadge level={result.risk_level} tier={result.risk_tier} />
        </View>
        <RiskGauge score={result.risk_score * 100} level={level} size={250} />
        <Text style={s.prob}>
          <Text style={s.probStrong}>≈{pctText(result.probability_28d)}</Text> chance of a time-loss injury in the next 4 weeks
          {' '}· squad average {pctText(result.base_probability_28d)}
          {result.relative_risk != null ? ` · ${result.relative_risk.toFixed(1)}× average` : ''}
        </Text>
      </Card>

      {result.alert && (
        <Card style={{ borderColor: alpha(RISK[level].color, 0.6) }}>
          <View style={s.head}>
            <Ionicons name="notifications-outline" size={18} color={RISK[level].text} />
            <Text style={[s.h2, { color: RISK[level].text }]}>Above the alert level</Text>
          </View>
          <Text style={s.muted}>The alert is set so that at least 80% of injuries are caught, so some alerts will be false alarms. Check the prevention plan.</Text>
        </Card>
      )}

      <Card>
        <Text style={s.h2}>Why</Text>
        <Text style={s.body}>{result.explanation}</Text>
        {result.factor_lines.map((l) => (
          <View key={l} style={s.bulletRow}>
            <Text style={[s.bullet, { color: tint }]}>•</Text>
            <Text style={[s.body, { flex: 1 }]}>{l}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={s.h2}>Technique vs workload</Text>
        <ModalityBars items={result.modality_attribution} />
        <Text style={s.note}>Points on the 0–100 risk score, compared with an average squad member ({Math.round(result.base_score * 100)}).{research ? ' Two-level TreeSHAP attribution.' : ''}</Text>
      </Card>

      <Card style={{ gap: 0 }}>
        <Text style={[s.h2, { marginBottom: sp(0.5) }]}>{showAll ? 'All factors' : 'Top factors'}</Text>
        {factors.map((f) => (research
          ? <FactorRow key={f.feature} f={f} max={maxShap} onPress={() => setDetail(f)} />
          : <PlainFactor key={f.feature} f={f as Factor} />))}
        <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" style={s.toggle}>
          <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={16} color={tint} />
          <Text style={[s.toggleText, { color: tint }]}>{showAll ? 'Show top 3 only' : `Show all ${result.all_factors.length} factors`}</Text>
        </Pressable>
      </Card>

      <View style={s.tiles}>
        <MetricTile label="Analysed deliveries" value={result.inputs.kinematics.deliveries} icon="body-outline"
          tint={result.inputs.kinematics.deliveries ? color.text : RISK.critical.text} />
        <MetricTile label="Workload log" value={result.inputs.workload.history_days} unit="days" icon="calendar-outline"
          tint={result.inputs.workload.history_days >= 21 ? color.text : RISK.critical.text} />
      </View>
      {result.data_quality.length > 0 && (
        <Card>
          <Text style={s.small}>DATA NOTES</Text>
          {result.data_quality.map((n) => <Text key={n} style={s.muted}>• {n}</Text>)}
        </Card>
      )}
      <Text style={s.footer}>{research ? `${result.model} · ${result.latency_ms} ms · ` : ''}{new Date(result.generated_at).toLocaleString()}</Text>

      <FactorDetail f={detail} onClose={() => setDetail(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  h2: { ...font.h2, color: color.text },
  body: { ...font.body, color: color.text },
  muted: { ...font.body, color: color.muted },
  small: { ...font.caption, color: color.muted, fontWeight: '700', letterSpacing: 1 },
  note: { ...font.caption, color: color.muted },
  head: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp(1) },
  code: { ...font.h2, color: color.text },
  prob: { ...font.body, color: color.muted, textAlign: 'center' },
  probStrong: { color: color.text, fontWeight: '700' },
  bulletRow: { flexDirection: 'row', gap: sp(1) },
  bullet: { ...font.body, fontWeight: '700' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: sp(1.5), minHeight: 44 },
  toggleText: { ...font.body, fontWeight: '700' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1) },
  footer: { ...font.caption, color: color.muted, textAlign: 'center' },
  plain: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), paddingVertical: sp(1), borderBottomWidth: 1, borderBottomColor: color.border },
  plainLabel: { ...font.body, color: color.text, fontWeight: '700' },
  plainEffect: { ...font.caption, fontWeight: '700' },
});
