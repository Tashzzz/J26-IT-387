// Home. One hero: the squad risk summary with who needs attention. Below it: a quick "Analyse a delivery"
// action, two small counts and recent analyses (logged on this phone by the guided analysis).
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../../src/shell/AppContext';
import { ago, isHighRisk, severity, useSquad, type SquadRow } from '../../src/shell/squad';
import { StatusPill, useBackendStatus } from '../../src/shell/status';
import {
  Avatar, Card, color, COMPONENT_KEYS, EmptyState, ErrorBanner, font, gradient, LogoMark, MetricTile, radius, RISK, RiskBadge,
  RiskIcon, Screen, SectionTitle, Skeleton, SkeletonCard, sp, Tag, type RiskLevel,
} from '../../src/ui';

const WEEK_MS = 7 * 86400000;
const LEVELS: RiskLevel[] = ['critical', 'high', 'moderate', 'low'];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Hero: how many bowlers need attention, the squad's spread over the four levels, and the top three. */
function SquadRisk({ real, attention, onOpen, onSquad }: {
  real: SquadRow[];
  attention: SquadRow[];
  onOpen: (id: number) => void;
  onSquad: () => void;
}) {
  const assessed = real.filter((r) => r.level);
  const worst = attention[0]?.level ?? null;
  const n = attention.length;
  return (
    <Card variant={worst ? 'glow' : 'plain'} accent={worst ? RISK[worst].color : undefined} style={s.hero}>
      <Text style={s.overline}>Squad risk</Text>
      <View style={s.heroTop}>
        <RiskIcon level={worst ?? 'low'} size={32} />
        <Text style={s.heroTitle}>
          {n === 0 ? 'All clear' : `${n} bowler${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} attention`}
        </Text>
      </View>
      <Text style={s.muted}>
        {assessed.length === 0 ? 'No bowler has a risk result yet. Analyse a delivery to get one.'
          : n === 0 ? `None of the ${assessed.length} assessed bowler${assessed.length === 1 ? ' is' : 's are'} at high risk.`
          : 'High or critical risk on their latest result. Check them before the next session.'}
      </Text>

      {assessed.length > 0 && (
        <View style={{ gap: sp(1) }}>
          <View style={s.bar} accessible accessibilityLabel={LEVELS.map((l) => `${assessed.filter((r) => r.level === l).length} ${RISK[l].label}`).join(', ')}>
            {LEVELS.slice().reverse().map((l) => {
              const c = assessed.filter((r) => r.level === l).length;
              return c ? <View key={l} style={{ flex: c, backgroundColor: RISK[l].color }} /> : null;
            })}
          </View>
          <View style={s.legend}>
            {LEVELS.map((l) => (
              <View key={l} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: RISK[l].color }]} />
                <Text style={s.legendText}>{assessed.filter((r) => r.level === l).length} {RISK[l].label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {attention.slice(0, 3).map((r) => {
        const lvl = r.level!;
        const reason = r.latest?.top_factors[0]?.label ?? r.latest?.top_factors[0]?.feature;
        return (
          <Pressable key={r.athlete.id} onPress={() => onOpen(r.athlete.id)} accessibilityRole="button"
            accessibilityLabel={`${r.athlete.bowler_id}, ${RISK[lvl].label} risk${reason ? `, mainly ${reason}` : ''}`}
            style={({ pressed }) => [s.attn, pressed && { opacity: 0.8 }]}>
            <Avatar code={r.athlete.bowler_id} risk={lvl} size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.code}>{r.athlete.bowler_id}</Text>
              <Text style={s.meta} numberOfLines={1}>{reason ? `Mainly ${reason}` : `Assessed ${ago(r.latest?.created_at)}`}</Text>
            </View>
            <RiskBadge level={lvl} size="sm" suffix="" />
            <Ionicons name="chevron-forward" size={18} color={color.muted} />
          </Pressable>
        );
      })}
      {n > 3 && (
        <Pressable onPress={onSquad} accessibilityRole="button" style={s.more}>
          <Text style={s.moreText}>See all {n} in Squad</Text>
          <Ionicons name="arrow-forward" size={16} color={color.brandText} />
        </Pressable>
      )}
    </Card>
  );
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
  const allUp = status.up != null && COMPONENT_KEYS.every((k) => status.up![k]);

  return (
    <Screen safeTop onRefresh={async () => { await Promise.all([refresh(), status.check()]); }}>
      <View style={s.top}>
        <LogoMark size={40} />
        <View style={{ flex: 1 }}>
          <Text style={s.date}>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          {coach.team ? <Text style={s.team} numberOfLines={1}>{coach.team}</Text> : null}
        </View>
      </View>
      <Text style={s.hello} accessibilityRole="header">{greeting()}{coach.name ? `, ${coach.name}` : ''}</Text>
      {status.up != null && !allUp && <StatusPill status={status} onPress={() => router.push('/settings')} />}

      {error ? <ErrorBanner title="Can't reach the team computer" message={error} onRetry={refresh} />
        : loading ? <Skeleton height={220} round={radius.card} />
        : real.length === 0 ? (
          <Card>
            <EmptyState spot="squad" title="Add your first bowler" text="Each bowler gets a code like B03. Their videos, risk and plans are saved to it."
              actionTitle="Add bowler" onAction={() => router.push('/bowler/edit')} />
          </Card>
        ) : riskUnavailable ? (
          <Card><Text style={s.muted}>Risk results are not available right now. Pull down to try again.</Text></Card>
        ) : (
          <SquadRisk real={real} attention={attention} onOpen={profile} onSquad={() => router.push({ pathname: '/squad', params: { filter: 'high' } })} />
        )}

      <Pressable onPress={() => router.push('/analyse')} accessibilityRole="button" accessibilityLabel="Analyse a delivery"
        style={({ pressed }) => [s.action, pressed && { opacity: 0.85 }]}>
        <LinearGradient colors={gradient.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.actionIcon}>
          <Ionicons name="videocam" size={22} color={color.onBrand} />
        </LinearGradient>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.code}>Analyse a delivery</Text>
          <Text style={s.meta}>Film it, see the action, know the risk, get a plan.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={color.muted} />
      </Pressable>

      <View style={s.tiles}>
        <MetricTile label="Bowlers" value={loading ? '–' : real.length} icon="people-outline" onPress={() => router.push('/squad')} />
        <MetricTile label="This week" value={thisWeek} unit={thisWeek === 1 ? 'analysis' : 'analyses'} icon="videocam-outline" />
      </View>

      <SectionTitle title="Recent analyses" />
      {loading && analyses.length === 0 ? <SkeletonCard /> : recent.length === 0 ? (
        <Card>
          <EmptyState spot="video" title="No analyses yet" text="Your analysed deliveries show up here."
            actionTitle="Analyse a delivery" onAction={() => router.push('/analyse')} />
        </Card>
      ) : recent.map((a) => (
        <Pressable key={`${a.athleteId}-${a.at}`} onPress={() => profile(a.athleteId)} accessibilityRole="button"
          style={({ pressed }) => [s.recent, pressed && { opacity: 0.8 }]}>
          <Avatar code={a.code} risk={a.level} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.code}>{a.code} <Text style={s.meta}>· {ago(a.at)}</Text></Text>
            <Text style={s.meta} numberOfLines={1}>
              {[a.redFlags != null ? `${a.redFlags} angle${a.redFlags === 1 ? '' : 's'} over the limit` : null, a.reason].filter(Boolean).join(' · ') || 'Analysed'}
            </Text>
          </View>
          {a.level ? <RiskBadge level={a.level} size="sm" suffix="" /> : <Tag label="No risk" />}
        </Pressable>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5) },
  date: { ...font.caption, color: color.muted },
  team: { ...font.caption, color: color.text, fontWeight: '700' },
  hello: { ...font.display, color: color.text },
  overline: { ...font.overline, color: color.muted },
  hero: { gap: sp(1.5), padding: sp(2.5) },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  heroTitle: { ...font.title, color: color.text, flex: 1 },
  muted: { ...font.body, color: color.muted },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2, backgroundColor: color.surface2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: sp(2), rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...font.caption, color: color.muted },
  attn: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), minHeight: 56, borderTopWidth: 1, borderTopColor: color.border, paddingTop: sp(1.5) },
  code: { ...font.h2, color: color.text },
  meta: { ...font.caption, color: color.muted },
  more: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  moreText: { ...font.body, fontWeight: '700', color: color.brandText },
  action: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.card, padding: sp(1.5), minHeight: 72 },
  actionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1.5) },
  recent: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.card, padding: sp(1.5) },
});
