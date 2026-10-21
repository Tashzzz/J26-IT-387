// Insights: the squad's risk spread, then "Behind the numbers" (how tracking, angle limits, the risk score
// and plan rules work). Research mode adds "Research workspaces": the members' standalone screens, with
// component codes and owners.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { OWNER } from '../../src/analysis/owners';
import { useSquad } from '../../src/shell/squad';
import {
  alpha, Card, color, COMPONENT, ComponentBadge, EmptyState, ErrorBanner, font, GradientHeader, ProgressBar, radius, RISK, RiskBadge, Screen,
  SectionTitle, Skeleton, sp, useResearchMode, type ComponentKey, type IconName, type RiskLevel,
} from '../../src/ui';

type Href = '/reliability' | '/insights/thresholds' | '/insights/model' | '/insights/knowledge' | '/capture' | '/features' | '/risk' | '/plan';
type Row = { c: ComponentKey; title: string; text: string; research?: string; icon: IconName; href: Href };

const EVIDENCE: Row[] = [
  { c: 'c1', title: 'How reliable the tracking is', text: 'How well each body part is tracked from each camera position.', research: 'ICC per keypoint and camera setup, with the 0.75 gate.', icon: 'analytics-outline', href: '/reliability' },
  { c: 'c2', title: 'Joint-angle limits', text: 'Every angle we check, what it means and where the limit comes from.', icon: 'library-outline', href: '/insights/thresholds' },
  { c: 'c3', title: 'How the risk score works', text: 'What the score is based on, how accurate it is and when it alerts.', research: 'Model card: training data, AUC, calibration and SHAP.', icon: 'pulse-outline', href: '/insights/model' },
  { c: 'c4', title: 'Plan rules & sources', text: 'Workload limits, exercises and when to see a physio - with sources.', research: 'Knowledge base: every rule id and its evidence.', icon: 'book-outline', href: '/insights/knowledge' },
];
const WORKSPACES: Row[] = [
  { c: 'c1', title: 'Pose capture', text: 'Upload a clip and get the skeleton overlay and keypoints.', icon: 'videocam-outline', href: '/capture' },
  { c: 'c2', title: 'Joint angles', text: 'Compute angles, correct event frames, send to risk and plan.', icon: 'body-outline', href: '/features' },
  { c: 'c3', title: 'Risk assessment', text: 'Run the model for a bowler and inspect every factor.', icon: 'pulse-outline', href: '/risk' },
  { c: 'c4', title: 'Prevention plans', text: 'Generate plans, log workload and collect feedback.', icon: 'clipboard-outline', href: '/plan' },
];
const LEVELS: RiskLevel[] = ['critical', 'high', 'moderate', 'low'];

function LinkRow({ row, research, onPress }: { row: Row; research: boolean; onPress: () => void }) {
  const c = COMPONENT[row.c];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={row.title}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}>
      <View style={[s.rowIcon, { backgroundColor: alpha(c.color, 0.12) }]}><Ionicons name={row.icon} size={22} color={c.color} /></View>
      <View style={{ flex: 1, gap: 4 }}>
        {research && (
          <View style={s.badgeRow}>
            <ComponentBadge component={row.c} />
            <Text style={s.owner}>{OWNER[row.c]}</Text>
          </View>
        )}
        <Text style={s.rowTitle}>{row.title}</Text>
        <Text style={s.muted}>{research && row.research ? row.research : row.text}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={color.muted} />
    </Pressable>
  );
}

export default function Insights() {
  const router = useRouter();
  const research = useResearchMode();
  const { rows, loading, error, refresh, riskUnavailable } = useSquad();
  const real = rows.filter((r) => !r.demo);
  const assessed = real.filter((r) => r.level);

  return (
    <Screen safeTop onRefresh={refresh}>
      <GradientHeader title="Insights" subtitle="How your squad is doing, and how the numbers are made." />

      <Card>
        <Text style={s.overline}>Squad risk</Text>
        {error ? <ErrorBanner message={error} onRetry={refresh} />
          : loading ? <View style={{ gap: sp(1.5) }}>{LEVELS.map((l) => <Skeleton key={l} height={24} />)}</View>
          : riskUnavailable ? <Text style={s.muted}>Risk results are not available right now. Pull down to try again.</Text>
          : assessed.length === 0 ? (
            <EmptyState spot="results" title="No risk results yet" text="Analyse a delivery to see how the squad is spread across risk levels."
              actionTitle="Analyse a delivery" onAction={() => router.push('/analyse')} />
          ) : LEVELS.map((l) => {
            const n = assessed.filter((r) => r.level === l).length;
            return (
              <View key={l} style={s.levelRow}>
                <View style={{ width: 120 }}><RiskBadge level={l} size="sm" suffix="" /></View>
                <View style={{ flex: 1 }}><ProgressBar value={n / assessed.length} tint={RISK[l].color} /></View>
                <Text style={s.count}>{n}</Text>
              </View>
            );
          })}
        {!loading && !error && assessed.length > 0 && real.length > assessed.length && (
          <Text style={s.caption}>{real.length - assessed.length} of {real.length} bowlers not assessed yet. Demo bowlers are not counted.</Text>
        )}
      </Card>

      <SectionTitle title="Behind the numbers" />
      {EVIDENCE.map((r) => <LinkRow key={r.href} row={r} research={research} onPress={() => router.push(r.href)} />)}

      {research && (
        <>
          <SectionTitle title="Research workspaces" />
          <Text style={s.caption}>The original standalone screens for each research component. Shown in Research mode only.</Text>
          {WORKSPACES.map((r) => <LinkRow key={r.href} row={r} research={research} onPress={() => router.push(r.href)} />)}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  overline: { ...font.overline, color: color.muted },
  muted: { ...font.body, color: color.muted },
  caption: { ...font.caption, color: color.muted },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  count: { ...font.h2, color: color.text, width: 28, textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.card, padding: sp(2) },
  rowIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  owner: { ...font.caption, color: color.muted },
  rowTitle: { ...font.h2, color: color.text },
});
