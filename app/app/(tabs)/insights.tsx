// Insights - research hub: squad risk spread, then one card per component in its colour opening the
// evidence behind it (C1 reliability study, C2 threshold library, C3 model card, C4 knowledge base),
// and links to the members' standalone tools.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { OWNER } from '../../src/analysis/owners';
import { useSquad } from '../../src/shell/squad';
import {
  alpha, Card, color, COMPONENT, ComponentBadge, ErrorBanner, font, glow, GradientHeader, ProgressBar, radius, RISK, RiskBadge, Screen,
  Skeleton, sp, useResearchMode, type ComponentKey, type IconName, type RiskLevel,
} from '../../src/ui';

type Href = '/reliability' | '/insights/thresholds' | '/insights/model' | '/insights/knowledge' | '/capture' | '/features' | '/risk' | '/plan';
const RESEARCH: { c: ComponentKey; title: string; text: string; icon: IconName; href: Href }[] = [
  { c: 'c1', title: 'Reliability study', text: 'How consistently each body point is found from every camera setup (ICC), with the 0.75 gate.', icon: 'analytics', href: '/reliability' },
  { c: 'c2', title: 'Threshold library', text: 'Every joint-angle limit, what it means and the study it comes from.', icon: 'library', href: '/insights/thresholds' },
  { c: 'c3', title: 'Model card', text: 'What the risk model learned from, how accurate it is and when it alerts.', icon: 'pulse', href: '/insights/model' },
  { c: 'c4', title: 'Knowledge base', text: 'All plan rules, workload limits, referral rules and their sources.', icon: 'book', href: '/insights/knowledge' },
];
const TOOLS: { c: ComponentKey; title: string; href: Href }[] = [
  { c: 'c1', title: 'Pose capture', href: '/capture' },
  { c: 'c2', title: 'Joint angles', href: '/features' },
  { c: 'c3', title: 'Risk assessment', href: '/risk' },
  { c: 'c4', title: 'Prevention plans', href: '/plan' },
];
const LEVELS: RiskLevel[] = ['critical', 'high', 'moderate', 'low'];

export default function Insights() {
  const router = useRouter();
  const research = useResearchMode();
  const { rows, loading, error, refresh, riskUnavailable } = useSquad();
  const real = rows.filter((r) => !r.demo);
  const assessed = real.filter((r) => r.level);

  return (
    <Screen safeTop onRefresh={refresh}>
      <GradientHeader title="Insights" subtitle="The squad at a glance, and the research behind every number." icon="stats-chart" />

      <Card>
        <Text style={s.h2}>Squad risk</Text>
        {error ? <ErrorBanner message={error} onRetry={refresh} />
          : loading ? <Skeleton height={120} />
          : riskUnavailable ? <Text style={s.muted}>The risk model is not reachable right now.</Text>
          : assessed.length === 0 ? <Text style={s.muted}>No bowler has a risk assessment yet.</Text>
          : LEVELS.map((l) => {
            const n = assessed.filter((r) => r.level === l).length;
            return (
              <View key={l} style={s.levelRow}>
                <View style={{ width: 128 }}><RiskBadge level={l} size="sm" suffix="" /></View>
                <View style={{ flex: 1 }}><ProgressBar value={n / assessed.length} tint={RISK[l].color} /></View>
                <Text style={s.count}>{n}</Text>
              </View>
            );
          })}
        {!loading && !error && real.length > assessed.length && (
          <Text style={s.muted}>{real.length - assessed.length} of {real.length} bowlers not assessed yet. Demo bowlers are not counted.</Text>
        )}
      </Card>

      <Text style={s.h2}>Research hub</Text>
      {RESEARCH.map((d) => {
        const c = COMPONENT[d.c];
        return (
          <Pressable key={d.href} onPress={() => router.push(d.href)} accessibilityRole="button" accessibilityLabel={d.title}
            style={({ pressed }) => [s.door, { borderColor: alpha(c.color, 0.5) }, glow(c.color, 0.4), pressed && { opacity: 0.85 }]}>
            <View style={[s.doorIcon, { backgroundColor: alpha(c.color, 0.16) }]}><Ionicons name={d.icon} size={26} color={c.color} /></View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={s.badgeRow}>
                <ComponentBadge component={d.c} />
                {research && <Text style={s.owner}>{OWNER[d.c]}</Text>}
              </View>
              <Text style={[s.doorTitle, { color: c.color }]}>{d.title}</Text>
              <Text style={s.muted}>{d.text}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.color} />
          </Pressable>
        );
      })}

      <Text style={s.h2}>Component tools</Text>
      <View style={s.tools}>
        {TOOLS.map((t) => {
          const c = COMPONENT[t.c];
          return (
            <Pressable key={t.href} onPress={() => router.push(t.href)} accessibilityRole="button"
              style={({ pressed }) => [s.tool, { borderColor: alpha(c.color, 0.35) }, pressed && { opacity: 0.8 }]}>
              <Ionicons name={c.icon} size={18} color={c.color} />
              <Text style={s.toolText} numberOfLines={1}>{t.title}</Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  h2: { ...font.h2, color: color.text, marginTop: sp(0.5) },
  muted: { ...font.body, color: color.muted },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  count: { ...font.h2, color: color.text, width: 28, textAlign: 'right' },
  door: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), backgroundColor: color.surface, borderWidth: 1, borderRadius: radius.card, padding: sp(2) },
  doorIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  owner: { ...font.caption, color: color.muted, fontStyle: 'italic' },
  doorTitle: { ...font.title, fontSize: 19 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1) },
  tool: { flexBasis: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: sp(1), minHeight: 48, backgroundColor: color.surface, borderWidth: 1, borderRadius: radius.button, paddingHorizontal: sp(1.5) },
  toolText: { ...font.body, color: color.text, fontWeight: '600', flexShrink: 1 },
});
