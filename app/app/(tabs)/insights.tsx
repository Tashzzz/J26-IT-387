// Insights: squad risk spread + a door into each component's full screen, in its own colour.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSquad } from '../../src/shell/squad';
import {
  alpha, Card, color, COMPONENT, ComponentBadge, ErrorBanner, font, GradientHeader, ProgressBar, radius, RISK, RiskBadge, Screen,
  Skeleton, sp, type ComponentKey, type IconName, type RiskLevel,
} from '../../src/ui';

type Door = { c: ComponentKey; title: string; text: string; icon: IconName; href: '/capture' | '/reliability' | '/features' | '/risk' | '/plan' };
const DOORS: Door[] = [
  { c: 'c1', title: 'Keypoint reliability', text: 'Which body points the camera finds consistently, per camera setup (ICC study).', icon: 'analytics', href: '/reliability' },
  { c: 'c1', title: 'Pose capture', text: 'Upload a clip and get the skeleton overlay and keypoints.', icon: 'videocam', href: '/capture' },
  { c: 'c2', title: 'Biomechanics', text: 'Joint angles, delivery events and published injury thresholds.', icon: 'body', href: '/features' },
  { c: 'c3', title: 'Risk model', text: 'Risk score, what drives it (SHAP) and the model card.', icon: 'pulse', href: '/risk' },
  { c: 'c4', title: 'Prevention plans', text: 'Workload limits, actions with reasons, physio referral and feedback.', icon: 'clipboard', href: '/plan' },
];
const LEVELS: RiskLevel[] = ['critical', 'high', 'moderate', 'low'];

export default function Insights() {
  const router = useRouter();
  const { rows, loading, error, refresh, riskUnavailable } = useSquad();
  const real = rows.filter((r) => !r.demo);
  const assessed = real.filter((r) => r.level);

  return (
    <Screen safeTop onRefresh={refresh}>
      <GradientHeader title="Insights" subtitle="How the squad looks, and the detail behind every step." icon="stats-chart" />

      <Card>
        <Text style={s.h2}>Squad risk</Text>
        {error ? <ErrorBanner message={error} onRetry={refresh} />
          : loading ? <Skeleton height={120} />
          : riskUnavailable ? <Text style={s.muted}>The risk model (C3) is not reachable right now.</Text>
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

      <Text style={s.h2}>Component screens</Text>
      {DOORS.map((d) => {
        const c = COMPONENT[d.c];
        return (
          <Pressable key={d.href} onPress={() => router.push(d.href)} accessibilityRole="button" accessibilityLabel={`${c.code} ${d.title}`}
            style={({ pressed }) => [s.door, { borderColor: alpha(c.color, 0.4) }, pressed && { opacity: 0.8 }]}>
            <View style={[s.doorIcon, { backgroundColor: alpha(c.color, 0.16) }]}><Ionicons name={d.icon} size={22} color={c.color} /></View>
            <View style={{ flex: 1, gap: 4 }}>
              <ComponentBadge component={d.c} />
              <Text style={s.doorTitle}>{d.title}</Text>
              <Text style={s.muted}>{d.text}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.color} />
          </Pressable>
        );
      })}
    </Screen>
  );
}

const s = StyleSheet.create({
  h2: { ...font.h2, color: color.text },
  muted: { ...font.body, color: color.muted },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  count: { ...font.h2, color: color.text, width: 28, textAlign: 'right' },
  door: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), backgroundColor: color.surface, borderWidth: 1, borderRadius: radius.card, padding: sp(2) },
  doorIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  doorTitle: { ...font.h2, color: color.text },
});
