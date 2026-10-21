// C4 explainability screen - why was this recommended? (FR8)
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useC4 } from '../../../src/c4/C4Context';
import { categoryMeta, colors } from '../../../src/c4/theme';
import { Body, Button, Card, H, Screen } from '../../../src/c4/ui';

const LABELS: Record<string, string> = {
  acute_chronic_workload_ratio: 'Workload spike (ACWR)',
  shoulder_counter_rotation_deg: 'Shoulder counter-rotation',
  trunk_lateral_flexion_deg: 'Trunk side-bend',
  front_knee_flexion_release_deg: 'Front knee at release',
  front_knee_flexion_ffc_deg: 'Front knee at landing',
  consecutive_days: 'Consecutive bowling days',
  injury_history: 'Previous injury',
  soreness: 'Soreness',
};
const label = (f: string) => LABELS[f] ?? f.replace(/_/g, ' ');

export default function Why() {
  const { ruleId } = useLocalSearchParams<{ ruleId: string }>();
  const router = useRouter();
  const { plan } = useC4();
  const rec = plan?.recommendations.find((r) => r.rule_id === ruleId);

  if (!plan || !rec) {
    return <Screen><Card><Body muted>This recommendation is not in the current plan.</Body></Card></Screen>;
  }
  const shap = plan.metrics.shap_top;
  const max = Math.max(0.01, ...shap.map((x) => x.shap));

  return (
    <Screen>
      <Card>
        <Text style={[s.cat, { color: categoryMeta[rec.category].color }]}>{categoryMeta[rec.category].label}</Text>
        <Text style={s.title}>{rec.title}</Text>
        <Body>{rec.action}</Body>
      </Card>

      <H>Why</H>
      <Card><Body>{rec.explanation}</Body></Card>

      {shap.length > 0 && (
        <>
          <H>Top risk factors from C3 (SHAP)</H>
          <Card>
            {shap.map((f) => {
              const linked = f.feature === rec.reason;
              return (
                <View key={f.feature} style={{ marginBottom: 8 }}>
                  <View style={s.barRow}>
                    <Text style={[s.barLabel, linked && { color: colors.accent, fontWeight: '700' }]}>
                      {label(f.feature)}{f.value != null ? ` (${f.value})` : ''}{linked ? '  ← this action' : ''}
                    </Text>
                    <Text style={s.barValue}>+{f.shap.toFixed(2)}</Text>
                  </View>
                  <View style={s.track}>
                    <View style={[s.fill, { width: `${(f.shap / max) * 100}%`, backgroundColor: linked ? colors.accent : colors.muted }]} />
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      )}

      <H>Evidence</H>
      <Card>
        {rec.evidence.map((e) => <Text key={e} style={s.ref}>• {e}</Text>)}
        <Text style={s.meta}>Rule {rec.rule_id} · factors: {rec.contributing_factors.join(', ')}</Text>
      </Card>

      <Button title="Physio / coach: accept, modify or reject" variant="secondary" icon="create-outline"
        onPress={() => router.push({ pathname: '/plan/feedback', params: { ruleId: rec.rule_id } })} disabled={!plan.id} />
    </Screen>
  );
}

const s = StyleSheet.create({
  cat: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  barRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { color: colors.text, fontSize: 13, flex: 1 },
  barValue: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  track: { height: 8, backgroundColor: colors.cardAlt, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  ref: { color: colors.text, fontSize: 13, lineHeight: 19 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 6 },
});
