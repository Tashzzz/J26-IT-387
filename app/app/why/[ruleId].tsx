// C4 explainability (FR8): why was this action recommended - reason, linked risk factors, evidence.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../../src/state/AppContext';
import { Button, Card, EmptyState, ProgressBar, Screen, Section, Small } from '../../src/ui/components';
import { categoryMeta, colors, type as t } from '../../src/ui/theme';

const LABELS: Record<string, string> = {
  acute_chronic_workload_ratio: 'Workload spike',
  shoulder_counter_rotation_deg: 'Shoulder twist',
  trunk_lateral_flexion_deg: 'Sideways body lean',
  front_knee_flexion_release_deg: 'Front knee at release',
  front_knee_flexion_ffc_deg: 'Front knee at landing',
  hip_shoulder_separation_bfc_deg: 'Hips vs shoulders',
  consecutive_days: 'Days bowled in a row',
  injury_history: 'Previous injury',
  soreness: 'Soreness',
};
const label = (f: string) => LABELS[f] ?? f.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export default function Why() {
  const { ruleId } = useLocalSearchParams<{ ruleId: string }>();
  const router = useRouter();
  const { plan } = useApp();
  const rec = plan?.recommendations.find((r) => r.rule_id === ruleId);

  if (!plan || !rec) {
    return <Screen><EmptyState icon="help-circle-outline" title="Not in the current plan" text="The plan was updated. Go back to see the latest actions." action="Back to the plan" onAction={() => (router.canGoBack() ? router.back() : router.replace('/plan'))} /></Screen>;
  }
  const shap = plan.metrics.shap_top.filter((x) => x.shap > 0);
  const max = Math.max(0.01, ...shap.map((x) => x.shap));
  const meta = categoryMeta[rec.category];

  return (
    <Screen footer={plan.id ? <Button title="Review this action" variant="secondary" icon="create-outline"
      onPress={() => router.push({ pathname: '/feedback', params: { ruleId: rec.rule_id } })} /> : undefined}>
      <Card>
        <Text style={[t.overline, { color: meta.color }]}>{meta.label}</Text>
        <Text style={t.title}>{rec.title}</Text>
        <Text style={t.body}>{rec.action}</Text>
        {rec.exercises.map((e) => (
          <View key={e.name} style={s.ex}>
            <Text style={s.exName}>{e.name}</Text>
            <Small>{e.dose} · {e.targets}</Small>
          </View>
        ))}
      </Card>

      <Section title="Why">
        <Card><Text style={t.body}>{rec.explanation}</Text></Card>
      </Section>

      {shap.length > 0 && (
        <Section title="What raised the risk score">
          <Card>
            {shap.map((f) => {
              const linked = f.feature === rec.reason || rec.contributing_factors.includes(f.feature);
              return (
                <View key={f.feature} style={{ gap: 6, marginBottom: 6 }}>
                  <View style={s.barRow}>
                    <Text style={[s.barLabel, linked && { color: colors.primary, fontWeight: '800' }]}>
                      {label(f.feature)}{f.value != null ? ` (${f.value})` : ''}{linked ? ' · this action' : ''}
                    </Text>
                    <Text style={s.barValue}>+{(f.shap * 100).toFixed(1)} pts</Text>
                  </View>
                  <ProgressBar value={f.shap / max} color={linked ? colors.primary : colors.borderStrong} />
                </View>
              );
            })}
          </Card>
        </Section>
      )}

      <Section title="Evidence">
        <Card>
          {rec.evidence.map((e) => <Text key={e} style={s.ref}>• {e}</Text>)}
          <Small>Rule {rec.rule_id}</Small>
        </Card>
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  ex: { backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10, gap: 2 },
  exName: { color: colors.text, fontWeight: '700', fontSize: 15 },
  barRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  barLabel: { color: colors.text, fontSize: 14, flex: 1 },
  barValue: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  ref: { color: colors.textSoft, fontSize: 14, lineHeight: 20 },
});
