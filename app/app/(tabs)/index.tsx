// Home: coach greeting, the C1 > C4 pipeline, squad snapshot and who needs attention.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../../src/shell/AppContext';
import { BowlerCard } from '../../src/shell/BowlerCard';
import { isHighRisk, needsAnalysis, severity, useSquad } from '../../src/shell/squad';
import {
  alpha, color, EmptyState, ErrorBanner, font, gradient, MetricTile, PipelineStepper, PrimaryButton, radius, RISK, Screen,
  SecondaryButton, Skeleton, sp, Tag, type ComponentKey,
} from '../../src/ui';

const COMPONENT_ROUTE: Record<ComponentKey, '/capture' | '/features' | '/risk' | '/plan'> = { c1: '/capture', c2: '/features', c3: '/risk', c4: '/plan' };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const router = useRouter();
  const { coach } = useApp();
  const { rows, loading, error, refresh, riskUnavailable } = useSquad();
  const real = rows.filter((r) => !r.demo);
  const high = real.filter((r) => isHighRisk(r.level));
  const toAnalyse = real.filter(needsAnalysis);
  const attention = [...high].sort((a, b) => severity(b.level) - severity(a.level)).slice(0, 3);

  return (
    <Screen safeTop onRefresh={refresh}>
      <View style={s.top}>
        <View style={{ flex: 1 }}>
          <Text style={s.hello}>{greeting()}{coach.name ? `, ${coach.name}` : ''}</Text>
          {coach.team ? <Tag label={coach.team} icon="shield-outline" /> : null}
        </View>
        <LinearGradient colors={gradient.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.logo}>
          <Ionicons name="shield-checkmark" size={24} color={color.onBrand} />
        </LinearGradient>
      </View>

      <LinearGradient colors={[alpha(gradient.brand[0], 0.35), alpha(gradient.brand[1], 0.12)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
        <Text style={s.heroTitle}>From one phone video to a safer bowling week</Text>
        <PipelineStepper states={{}} onPress={(k) => router.push(COMPONENT_ROUTE[k])} />
        <PrimaryButton title="New analysis" icon="videocam" onPress={() => router.push('/analyse')} />
      </LinearGradient>

      {error ? (
        <ErrorBanner title="Can't reach the team computer" message={error} onRetry={refresh} />
      ) : loading ? (
        <View style={{ gap: sp(1.5) }}>
          <View style={s.tiles}>{[0, 1, 2].map((i) => <Skeleton key={i} height={84} round={16} style={{ flex: 1 }} />)}</View>
          <Skeleton height={80} round={20} />
          <Skeleton height={80} round={20} />
        </View>
      ) : (
        <>
          <View style={s.tiles}>
            <MetricTile label="Bowlers" value={real.length} icon="people" onPress={() => router.push('/squad')} />
            <MetricTile label="High risk" value={riskUnavailable ? '–' : high.length} icon="warning" tint={high.length ? RISK.high.text : color.text} />
            <MetricTile label="To analyse" value={toAnalyse.length} icon="videocam" />
          </View>

          <Text style={s.h2}>Needs attention</Text>
          {real.length === 0 ? (
            <EmptyState icon="person-add" title="Add your first bowler" text="Profiles come first: every analysis, risk score and plan belongs to a bowler."
              actionTitle="Add bowler" onAction={() => router.push('/bowler/edit')} />
          ) : attention.length === 0 ? (
            <View style={s.allClear}>
              <Ionicons name="checkmark-circle" size={22} color={RISK.low.color} />
              <Text style={s.allClearText}>{riskUnavailable ? 'Risk results are not available right now.' : 'No bowler is at high risk right now.'}</Text>
            </View>
          ) : attention.map((r) => (
            <BowlerCard key={r.athlete.id} row={r} onPress={() => router.push({ pathname: '/bowler/[id]', params: { id: String(r.athlete.id) } })} />
          ))}
          {toAnalyse.length > 0 && (
            <SecondaryButton title={`${toAnalyse.length} bowler${toAnalyse.length === 1 ? '' : 's'} not analysed yet`} icon="videocam-outline"
              onPress={() => router.push({ pathname: '/squad', params: { filter: 'analyse' } })} />
          )}
          <SecondaryButton title="Add bowler" icon="person-add-outline" onPress={() => router.push('/bowler/edit')} />
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  hello: { ...font.display, color: color.text, marginBottom: sp(1) },
  logo: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: radius.card, borderWidth: 1, borderColor: color.border, padding: sp(2.5), gap: sp(2.5) },
  heroTitle: { ...font.title, color: color.text },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1.5) },
  h2: { ...font.h2, color: color.text, marginTop: sp(1) },
  allClear: { flexDirection: 'row', alignItems: 'center', gap: sp(1), backgroundColor: color.surface, borderRadius: radius.card, borderWidth: 1, borderColor: color.border, padding: sp(2) },
  allClearText: { ...font.body, color: color.text, flex: 1 },
});
