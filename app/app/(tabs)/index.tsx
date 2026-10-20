// Home: greeting + date, backend status, "New analysis" hero, who needs attention, squad summary,
// recent analyses (logged on this phone by the guided analysis).
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../../src/shell/AppContext';
import { ago, isHighRisk, severity, useSquad } from '../../src/shell/squad';
import { StatusPill, useBackendStatus } from '../../src/shell/status';
import {
  alpha, Avatar, color, EmptyState, ErrorBanner, font, glow, gradient, MetricTile, PipelineStepper, radius, RISK, RiskBadge, Screen,
  Skeleton, sp, Tag,
} from '../../src/ui';

const WEEK_MS = 7 * 86400000;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const router = useRouter();
  const { coach, analyses } = useApp();
  const { rows, loading, error, refresh, riskUnavailable } = useSquad();
  const status = useBackendStatus();

  const real = rows.filter((r) => !r.demo);
  const attention = real.filter((r) => isHighRisk(r.level)).sort((a, b) => severity(b.level) - severity(a.level));
  const thisWeek = analyses.filter((a) => Date.now() - new Date(a.at).getTime() < WEEK_MS).length;
  const recent = analyses.slice(0, 5);
  const profile = (id: number) => router.push({ pathname: '/bowler/[id]', params: { id: String(id) } });

  return (
    <Screen safeTop onRefresh={async () => { await Promise.all([refresh(), status.check()]); }}>
      <View style={s.top}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.date}>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          <Text style={s.hello}>{greeting()}{coach.name ? `, ${coach.name}` : ''}</Text>
          {coach.team ? <Tag label={coach.team} icon="shield-outline" /> : null}
        </View>
        <LinearGradient colors={gradient.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.logo}>
          <Ionicons name="shield-checkmark" size={24} color={color.onBrand} />
        </LinearGradient>
      </View>
      <StatusPill status={status} onPress={() => router.push('/settings')} />

      <Pressable onPress={() => router.push('/analyse')} accessibilityRole="button" accessibilityLabel="New analysis"
        style={({ pressed }) => [s.heroWrap, glow(gradient.brand[0], 1), pressed && { transform: [{ scale: 0.99 }] }]}>
        <LinearGradient colors={gradient.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroRow}>
            <View style={s.heroIcon}><Ionicons name="videocam" size={28} color={gradient.brand[0]} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.heroTitle}>New analysis</Text>
              <Text style={s.heroText}>Film one delivery: pose, joint angles, risk and this week's plan.</Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={34} color={color.onBrand} />
          </View>
          <View style={s.heroSteps}><PipelineStepper states={{}} compact /></View>
        </LinearGradient>
      </Pressable>

      {error ? <ErrorBanner title="Can't reach the team computer" message={error} onRetry={refresh} /> : null}

      <Text style={s.h2}>Needs attention</Text>
      {loading ? <Skeleton height={140} round={20} />
        : riskUnavailable ? <Text style={s.muted}>Risk results are not available right now.</Text>
        : attention.length === 0 ? (
          <View style={s.allClear}>
            <Ionicons name="checkmark-circle" size={22} color={RISK.low.color} />
            <Text style={s.body}>{real.length ? 'No bowler is at high risk right now.' : 'Add bowlers to see who needs attention.'}</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.carousel} snapToInterval={272} decelerationRate="fast">
            {attention.map((r) => {
              const lvl = r.level!;
              const reason = r.latest?.top_factors[0]?.label ?? r.latest?.top_factors[0]?.feature;
              return (
                <Pressable key={r.athlete.id} onPress={() => profile(r.athlete.id)} accessibilityRole="button"
                  accessibilityLabel={`${r.athlete.bowler_id}, ${RISK[lvl].label} risk${reason ? `, mainly ${reason}` : ''}`}
                  style={({ pressed }) => [s.attn, { borderColor: alpha(RISK[lvl].color, 0.55) }, pressed && { opacity: 0.85 }]}>
                  <View style={s.attnTop}>
                    <Avatar code={r.athlete.bowler_id} risk={lvl} size={52} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={s.code}>{r.athlete.bowler_id}</Text>
                      <RiskBadge level={lvl} size="sm" />
                    </View>
                  </View>
                  {reason ? <Text style={s.reason} numberOfLines={2}><Text style={s.reasonLabel}>Main reason: </Text>{reason}</Text> : null}
                  <Text style={s.meta}>Assessed {ago(r.latest?.created_at)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

      <View style={s.tiles}>
        <MetricTile label="Bowlers" value={loading ? '–' : real.length} icon="people" onPress={() => router.push('/squad')} />
        <MetricTile label="This week" value={thisWeek} unit={thisWeek === 1 ? 'analysis' : 'analyses'} icon="videocam" />
        <MetricTile label="High risk" value={loading || riskUnavailable ? '–' : attention.length} icon="warning"
          tint={attention.length ? RISK.high.text : color.text} onPress={() => router.push({ pathname: '/squad', params: { filter: 'high' } })} />
      </View>

      <Text style={s.h2}>Recent analyses</Text>
      {recent.length === 0 ? (
        <EmptyState icon="film" title="No analyses yet" text="Analyses you run on this phone appear here." actionTitle="New analysis" onAction={() => router.push('/analyse')} />
      ) : recent.map((a) => (
        <Pressable key={`${a.athleteId}-${a.at}`} onPress={() => profile(a.athleteId)} accessibilityRole="button"
          style={({ pressed }) => [s.recent, pressed && { opacity: 0.8 }]}>
          <Avatar code={a.code} risk={a.level} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.code}>{a.code} <Text style={s.meta}>· {ago(a.at)}</Text></Text>
            <Text style={s.meta} numberOfLines={1}>
              {[a.redFlags != null ? `${a.redFlags} angle${a.redFlags === 1 ? '' : 's'} over limit` : null, a.reason].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {a.level ? <RiskBadge level={a.level} size="sm" suffix="" /> : <Tag label="No risk" />}
        </Pressable>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  date: { ...font.caption, color: color.muted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' },
  hello: { ...font.display, color: color.text },
  logo: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroWrap: { borderRadius: radius.card + 4 },
  hero: { borderRadius: radius.card + 4, padding: sp(2.5), gap: sp(2) },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5) },
  heroIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { ...font.title, color: color.onBrand },
  heroText: { ...font.body, color: color.onBrand },
  heroSteps: { backgroundColor: alpha(color.bg, 0.85), borderRadius: radius.button, paddingVertical: sp(1) },
  h2: { ...font.h2, color: color.text, marginTop: sp(1) },
  body: { ...font.body, color: color.text, flex: 1 },
  muted: { ...font.body, color: color.muted },
  allClear: { flexDirection: 'row', alignItems: 'center', gap: sp(1), backgroundColor: color.surface, borderRadius: radius.card, borderWidth: 1, borderColor: color.border, padding: sp(2) },
  carousel: { gap: sp(1.5), paddingRight: sp(2) },
  attn: { width: 260, backgroundColor: color.surface, borderWidth: 1, borderRadius: radius.card, padding: sp(2), gap: sp(1) },
  attnTop: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5) },
  code: { ...font.h2, color: color.text },
  reason: { ...font.body, color: color.text },
  reasonLabel: { color: color.muted, fontWeight: '700' },
  meta: { ...font.caption, color: color.muted, fontWeight: '500' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1.5) },
  recent: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.card, padding: sp(1.5) },
});
