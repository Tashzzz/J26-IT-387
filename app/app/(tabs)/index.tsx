// Home: the current bowler at a glance - injury risk, today's bowling limits, and what to do next.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { c4 } from '../../src/api/c4';
import { c3 } from '../../src/api/risk';
import type { HistoryItem } from '../../src/c3/types';
import type { Workload } from '../../src/c4/types';
import { athleteLine, useApp } from '../../src/state/AppContext';
import { Avatar, Banner, Body, EmptyState, IconButton, Loading, ProgressBar, Screen, Section, Small, Tile } from '../../src/ui/components';
import { colors, radius, tierColor, tierLabel, type as t } from '../../src/ui/theme';

type Snapshot = { risk: HistoryItem | null; workloads: Workload[]; deliveries: number };

const dateText = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function Home() {
  const router = useRouter();
  const { athlete, plan, online, error, refreshAthletes } = useApp();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!athlete) return;
    const [risk, workloads, up] = await Promise.all([
      c3.history(athlete.id, 1).then((h) => h[0] ?? null).catch(() => null), // the risk model may be offline: Home still works
      c4.workloads(athlete.id).catch(() => [] as Workload[]),
      c4.upstream(athlete.id).catch(() => null),
    ]);
    setSnap({ risk, workloads, deliveries: up?.c2.length ?? 0 });
  }, [athlete]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function refresh() {
    setRefreshing(true);
    await refreshAthletes();
    await load();
    setRefreshing(false);
  }

  const header = (
    <View style={s.header}>
      <Pressable style={({ pressed }) => [s.switcher, pressed && { opacity: 0.7 }]} onPress={() => router.push('/bowlers')}
        accessibilityRole="button" accessibilityLabel={`Current bowler ${athlete?.bowler_id ?? 'none'}. Switch bowler`}>
        <Avatar code={athlete?.bowler_id ?? '—'} />
        <View style={{ flex: 1 }}>
          <Small>{greeting()}</Small>
          <View style={s.rowCenter}>
            <Text style={s.who} numberOfLines={1}>{athlete?.bowler_id ?? 'No bowler'}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.muted} />
          </View>
        </View>
      </Pressable>
      <IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
    </View>
  );

  if (online === false && !athlete) {
    return (
      <Screen safeTop>
        {header}
        <EmptyState icon="cloud-offline-outline" title="Can’t reach CricShield" text={error ?? 'Check your connection and try again.'}
          action="Try again" onAction={refresh} secondary="Connection settings" onSecondary={() => router.push('/settings')} />
      </Screen>
    );
  }

  if (!athlete) {
    return (
      <Screen safeTop>
        {header}
        <EmptyState icon="person-add-outline" title="Set up a bowler" text="Create a bowler profile to start screening their action and workload."
          action="Create bowler profile" onAction={() => router.push({ pathname: '/bowler', params: { mode: 'new' } })} />
      </Screen>
    );
  }

  const risk = snap?.risk ?? null;
  const steps: { done: boolean; title: string; text: string; href: Href; icon: keyof typeof Ionicons.glyphMap }[] = [
    { done: true, title: 'Create bowler profile', text: athleteLine(athlete), href: '/profile', icon: 'person-outline' },
    { done: (snap?.workloads.length ?? 0) > 0, title: 'Log recent bowling sessions', text: snap?.workloads.length ? `${snap.workloads.length} sessions logged` : 'Overs, spells and soreness from the last few weeks', href: '/workload', icon: 'calendar-outline' },
    { done: (snap?.deliveries ?? 0) > 0, title: 'Analyse a delivery video', text: snap?.deliveries ? `${snap.deliveries} deliveries analysed` : 'Film one ball side-on to check the action', href: '/analyse', icon: 'videocam-outline' },
    { done: !!risk, title: 'Check injury risk', text: risk ? `Last checked ${dateText(risk.as_of)}` : 'Combine technique, workload and history', href: '/risk', icon: 'pulse-outline' },
    { done: !!plan, title: 'Get a prevention plan', text: plan ? 'Plan ready' : 'Safe overs, rest and exercises', href: '/plan', icon: 'clipboard-outline' },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  const nextStep = steps.find((x) => !x.done);

  return (
    <Screen safeTop onRefresh={refresh} refreshing={refreshing}>
      {header}

      {online === false && (
        <Banner tone="warn" icon="cloud-offline-outline" title="Offline — showing saved information" action="Try again" onAction={refresh} />
      )}

      {/* ---- risk status ---- */}
      {!snap ? <Loading /> : (
        <Pressable onPress={() => router.push(risk ? '/risk' : (nextStep?.href ?? '/analyse'))} accessibilityRole="button"
          style={({ pressed }) => [s.hero, pressed && { opacity: 0.92 }]}>
          <Text style={s.heroOver}>Injury risk</Text>
          {risk ? (
            <>
              <View style={s.rowCenter}>
                <View style={[s.dot, { backgroundColor: risk.risk_tier ? tierColor[risk.risk_tier] : colors.onNavyMuted }]} />
                <Text style={s.heroTitle}>{risk.risk_tier ? tierLabel[risk.risk_tier] : risk.risk_level}</Text>
              </View>
              <View style={s.heroScoreRow}>
                <Text style={s.heroScore}>{Math.round(risk.risk_score * 100)}</Text>
                <Text style={s.heroOf}>/ 100 risk score</Text>
              </View>
              <View style={s.heroTrack}>
                <View style={[s.heroFill, { width: `${Math.round(risk.risk_score * 100)}%`, backgroundColor: risk.risk_tier ? tierColor[risk.risk_tier] : colors.primary }]} />
              </View>
              {risk.top_factors[0] && (
                <Text style={s.heroText}>Main factor: {risk.top_factors[0].label ?? risk.top_factors[0].feature.replace(/_/g, ' ')}</Text>
              )}
              <View style={s.heroFoot}>
                <Text style={s.heroMeta}>Checked {dateText(risk.as_of)}</Text>
                <Text style={s.heroLink}>View report ›</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={s.heroTitle}>Not checked yet</Text>
              <Text style={s.heroText}>Log a few sessions and analyse one delivery, then CricShield can estimate {athlete.bowler_id}’s injury risk.</Text>
              <View style={s.heroFoot}>
                <Text style={s.heroMeta}>{doneCount} of {steps.length} steps done</Text>
                <Text style={s.heroLink}>{nextStep ? `${nextStep.title} ›` : 'Start ›'}</Text>
              </View>
            </>
          )}
        </Pressable>
      )}

      {/* ---- referral ---- */}
      {plan?.referral.required && (
        <Banner tone="danger" icon="medkit-outline" title={`See a ${plan.referral.to ?? 'physiotherapist'}`} action="Open plan" onAction={() => router.push('/plan')}>
          {plan.referral.reasons.slice(0, 2).map((r) => <Body key={r} muted>{r}</Body>)}
        </Banner>
      )}

      {/* ---- today's limits ---- */}
      {plan && (
        <Section title="Today’s bowling limits" action="Full plan" onAction={() => router.push('/plan')}>
          <View style={s.tiles}>
            <Tile icon="baseball-outline" label="Max overs" value={plan.limits.daily_limit_overs === 0 ? 'Rest' : String(plan.limits.daily_limit_overs)}
              tone={plan.limits.daily_limit_overs === 0 ? 'danger' : 'neutral'} caption="today" />
            <Tile icon="repeat-outline" label="Max spell" value={plan.limits.spell_cap_overs === 0 ? '—' : `${plan.limits.spell_cap_overs} ov`} caption="in a row" />
          </View>
          <View style={s.restRow}>
            <Ionicons name="bed-outline" size={18} color={colors.ok} />
            <Text style={s.restText}>{plan.limits.rest_window}</Text>
          </View>
        </Section>
      )}

      {/* ---- guided steps ---- */}
      {snap && doneCount < steps.length && (
        <Section title="Next steps">
          <View style={s.card}>
            <View style={{ gap: 6, padding: 16, paddingBottom: 8 }}>
              <Small>{doneCount} of {steps.length} complete</Small>
              <ProgressBar value={doneCount / steps.length} />
            </View>
            {steps.map((x, i) => (
              <Pressable key={x.title} onPress={() => router.push(x.href)} accessibilityRole="button"
                accessibilityLabel={`${x.title}${x.done ? ', done' : ''}`}
                style={({ pressed }) => [s.step, i < steps.length - 1 && s.stepBorder, pressed && { backgroundColor: colors.surfaceAlt }]}>
                <View style={[s.check, x.done && s.checkOn, !x.done && x === nextStep && s.checkNext]}>
                  {x.done ? <Ionicons name="checkmark" size={16} color={colors.onPrimary} /> : <Ionicons name={x.icon} size={15} color={x === nextStep ? colors.primary : colors.muted} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.stepTitle, x.done && { color: colors.muted }]}>{x.title}</Text>
                  <Small>{x.text}</Small>
                </View>
                {!x.done && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
              </Pressable>
            ))}
          </View>
        </Section>
      )}

      {/* ---- quick actions ---- */}
      <Section title="Quick actions">
        <View style={s.grid}>
          <Action icon="videocam" label="Analyse a delivery" onPress={() => router.push('/analyse')} primary />
          <Action icon="add-circle-outline" label="Log a session" onPress={() => router.push('/workload')} />
          <Action icon="pulse-outline" label="Check injury risk" onPress={() => router.push('/risk')} />
          <Action icon="clipboard-outline" label="Prevention plan" onPress={() => router.push('/plan')} />
        </View>
      </Section>

      {/* ---- workload snapshot ---- */}
      {plan && (
        <Pressable onPress={() => router.push('/workload')} accessibilityRole="button" style={({ pressed }) => [s.card, s.workload, pressed && { opacity: 0.85 }]}>
          <View style={[s.wlIcon]}><Ionicons name="stats-chart" size={20} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.stepTitle}>Workload this week</Text>
            <Small>{plan.metrics.acute_overs} overs in 7 days · weekly average {plan.metrics.chronic_weekly_overs}</Small>
          </View>
          <AcwrChip value={plan.metrics.acwr} />
        </Pressable>
      )}

      <Text style={[t.small, { textAlign: 'center', marginTop: 4 }]}>Screening and decision support only — not a medical diagnosis.</Text>
    </Screen>
  );
}

function Action({ icon, label, onPress, primary }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.action, primary && s.actionPrimary, pressed && { opacity: 0.85 }]}>
      <View style={[s.actionIcon, primary && { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
        <Ionicons name={icon} size={22} color={primary ? colors.onPrimary : colors.primary} />
      </View>
      <Text style={[s.actionText, primary && { color: colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

function AcwrChip({ value }: { value: number | null }) {
  const [label, fg, bg] = value == null ? ['Building up', colors.muted, colors.surfaceAlt]
    : value > 1.5 ? ['Spike', colors.danger, colors.dangerSoft]
      : value > 1.3 || value < 0.8 ? ['Watch', colors.warn, colors.warnSoft]
        : ['Safe zone', colors.ok, colors.okSoft];
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      <Text style={[s.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switcher: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  who: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hero: { backgroundColor: colors.navy, borderRadius: radius.xl, padding: 20, gap: 8 },
  heroOver: { color: colors.onNavyMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  heroTitle: { color: colors.onNavy, fontSize: 24, fontWeight: '800' },
  heroScoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  heroScore: { color: colors.onNavy, fontSize: 48, fontWeight: '800', lineHeight: 52 },
  heroOf: { color: colors.onNavyMuted, fontSize: 14, marginBottom: 8 },
  heroTrack: { height: 8, borderRadius: 4, backgroundColor: colors.navySoft, overflow: 'hidden' },
  heroFill: { height: 8, borderRadius: 4 },
  heroText: { color: colors.onNavyMuted, fontSize: 15, lineHeight: 22 },
  heroFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  heroMeta: { color: colors.onNavyMuted, fontSize: 13 },
  heroLink: { color: colors.onNavy, fontSize: 14, fontWeight: '700' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  tiles: { flexDirection: 'row', gap: 10 },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.okSoft, borderRadius: radius.md, padding: 12 },
  restText: { color: colors.ok, fontWeight: '600', fontSize: 14, flex: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 60 },
  stepBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  check: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.ok, borderColor: colors.ok },
  checkNext: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  stepTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, minHeight: 104 },
  actionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  workload: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  wlIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '700' },
});
