// C4 key function 2 - recommendation dashboard (Proposal Fig. 4.3.4.1 "Prevention plan").
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useC4 } from '../../src/c4/C4Context';
import { categoryMeta, colors, tierColor } from '../../src/c4/theme';
import type { Category, Recommendation } from '../../src/c4/types';
import { Banner, Body, Button, Card, Chips, H, Loading, Row, Screen, TierBadge, Tile } from '../../src/c4/ui';

const ORDER: Category[] = ['rehabilitation', 'training', 'workload', 'recovery', 'preventive_exercise'];

export default function PlanDashboard() {
  const router = useRouter();
  const { athletes, athlete, plan, planIsCached, loading, online, error, selectAthlete, generatePlan, refreshAthletes } = useC4();

  if (online === null) return <Screen><Loading text="Connecting to the C4 engine…" /></Screen>;

  if (online === false && !plan) {
    return (
      <Screen>
        <Banner tone="danger" icon="cloud-offline-outline" title="Engine not reachable">
          <Body muted>{error}</Body>
        </Banner>
        <Button title="Try again" icon="refresh" onPress={refreshAthletes} />
        <Button title="Server settings" variant="secondary" icon="settings-outline" onPress={() => router.push('/plan/profile')} />
      </Screen>
    );
  }

  const grouped = ORDER.map((c) => ({ c, recs: plan?.recommendations.filter((r) => r.category === c) ?? [] }))
    .filter((g) => g.recs.length);
  const hot = plan && (plan.risk_tier === 'High' || plan.risk_tier === 'Critical');

  return (
    <Screen>
      {athletes.length > 0 && (
        <Chips label="Bowler" value={athlete?.id ?? null} onChange={selectAthlete}
          options={athletes.map((a) => ({ label: a.bowler_id, value: a.id }))} />
      )}

      {planIsCached && (
        <Banner tone="info" icon="time-outline" title="Showing the last saved plan">
          <Body muted>Generate a new plan to include the latest workload and C3 results.</Body>
        </Banner>
      )}
      {error && online === false && plan && (
        <Banner tone="warn" icon="cloud-offline-outline" title="Offline - showing saved plan"><Body muted>{error}</Body></Banner>
      )}

      <Button title={plan ? 'Generate new plan' : 'Generate prevention plan'} icon="sparkles-outline"
        onPress={generatePlan} loading={loading} disabled={!athlete} />

      {!plan ? (
        <Card><Body muted>No plan yet for {athlete?.bowler_id ?? 'this bowler'}. Generate one to see limits, actions and reasons.</Body></Card>
      ) : (
        <>
          <Card style={{ borderColor: tierColor[plan.risk_tier] }}>
            <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={s.code}>{plan.bowler_id} · {plan.metrics.age_group}</Text>
              <TierBadge tier={plan.risk_tier} />
            </Row>
            <Text style={[s.score, { color: tierColor[plan.risk_tier] }]}>
              {plan.risk_score != null ? `${Math.round(plan.risk_score * 100)}%` : '—'}
              <Text style={s.scoreLabel}>  {plan.risk_source === 'c3' ? 'predicted injury risk (C3)' : 'C3 unavailable - guideline estimate'}</Text>
            </Text>
            <Body>{plan.summary}</Body>
          </Card>

          {plan.referral.required && (
            <Banner tone="danger" icon="medkit-outline" title={`Refer to ${plan.referral.to}`}>
              {plan.referral.reasons.map((r) => <Body key={r} muted>• {r}</Body>)}
            </Banner>
          )}

          <Row>
            <Tile label="Daily limit" value={plan.limits.daily_limit_overs === 0 ? 'No bowling' : `${plan.limits.daily_limit_overs} overs`} tone={hot ? 'danger' : 'neutral'} />
            <Tile label="Spell cap" value={plan.limits.spell_cap_overs === 0 ? '—' : `${plan.limits.spell_cap_overs} overs`} tone={hot ? 'danger' : 'neutral'} />
            <Tile label="Rest window" value={plan.limits.rest_window} tone="ok" wide />
          </Row>

          <Row>
            <NavPill icon="stats-chart-outline" label={`Workload · ACWR ${plan.metrics.acwr ?? '—'}`} onPress={() => router.push('/plan/workload')} />
            <NavPill icon="person-outline" label="Profile & inputs" onPress={() => router.push('/plan/profile')} />
            <NavPill icon="time-outline" label="History" onPress={() => router.push('/plan/history')} />
          </Row>

          {grouped.map(({ c, recs }) => (
            <View key={c} style={{ gap: 10 }}>
              <H>{categoryMeta[c].label}</H>
              {recs.map((r) => <RecCard key={r.rule_id} rec={r} onPress={() => router.push(`/plan/why/${r.rule_id}`)} />)}
            </View>
          ))}

          {plan.data_quality.length > 0 && (
            <Card>
              <Text style={s.small}>DATA NOTES</Text>
              {plan.data_quality.map((n) => <Text key={n} style={s.note}>• {n}</Text>)}
            </Card>
          )}

          <Button title="Coach / physio feedback on this plan" variant="secondary" icon="chatbox-ellipses-outline"
            onPress={() => router.push('/plan/feedback')} disabled={!plan.id} />
          <Text style={s.footer}>Engine {plan.engine_version} · generated in {plan.latency_ms} ms · {new Date(plan.generated_at).toLocaleString()}</Text>
        </>
      )}
    </Screen>
  );
}

function RecCard({ rec, onPress }: { rec: Recommendation; onPress: () => void }) {
  const meta = categoryMeta[rec.category];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Shows why this was recommended"
      style={({ pressed }) => [s.rec, pressed && { opacity: 0.75 }]}>
      <View style={[s.recIcon, { backgroundColor: `${meta.color}22` }]}>
        <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={20} color={meta.color} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={s.recTitle}>{rec.title}</Text>
        <Text style={s.recAction}>{rec.action}</Text>
        {rec.exercises.map((e) => (
          <Text key={e.name} style={s.exercise}>• {e.name} — {e.dose}</Text>
        ))}
        <Text style={s.why}>Why? ›</Text>
      </View>
    </Pressable>
  );
}

function NavPill({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.pill, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={16} color={colors.accent} />
      <Text style={s.pillText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  code: { color: colors.text, fontSize: 16, fontWeight: '700' },
  score: { fontSize: 34, fontWeight: '700' },
  scoreLabel: { fontSize: 13, fontWeight: '400', color: colors.muted },
  rec: { flexDirection: 'row', gap: 12, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14 },
  recIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  recAction: { color: colors.text, fontSize: 14, lineHeight: 20, opacity: 0.92 },
  exercise: { color: colors.muted, fontSize: 13 },
  why: { color: colors.accent, fontSize: 13, fontWeight: '700', marginTop: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, minHeight: 40 },
  pillText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  small: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  footer: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
