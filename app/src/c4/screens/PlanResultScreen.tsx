// C4 (Rashmi) - full prevention plan for one result: referral, workload limits, action cards
// (category icon, why, source) and coach / physio feedback. Plan content comes from the engine as-is;
// categories, colours and the feedback payload are the same as app/plan/index.tsx and app/plan/feedback.tsx.
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { c4 } from '../../api/c4';
import {
  alpha, Card, ChipGroup, color, COMPONENT, ErrorBanner, font, MetricTile, PrimaryButton, radius, RISK, SegmentedControl, sp,
  TextField, toRiskLevel,
} from '../../ui';
import { categoryMeta } from '../theme';
import type { Category, FeedbackInput, PreventionPlan, Recommendation } from '../types';
import { TierBadge } from '../ui';

const ORDER: Category[] = ['rehabilitation', 'training', 'workload', 'recovery', 'preventive_exercise'];

function ActionCard({ rec }: { rec: Recommendation }) {
  const [open, setOpen] = useState(false);
  const meta = categoryMeta[rec.category];
  return (
    <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
      style={({ pressed }) => [s.rec, { borderColor: alpha(meta.color, 0.45) }, pressed && { opacity: 0.85 }]}>
      <View style={[s.recIcon, { backgroundColor: alpha(meta.color, 0.16) }]}>
        <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={22} color={meta.color} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[s.cat, { color: meta.color }]}>{meta.label}</Text>
        <Text style={s.recTitle}>{rec.title}</Text>
        <Text style={s.body}>{rec.action}</Text>
        {rec.exercises.map((e) => <Text key={e.name} style={s.muted}>• {e.name} — {e.dose}</Text>)}
        {open ? (
          <View style={{ gap: 4, marginTop: 4 }}>
            <Text style={s.label}>WHY</Text>
            <Text style={s.body}>{rec.explanation}</Text>
            {rec.evidence.length > 0 && <Text style={s.label}>SOURCE</Text>}
            {rec.evidence.map((e) => <Text key={e} style={s.muted}>• {e}</Text>)}
          </View>
        ) : (
          <Text style={[s.why, { color: meta.color }]}>Why? ›</Text>
        )}
      </View>
    </Pressable>
  );
}

function FeedbackCard({ plan, reviewer }: { plan: PreventionPlan; reviewer?: string }) {
  const [f, setF] = useState<FeedbackInput>({ reviewer: reviewer ?? '', role: 'coach', decision: 'accept', usefulness: 4, rule_id: null, comment: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<FeedbackInput>) => setF((x) => ({ ...x, ...p }));
  const tint = COMPONENT.c4.color;

  async function submit() {
    if (!plan.id) return;
    setBusy(true);
    setErr(null);
    try {
      await c4.addFeedback(plan.id, { ...f, modified_action: f.decision === 'modify' ? f.modified_action : null });
      setDone(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card>
        <View style={s.head}><Ionicons name="checkmark-circle" size={20} color={RISK.low.color} /><Text style={s.h2}>Feedback saved</Text></View>
        <Text style={s.muted}>It is stored with this plan for the validation study.</Text>
      </Card>
    );
  }
  return (
    <Card>
      <Text style={s.h2}>Coach / physio feedback</Text>
      <SegmentedControl value={f.decision} onChange={(v) => set({ decision: v })} tint={tint}
        options={[{ value: 'accept', label: 'Accept', icon: 'checkmark' }, { value: 'modify', label: 'Modify', icon: 'create-outline' }, { value: 'reject', label: 'Reject', icon: 'close' }]} />
      {f.decision === 'modify' && (
        <TextField label="What should it say instead?" value={f.modified_action ?? ''} onChangeText={(t) => set({ modified_action: t })} multiline />
      )}
      <ChipGroup label="How useful is this plan? (1 not useful – 5 very useful)" value={f.usefulness ?? null} tint={tint}
        onChange={(v) => set({ usefulness: v })} options={[1, 2, 3, 4, 5]} />
      <ChipGroup label="Role" value={f.role} tint={tint} onChange={(v) => set({ role: v })}
        options={[{ value: 'coach', label: 'Coach' }, { value: 'physiotherapist', label: 'Physiotherapist' }, { value: 'sports_scientist', label: 'Sports scientist' }]} />
      <TextField label="Your name" value={f.reviewer} onChangeText={(t) => set({ reviewer: t })} />
      <TextField label="Comment (optional)" value={f.comment} onChangeText={(t) => set({ comment: t })} multiline />
      {err && <ErrorBanner title="Could not save" message={err} />}
      <PrimaryButton title="Submit feedback" icon="send" tint={tint} onPress={submit} loading={busy} disabled={!plan.id || !f.reviewer.trim()} />
    </Card>
  );
}

export function PlanResultScreen({ plan, reviewer }: { plan: PreventionPlan; reviewer?: string }) {
  const level = toRiskLevel(plan.risk_tier);
  const groups = ORDER.map((c) => ({ c, recs: plan.recommendations.filter((r) => r.category === c) })).filter((g) => g.recs.length);
  const m = plan.metrics;

  return (
    <View style={{ gap: sp(2) }}>
      <Card variant="glow" accent={level ? RISK[level].color : COMPONENT.c4.color}>
        <View style={s.rowBetween}>
          <Text style={s.h2}>{plan.bowler_id} · {m.age_group}</Text>
          <TierBadge tier={plan.risk_tier} />
        </View>
        <Text style={s.body}>{plan.summary}</Text>
        <Text style={s.muted}>{plan.risk_source === 'c3' ? 'Based on the C3 risk score.' : 'C3 unavailable - guideline estimate.'}</Text>
      </Card>

      {plan.referral.required && (
        <View style={s.referral} accessibilityRole="alert">
          <View style={s.head}>
            <Ionicons name="medkit" size={22} color={RISK.critical.text} />
            <Text style={[s.h2, { color: RISK.critical.text, flex: 1 }]}>Refer to {plan.referral.to ?? 'a physiotherapist'}</Text>
          </View>
          {plan.referral.reasons.map((r) => <Text key={r} style={s.body}>• {r}</Text>)}
        </View>
      )}

      <Card>
        <Text style={s.h2}>This week's workload</Text>
        <View style={s.tiles}>
          <MetricTile label="Daily limit" value={plan.limits.daily_limit_overs === 0 ? 'No bowling' : plan.limits.daily_limit_overs} unit={plan.limits.daily_limit_overs === 0 ? undefined : 'ov'} icon="speedometer-outline" />
          <MetricTile label="Spell cap" value={plan.limits.spell_cap_overs === 0 ? '—' : plan.limits.spell_cap_overs} unit={plan.limits.spell_cap_overs === 0 ? undefined : 'ov'} icon="timer-outline" />
          <MetricTile label="Bowling days" value={plan.limits.max_bowling_days_per_week} unit="/ week" icon="calendar-outline" />
        </View>
        <Text style={s.muted}>Rest: {plan.limits.rest_window}</Text>
        <Text style={s.muted}>Last 7 days {m.acute_overs} overs · usual week {m.chronic_weekly_overs} overs · ACWR {m.acwr ?? '—'}</Text>
      </Card>

      <Text style={s.h2}>Priority actions</Text>
      {groups.length === 0 && <Text style={s.muted}>No actions in this plan.</Text>}
      {groups.map(({ c, recs }) => recs.map((r) => <ActionCard key={`${c}-${r.rule_id}`} rec={r} />))}

      {plan.data_quality.length > 0 && (
        <Card>
          <Text style={s.label}>DATA NOTES</Text>
          {plan.data_quality.map((n) => <Text key={n} style={s.muted}>• {n}</Text>)}
        </Card>
      )}

      <FeedbackCard plan={plan} reviewer={reviewer} />
      <Text style={s.footer}>Engine {plan.engine_version} · {new Date(plan.generated_at).toLocaleString()}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  h2: { ...font.h2, color: color.text },
  body: { ...font.body, color: color.text },
  muted: { ...font.body, color: color.muted },
  label: { ...font.caption, color: color.muted, fontWeight: '800', letterSpacing: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp(1) },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1) },
  referral: { borderWidth: 1, borderColor: alpha(RISK.critical.color, 0.6), backgroundColor: alpha(RISK.critical.color, 0.1), borderRadius: radius.card, padding: sp(2), gap: sp(1) },
  rec: { flexDirection: 'row', gap: sp(1.5), backgroundColor: color.surface, borderWidth: 1, borderRadius: radius.card, padding: sp(2) },
  recIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cat: { ...font.caption, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  recTitle: { ...font.h2, color: color.text },
  why: { ...font.body, fontWeight: '700', marginTop: 2 },
  footer: { ...font.caption, color: color.muted, textAlign: 'center' },
});
