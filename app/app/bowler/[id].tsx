// Bowler profile: latest risk, new analysis, quick workload log, workload vs usual, risk history,
// analysed deliveries and prevention plans. Reads members' APIs only; links to their full screens.
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { c4 } from '../../src/api/c4';
import { c3 } from '../../src/api/risk';
import type { HistoryItem } from '../../src/c3/types';
import type { PreventionPlan, Upstream, Workload } from '../../src/c4/types';
import { PACE_LABEL, useApp } from '../../src/shell/AppContext';
import { openAnalysis, openPlan, openRisk } from '../../src/shell/links';
import { QuickLogCard } from '../../src/shell/QuickLogCard';
import { RiskHistoryChart } from '../../src/shell/RiskHistoryChart';
import { ageOf, ago, levelOf, useSquad } from '../../src/shell/squad';
import { WorkloadCard } from '../../src/shell/WorkloadCard';
import {
  alpha, Avatar, Card, color, COMPONENT, ComponentBadge, EmptyState, ErrorBanner, font, GradientHeader, IconButton, MetricTile,
  PrimaryButton, radius, RISK, RiskBadge, RiskGauge, Screen, SecondaryButton, Skeleton, sp, Tag, toRiskLevel,
} from '../../src/ui';

type Data = { history: HistoryItem[] | null; inbox: Upstream | null; workloads: Workload[]; plans: PreventionPlan[] };

function Section({ title, component, action }: { title: string; component?: 'c1' | 'c2' | 'c3' | 'c4'; action?: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.h2}>{title}</Text>
      {component && <ComponentBadge component={component} compact />}
      <View style={{ flex: 1 }} />
      {action}
    </View>
  );
}

export default function BowlerProfile() {
  const router = useRouter();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const { byId, loading: squadLoading, refresh: refreshSquad } = useSquad();
  const { extras } = useApp();
  const row = byId(id);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [workloads, plans, inbox, history] = await Promise.all([
        c4.workloads(id), c4.plans(id),
        c4.upstream(id).catch(() => null),
        c3.history(id).then((h) => { setRiskError(null); return h; }, (e: Error) => { setRiskError(e.message); return null; }),
      ]);
      plans.sort((a, b) => b.generated_at.localeCompare(a.generated_at));
      setData({ workloads, plans, inbox, history });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  const reload = useCallback(async () => { await Promise.all([load(), refreshSquad()]); }, [load, refreshSquad]);

  async function generate() {
    setGenerating(true);
    try { await c4.generatePlan(id); await load(); } catch (e) { setError((e as Error).message); } finally { setGenerating(false); }
  }

  if (!row) {
    return (
      <Screen>
        {squadLoading ? <Skeleton height={160} round={20} />
          : <EmptyState icon="help-circle" title="Bowler not found" text="Pull to refresh the squad, or go back." actionTitle="Back to squad" onAction={() => router.back()} />}
      </Screen>
    );
  }

  const a = row.athlete;
  const latest = data?.history?.[0] ?? row.latest;
  const level = levelOf(latest);
  const hue = level ? RISK[level].color : undefined;
  const ex = extras[a.id];
  const plan = data?.plans[0] ?? null;
  const planLevel = plan ? toRiskLevel(plan.risk_tier) : null;
  const c2rows = data?.inbox?.c2 ?? [];

  return (
    <Screen onRefresh={reload}>
      <Stack.Screen options={{
        title: a.bowler_id,
        headerRight: () => <IconButton icon="create-outline" label={`Edit ${a.bowler_id}`} onPress={() => router.push({ pathname: '/bowler/edit', params: { id: String(a.id) } })} />,
      }} />

      <GradientHeader title={a.bowler_id} tint={hue}
        subtitle={`Age ${ageOf(a.birth_year)} · ${a.playing_level[0].toUpperCase()}${a.playing_level.slice(1)} · ${a.dominant_arm === 'left' ? 'Left' : 'Right'}-arm`}
        right={<Avatar code={a.bowler_id} risk={level} size={56} />}>
        <View style={s.tags}>
          {row.demo && <Tag label="Demo" />}
          {a.injury_history.length > 0 && <Tag label={`${a.injury_history.length} past injur${a.injury_history.length === 1 ? 'y' : 'ies'}`} icon="bandage-outline" tint={RISK.moderate.color} />}
          {ex?.pace && <Tag label={PACE_LABEL[ex.pace]} icon="speedometer-outline" />}
          {ex?.soreness != null && <Tag label={`Soreness ${ex.soreness}/10`} icon="thermometer-outline" />}
        </View>
      </GradientHeader>

      {error && <ErrorBanner title="Can't reach the team computer" message={error} onRetry={load} />}

      {/* Latest risk */}
      <Card variant={level ? 'glow' : 'plain'} accent={hue}>
        <Section title="Latest risk" component="c3" action={latest ? <Text style={s.meta}>{ago(latest.created_at)}</Text> : null} />
        {!data && !error ? <Skeleton height={180} />
          : riskError && !latest ? <Text style={s.muted}>The risk model (C3) is not reachable: {riskError}</Text>
          : latest && level ? (
            <>
              <RiskGauge score={latest.risk_score * 100} level={level} size={240} />
              {latest.top_factors.length > 0 && (
                <Text style={s.muted}>Main drivers: {latest.top_factors.slice(0, 3).map((f) => f.label ?? f.feature).join(', ')}</Text>
              )}
              <SecondaryButton title="Why this score?" icon="pulse-outline" tint={COMPONENT.c3.color} onPress={() => openRisk(router, a.id)} />
            </>
          ) : (
            <EmptyState icon="pulse" tint={COMPONENT.c3.color} title="No risk assessment yet"
              text="Analyse a delivery and log workload, then run the risk model." />
          )}
      </Card>

      <PrimaryButton title="▶  New analysis" onPress={() => openAnalysis(router, a.id)} style={{ minHeight: 64 }} />

      <QuickLogCard athleteId={a.id} onLogged={reload} />

      {/* Workload */}
      <Card>
        <Section title="Workload" component="c4" action={<SecondaryButton title="Log" icon="list" onPress={() => openPlan(router, a.id, 'workload')} style={s.smallBtn} />} />
        {data ? <WorkloadCard workloads={data.workloads} plan={plan} /> : <Skeleton height={150} />}
      </Card>

      {/* Risk history */}
      <Card>
        <Section title="Risk history" component="c3" />
        {!data ? <Skeleton height={130} />
          : data.history ? <RiskHistoryChart items={data.history} />
          : <Text style={s.muted}>Not available right now.</Text>}
      </Card>

      {/* Analysed deliveries */}
      <Card>
        <Section title="Analysed deliveries" component="c2" action={<Text style={s.meta}>{c2rows.length}</Text>} />
        {!data ? <Skeleton height={60} />
          : c2rows.length === 0 ? <Text style={s.muted}>None yet. Use New analysis and send the result to this bowler.</Text>
          : c2rows.slice().reverse().map((r) => {
            const feats = Object.values(r.features);
            const over = feats.filter((f) => f.breach).length;
            const unreliable = feats.filter((f) => f.reliable === false).length;
            return (
              <View key={r.video_id} style={s.delivery}>
                <Ionicons name="film-outline" size={20} color={COMPONENT.c2.color} />
                <Text style={s.deliveryName} numberOfLines={1}>{r.video_id}</Text>
                {over > 0 ? <Tag label={`${over} over limit`} icon="alert-circle" tint={RISK.critical.text} /> : <Tag label="Within limits" icon="checkmark-circle" tint={RISK.low.color} />}
                {unreliable > 0 && <Tag label={`${unreliable} unreliable`} />}
              </View>
            );
          })}
      </Card>

      {/* Latest plan */}
      <Card variant="glow" accent={COMPONENT.c4.color}>
        <Section title="Prevention plan" component="c4" action={plan ? <Text style={s.meta}>{ago(plan.generated_at)}</Text> : null} />
        {!data ? <Skeleton height={120} />
          : !plan ? (
            <EmptyState icon="clipboard" tint={COMPONENT.c4.color} title="No plan yet" text="Generate a plan from the latest workload and risk."
              actionTitle={generating ? 'Generating…' : 'Generate plan'} onAction={generate} />
          ) : (
            <Pressable onPress={() => openPlan(router, a.id)} accessibilityRole="button" accessibilityLabel="Open the prevention plan" style={{ gap: sp(1.5) }}>
              {planLevel && <RiskBadge level={planLevel} />}
              <Text style={s.body}>{plan.summary}</Text>
              <View style={s.tiles}>
                <MetricTile label="Daily limit" value={plan.limits.daily_limit_overs} unit="ov" />
                <MetricTile label="Spell cap" value={plan.limits.spell_cap_overs} unit="ov" />
                <MetricTile label="Days / week" value={plan.limits.max_bowling_days_per_week} />
              </View>
              {plan.referral.required && (
                <View style={s.referral}>
                  <Ionicons name="medkit" size={20} color={RISK.critical.text} />
                  <Text style={s.referralText}>Physio referral recommended{plan.referral.to ? ` (${plan.referral.to})` : ''}.</Text>
                </View>
              )}
              <View style={s.openRow}>
                <Text style={[s.open, { color: COMPONENT.c4.color }]}>Open plan · {plan.recommendations.length} actions</Text>
                <Ionicons name="chevron-forward" size={18} color={COMPONENT.c4.color} />
              </View>
            </Pressable>
          )}
      </Card>

      {/* Plan history */}
      {data && data.plans.length > 1 && (
        <Card>
          <Section title="Plan history" action={<SecondaryButton title="All" onPress={() => openPlan(router, a.id, 'history')} style={s.smallBtn} />} />
          {data.plans.slice(1, 6).map((p) => {
            const l = toRiskLevel(p.risk_tier);
            return (
              <View key={p.id ?? p.generated_at} style={s.planRow}>
                <Text style={s.planDate}>{new Date(p.generated_at).toLocaleDateString()}</Text>
                {l && <RiskBadge level={l} size="sm" suffix="" />}
                <Text style={s.planSummary} numberOfLines={1}>{p.summary}</Text>
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  section: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  h2: { ...font.h2, color: color.text },
  meta: { ...font.caption, color: color.muted },
  muted: { ...font.body, color: color.muted },
  body: { ...font.body, color: color.text },
  smallBtn: { minHeight: 40 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1) },
  delivery: { flexDirection: 'row', alignItems: 'center', gap: sp(1), flexWrap: 'wrap', paddingVertical: 4 },
  deliveryName: { ...font.body, color: color.text, flex: 1, minWidth: 120 },
  referral: { flexDirection: 'row', alignItems: 'center', gap: sp(1), backgroundColor: alpha(RISK.critical.color, 0.1), borderRadius: radius.button, padding: sp(1.5) },
  referralText: { ...font.body, color: color.text, flex: 1, fontWeight: '600' },
  openRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  open: { ...font.body, fontWeight: '800' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  planDate: { ...font.caption, color: color.muted, width: 76 },
  planSummary: { ...font.caption, color: color.text, flex: 1 },
});
