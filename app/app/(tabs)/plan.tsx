// Prevention plan (C4 - Rathnayaka): bowling limits, referral, and actions grouped by type,
// each with a "why". Uses the app-wide current bowler.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Category, Recommendation } from '../../src/c4/types';
import { useApp } from '../../src/state/AppContext';
import { Banner, Body, Button, Card, EmptyState, List, ListItem, Loading, Screen, Section, Small, TierBadge, Tile } from '../../src/ui/components';
import { categoryMeta, colors, radius, tierColor, tierSoft, type as t } from '../../src/ui/theme';

const ORDER: Category[] = ['rehabilitation', 'workload', 'training', 'recovery', 'preventive_exercise'];

export default function PlanScreen() {
  const router = useRouter();
  const { athlete, plan, planIsCached, planLoading, planError, online, generatePlan } = useApp();

  const subtitle = athlete ? `${athlete.bowler_id}${plan ? ` · updated ${new Date(plan.generated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}` : undefined;

  if (!athlete) {
    return <Screen title="Prevention plan"><EmptyState icon="person-add-outline" title="Set up a bowler first" text="Plans are made for one bowler at a time." action="Create bowler profile" onAction={() => router.push({ pathname: '/bowler', params: { mode: 'new' } })} /></Screen>;
  }

  const update = <Button title={plan ? 'Update plan' : 'Create prevention plan'} icon="refresh" onPress={generatePlan} loading={planLoading} />;

  if (!plan) {
    return (
      <Screen title="Prevention plan" subtitle={subtitle} footer={update}>
        {planLoading ? <Loading text="Building the plan…" /> : (
          <EmptyState icon="clipboard-outline" title="No plan yet"
            text={`Get safe daily overs, spell limits, rest days and exercises for ${athlete.bowler_id}. It uses the latest risk check, workload log and injury history.`} />
        )}
        {planError && <Banner tone="danger" icon="alert-circle-outline" title="Could not create the plan"><Body muted>{planError}</Body></Banner>}
      </Screen>
    );
  }

  const grouped = ORDER.map((c) => ({ c, recs: plan.recommendations.filter((r) => r.category === c) })).filter((g) => g.recs.length);
  const stop = plan.limits.daily_limit_overs === 0;

  return (
    <Screen title="Prevention plan" subtitle={subtitle} footer={update}>
      {planIsCached && online === false && (
        <Banner tone="warn" icon="cloud-offline-outline" title="Offline — showing the last saved plan" />
      )}
      {planError && <Banner tone="danger" icon="alert-circle-outline" title="Could not update the plan"><Body muted>{planError}</Body></Banner>}

      {/* ---- summary ---- */}
      <View style={[s.hero, { backgroundColor: tierSoft[plan.risk_tier] }]}>
        <View style={s.between}>
          <TierBadge tier={plan.risk_tier} />
          {plan.risk_score != null && <Text style={[s.score, { color: tierColor[plan.risk_tier] }]}>{Math.round(plan.risk_score * 100)}<Text style={s.scoreOf}> / 100</Text></Text>}
        </View>
        <Text style={s.summary}>{plan.summary}</Text>
        <Small>{plan.risk_source === 'c3' ? 'Based on the latest risk check, workload and history.' : 'No risk check yet — based on workload guidelines and history.'}</Small>
        {plan.risk_source !== 'c3' && <Button title="Check injury risk" size="sm" variant="secondary" icon="pulse-outline" onPress={() => router.push('/risk')} style={{ alignSelf: 'flex-start' }} />}
      </View>

      {plan.referral.required && (
        <Banner tone="danger" icon="medkit-outline" title={`See a ${plan.referral.to ?? 'physiotherapist'} before bowling hard again`}>
          {plan.referral.reasons.map((r) => <Body key={r} muted>• {r}</Body>)}
        </Banner>
      )}

      {/* ---- limits ---- */}
      <Section title="Bowling limits">
        <View style={s.tiles}>
          <Tile icon="baseball-outline" label="Per day" value={stop ? 'No bowling' : `${plan.limits.daily_limit_overs} overs`} tone={stop ? 'danger' : 'neutral'} />
          <Tile icon="repeat-outline" label="Per spell" value={plan.limits.spell_cap_overs === 0 ? '—' : `${plan.limits.spell_cap_overs} overs`} tone={stop ? 'danger' : 'neutral'} />
        </View>
        <View style={s.tiles}>
          <Tile icon="calendar-outline" label="Days a week" value={`${plan.limits.max_bowling_days_per_week} max`} />
          <Tile icon="speedometer-outline" label="Workload ratio" value={plan.metrics.acwr != null ? String(plan.metrics.acwr) : '—'}
            tone={plan.metrics.acwr != null && plan.metrics.acwr > 1.5 ? 'danger' : plan.metrics.acwr != null && (plan.metrics.acwr > 1.3 || plan.metrics.acwr < 0.8) ? 'warn' : 'neutral'}
            caption="0.8–1.3 is safest" />
        </View>
        <View style={s.rest}>
          <Ionicons name="bed-outline" size={18} color={colors.ok} />
          <Text style={s.restText}>{plan.limits.rest_window}</Text>
        </View>
      </Section>

      {/* ---- actions ---- */}
      {grouped.map(({ c, recs }) => (
        <Section key={c} title={categoryMeta[c].label}>
          {recs.map((r) => <RecCard key={r.rule_id} rec={r} onPress={() => router.push({ pathname: '/why/[ruleId]', params: { ruleId: r.rule_id } })} />)}
        </Section>
      ))}

      {plan.data_quality.length > 0 && (
        <Card>
          <Text style={t.overline}>Data notes</Text>
          {plan.data_quality.map((n) => <Small key={n}>• {n}</Small>)}
        </Card>
      )}

      <Section title="More">
        <List>
          <ListItem icon="calendar-outline" title="Workload log" subtitle={`${plan.metrics.acute_overs} overs in the last 7 days`} onPress={() => router.push('/workload')} />
          <ListItem icon="time-outline" title="Plan history" subtitle="Earlier plans and their feedback" onPress={() => router.push('/plan-history')} />
          <ListItem icon="chatbox-ellipses-outline" title="Coach or physio review" subtitle="Accept, change or reject this plan" onPress={() => router.push('/feedback')} last />
        </List>
      </Section>
      <Small style={{ textAlign: 'center' }}>Rules engine {plan.engine_version} · decision support, not a diagnosis</Small>
    </Screen>
  );
}

function RecCard({ rec, onPress }: { rec: Recommendation; onPress: () => void }) {
  const meta = categoryMeta[rec.category];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Shows why this was recommended"
      style={({ pressed }) => [s.rec, pressed && { opacity: 0.85 }]}>
      <View style={[s.recIcon, { backgroundColor: `${meta.color}14` }]}>
        <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={20} color={meta.color} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={s.recTitle}>{rec.title}</Text>
        <Text style={s.recAction}>{rec.action}</Text>
        {rec.exercises.map((e) => (
          <View key={e.name} style={s.exercise}>
            <Ionicons name="barbell-outline" size={14} color={colors.muted} />
            <Text style={s.exerciseText}><Text style={{ fontWeight: '700', color: colors.textSoft }}>{e.name}</Text> · {e.dose}</Text>
          </View>
        ))}
        <Text style={s.why}>Why this? ›</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 18, gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  score: { fontSize: 28, fontWeight: '800' },
  scoreOf: { fontSize: 14, fontWeight: '600', color: colors.muted },
  summary: { color: colors.text, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  tiles: { flexDirection: 'row', gap: 10 },
  rest: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.okSoft, borderRadius: radius.md, padding: 12 },
  restText: { color: colors.ok, fontWeight: '600', fontSize: 14, flex: 1 },
  rec: { flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: 16 },
  recIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  recTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  recAction: { color: colors.textSoft, fontSize: 15, lineHeight: 21 },
  exercise: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  exerciseText: { color: colors.muted, fontSize: 13, flex: 1 },
  why: { color: colors.primary, fontSize: 14, fontWeight: '700', marginTop: 4 },
});
