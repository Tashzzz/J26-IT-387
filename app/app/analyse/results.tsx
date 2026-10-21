// Analysis step 5 - results hub. Hero: the skeleton replay of the delivery with the key-moment markers,
// then the overall risk. Below: one neutral row per result opening its full page, and "Save & open profile".
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAnalysis } from '../../src/analysis/AnalysisContext';
import { OWNER } from '../../src/analysis/owners';
import { ANALYSIS_STEPS, RESULT_NAME } from '../../src/analysis/steps';
import { c1 } from '../../src/api/c1';
import { detectionQuality, QUALITY } from '../../src/c1/screens/PoseResultScreen';
import { FEATURE_ORDER } from '../../src/c2/ui';
import { useSquad } from '../../src/shell/squad';
import {
  alpha, Card, color, COMPONENT, COMPONENT_KEYS, ComponentBadge, DeliveryPlayer, EmptyState, font, PrimaryButton, radius, RISK, RiskBadge,
  Screen, SectionTitle, sp, StepIndicator, Tag, toRiskLevel, useResearchMode, type ComponentKey,
} from '../../src/ui';

export default function ResultsHub() {
  const router = useRouter();
  const research = useResearchMode();
  const { athlete, video, results, steps, reset } = useAnalysis();
  const { refresh } = useSquad();

  if (!athlete || !results.pose) {
    return (
      <Screen>
        <EmptyState spot="results" title="No results yet" text="Analyse a delivery to see the replay, risk and plan here."
          actionTitle="Analyse a delivery" onAction={() => router.replace('/analyse')} />
      </Screen>
    );
  }

  const { pose, row, risk, plan } = results;
  const level = risk ? toRiskLevel(risk.risk_tier ?? risk.risk_level) : null;
  const topFactor = risk ? (risk.all_factors.find((f) => f.feature === risk.top_factors[0]?.feature) ?? risk.top_factors[0]) : null;
  const redFlags = row ? FEATURE_ORDER.filter((n) => row.features[n]?.breach && row.features[n]?.reliable).length : null;
  const unchecked = row ? row.n_breaches - (redFlags ?? 0) : 0;
  const quality = QUALITY[detectionQuality(pose.detection_rate)];

  const lines: Record<ComponentKey, string | null> = {
    c1: `Bowler tracked in ${Math.round(pose.detection_rate * 100)}% of frames · ${quality.label.toLowerCase()}`,
    c2: row ? `${redFlags} angle${redFlags === 1 ? '' : 's'} over the limit${unchecked > 0 ? ` (+${unchecked} hard to see)` : ''}` : null,
    c3: risk && level ? `${Math.round(risk.risk_score * 100)} / 100 · ${RISK[level].label}` : null,
    c4: plan ? `${plan.limits.daily_limit_overs === 0 ? 'No bowling' : `Up to ${plan.limits.daily_limit_overs} overs a day`} · ${plan.recommendations.length} actions` : null,
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
      <View style={s.titleRow}>
        <Text style={s.title} accessibilityRole="header">{athlete.bowler_id}</Text>
        <Text style={s.when}>{new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</Text>
      </View>

      <DeliveryPlayer overlayUri={c1.fileUrl(pose.overlay_url)} rawUri={video?.uri} fps={row?.fps}
        events={row ? { bfc: row.events.bfc_frame, ffc: row.events.ffc_frame, release: row.events.release_frame } : null} />

      <Card variant={level ? 'glow' : 'plain'} accent={level ? RISK[level].color : undefined}>
        <Text style={s.overline}>Overall risk</Text>
        {risk && level ? (
          <View style={s.riskRow}>
            <Text style={[s.score, { color: RISK[level].text }]}>{Math.round(risk.risk_score * 100)}<Text style={s.of}> / 100</Text></Text>
            <RiskBadge level={level} size="lg" />
          </View>
        ) : <Text style={s.muted}>Risk was not assessed for this delivery.</Text>}
        {topFactor && <Text style={s.body}><Text style={s.bold}>Main reason: </Text>{topFactor.label}{'display_value' in topFactor && topFactor.display_value ? ` (${topFactor.display_value})` : ''}</Text>}
        {redFlags != null && (
          <Text style={s.body}><Text style={s.bold}>{redFlags}</Text> angle{redFlags === 1 ? '' : 's'} over the limit{unchecked > 0 ? `, ${unchecked} more hard to see from this camera` : ''}</Text>
        )}
        <Tag label={`${quality.label} tracking`} icon={quality.icon} tint={quality.color} />
      </Card>

      <SectionTitle title="Detailed results" />
      {COMPONENT_KEYS.map((k) => {
        const c = COMPONENT[k];
        const ok = steps[k].state === 'done';
        return (
          <Pressable key={k} disabled={!ok} onPress={() => router.push({ pathname: '/analyse/details', params: { start: k } })}
            accessibilityRole="button" accessibilityLabel={`${RESULT_NAME[k]}. ${lines[k] ?? 'Not finished'}`}
            style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}>
            <View style={[s.rowIcon, { backgroundColor: alpha(c.color, 0.12) }]}><Ionicons name={c.icon} size={22} color={c.color} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              {research && (
                <View style={s.badgeRow}><ComponentBadge component={k} /><Text style={s.owner}>{OWNER[k]}</Text></View>
              )}
              <Text style={s.rowTitle}>{RESULT_NAME[k]}</Text>
              <Text style={s.rowText}>{ok ? lines[k] : steps[k].state === 'failed' ? 'Stopped – see the error on the previous screen' : 'Not finished'}</Text>
            </View>
            {ok && <Ionicons name="chevron-forward" size={20} color={color.muted} />}
          </Pressable>
        );
      })}

      <PrimaryButton title={`Save & open ${athlete.bowler_id}'s profile`} icon="person" onPress={saveAndOpen} />
      <Text style={s.caption}>Everything is already stored on the team computer.</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: sp(1), flexWrap: 'wrap' },
  title: { ...font.title, color: color.text },
  when: { ...font.caption, color: color.muted },
  overline: { ...font.overline, color: color.muted },
  riskRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp(1.5), flexWrap: 'wrap' },
  score: { fontSize: 44, lineHeight: 50, fontWeight: '700', letterSpacing: -1 },
  of: { ...font.body, color: color.muted },
  body: { ...font.body, color: color.text },
  bold: { fontWeight: '700' },
  muted: { ...font.body, color: color.muted },
  caption: { ...font.caption, color: color.muted, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.card, padding: sp(2) },
  rowIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  owner: { ...font.caption, color: color.muted },
  rowTitle: { ...font.h2, color: color.text },
  rowText: { ...font.body, color: color.muted },
});
