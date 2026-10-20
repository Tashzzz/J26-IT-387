// Analysis step 5 - results hub: one summary card + a large card per component opening its full screen,
// then "Save & open bowler profile".
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAnalysis } from '../../src/analysis/AnalysisContext';
import { OWNER } from '../../src/analysis/owners';
import { ANALYSIS_STEPS } from '../../src/analysis/steps';
import { detectionQuality, QUALITY } from '../../src/c1/screens/PoseResultScreen';
import { FEATURE_ORDER } from '../../src/c2/ui';
import { useApp } from '../../src/shell/AppContext';
import { useSquad } from '../../src/shell/squad';
import {
  alpha, Card, color, COMPONENT, COMPONENT_KEYS, ComponentBadge, EmptyState, font, GradientHeader, glow, PrimaryButton, radius, RISK,
  RiskBadge, ScoreRing, Screen, sp, StepIndicator, toRiskLevel, type ComponentKey,
} from '../../src/ui';

export default function ResultsHub() {
  const router = useRouter();
  const { athlete, results, steps, reset } = useAnalysis();
  const { researchMode } = useApp();
  const { refresh } = useSquad();

  if (!athlete || !results.pose) {
    return <Screen><EmptyState icon="sparkles" title="No results yet" actionTitle="Analyse" onAction={() => router.replace('/analyse')} /></Screen>;
  }

  const { pose, row, risk, plan } = results;
  const level = risk ? toRiskLevel(risk.risk_tier ?? risk.risk_level) : null;
  const topFactor = risk ? (risk.all_factors.find((f) => f.feature === risk.top_factors[0]?.feature) ?? risk.top_factors[0]) : null;
  const redFlags = row ? FEATURE_ORDER.filter((n) => row.features[n]?.breach && row.features[n]?.reliable).length : null;
  const unchecked = row ? row.n_breaches - (redFlags ?? 0) : 0;
  const quality = QUALITY[detectionQuality(pose.detection_rate)];

  const lines: Record<ComponentKey, string | null> = {
    c1: `Bowler found in ${Math.round(pose.detection_rate * 100)}% of frames · ${quality.label.toLowerCase()} detection`,
    c2: row ? `${redFlags} angle${redFlags === 1 ? '' : 's'} over the limit${unchecked > 0 ? ` (+${unchecked} low visibility)` : ''}` : null,
    c3: risk && level ? `Risk ${Math.round(risk.risk_score * 100)}/100 · ${RISK[level].label}` : null,
    c4: plan ? `${plan.limits.daily_limit_overs === 0 ? 'No bowling' : `Daily limit ${plan.limits.daily_limit_overs} overs`} · ${plan.recommendations.length} actions` : null,
  };

  async function saveAndOpen() {
    await refresh();
    const id = athlete!.id;
    reset();
    router.dismissAll();
    router.push({ pathname: '/bowler/[id]', params: { id: String(id) } });
  }

  return (
    <Screen>
      <StepIndicator steps={ANALYSIS_STEPS} current={4} />
      <GradientHeader title={`${athlete.bowler_id} · results`} tint={level ? RISK[level].color : undefined} icon="sparkles"
        subtitle={new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} />

      <Card variant="glow" accent={level ? RISK[level].color : undefined}>
        <View style={s.summaryTop}>
          <View style={{ flex: 1, gap: sp(1) }}>
            {level ? <RiskBadge level={level} size="lg" /> : <Text style={s.muted}>Risk not assessed</Text>}
            {topFactor && <Text style={s.body}><Text style={s.bold}>Top reason: </Text>{topFactor.label}{'display_value' in topFactor && topFactor.display_value ? ` (${topFactor.display_value})` : ''}</Text>}
            {redFlags != null && (
              <Text style={s.body}><Text style={s.bold}>{redFlags}</Text> angle{redFlags === 1 ? '' : 's'} over the limit{unchecked > 0 ? `, ${unchecked} more with low visibility` : ''}</Text>
            )}
          </View>
          <ScoreRing value={pose.detection_rate * 100} size={88} tint={quality.color} label={`${quality.label} detection`} />
        </View>
      </Card>

      {COMPONENT_KEYS.map((k) => {
        const c = COMPONENT[k];
        const ok = steps[k].state === 'done';
        return (
          <Pressable key={k} disabled={!ok} onPress={() => router.push({ pathname: '/analyse/details', params: { start: k } })}
            accessibilityRole="button" accessibilityLabel={`${c.code} ${c.label}. ${lines[k] ?? 'Not finished'}`}
            style={({ pressed }) => [s.big, { borderColor: alpha(c.color, ok ? 0.55 : 0.2) }, ok && glow(c.color, 0.5), pressed && { opacity: 0.85 }]}>
            <View style={[s.bigIcon, { backgroundColor: alpha(c.color, 0.16) }]}><Ionicons name={c.icon} size={28} color={c.color} /></View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={s.badgeRow}>
                <ComponentBadge component={k} />
                {researchMode && <Text style={s.owner}>{OWNER[k]}</Text>}
              </View>
              <Text style={[s.bigText, !ok && { color: color.muted }]}>{ok ? lines[k] : steps[k].state === 'failed' ? 'Stopped – see the error on the previous screen' : 'Not finished'}</Text>
            </View>
            {ok && <Ionicons name="chevron-forward" size={22} color={c.color} />}
          </Pressable>
        );
      })}

      <PrimaryButton title="Save & open bowler profile" icon="person" onPress={saveAndOpen} />
      <Text style={s.caption}>Everything is already stored on the team computer; this returns to {athlete.bowler_id}'s profile.</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  body: { ...font.body, color: color.text },
  bold: { fontWeight: '800' },
  muted: { ...font.body, color: color.muted },
  caption: { ...font.caption, color: color.muted, textAlign: 'center' },
  big: { flexDirection: 'row', alignItems: 'center', gap: sp(2), backgroundColor: color.surface, borderWidth: 1, borderRadius: radius.card, padding: sp(2.5), minHeight: 96 },
  bigIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  owner: { ...font.caption, color: color.muted, fontStyle: 'italic' },
  bigText: { ...font.h2, color: color.text },
});
