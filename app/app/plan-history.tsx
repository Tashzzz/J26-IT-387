// C4 FR10 - every plan made for the current bowler, with the feedback it received.
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { c4 } from '../src/api/c4';
import type { Feedback, PreventionPlan } from '../src/c4/types';
import { useApp } from '../src/state/AppContext';
import { EmptyState, Loading, Screen, Small, TierBadge } from '../src/ui/components';
import { colors, radius, tierColor } from '../src/ui/theme';

const DECISION: Record<Feedback['decision'], string> = { accept: 'Accepted', modify: 'Changed', reject: 'Rejected' };
const ROLE: Record<Feedback['role'], string> = { coach: 'Coach', physiotherapist: 'Physio', sports_scientist: 'Sports scientist' };

export default function HistoryScreen() {
  const { athlete } = useApp();
  const [plans, setPlans] = useState<PreventionPlan[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [fb, setFb] = useState<Record<number, Feedback[]>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!athlete) return;
    try { setPlans(await c4.plans(athlete.id)); } catch (e) { setErr((e as Error).message); }
  }, [athlete]);
  useEffect(() => { load(); }, [load]);

  async function toggle(id: number) {
    setOpen(open === id ? null : id);
    if (!fb[id]) {
      try { const p = await c4.plan(id); setFb((m) => ({ ...m, [id]: p.feedback })); } catch { /* ignore */ }
    }
  }

  if (err) return <Screen><EmptyState icon="cloud-offline-outline" title="Could not load the history" text={err} action="Try again" onAction={load} /></Screen>;
  if (!plans) return <Screen><Loading /></Screen>;
  if (plans.length === 0) return <Screen><EmptyState icon="time-outline" title="No plans yet" text={`Plans made for ${athlete?.bowler_id ?? 'this bowler'} will appear here.`} /></Screen>;

  return (
    <Screen>
      <Small>{plans.length} plan{plans.length === 1 ? '' : 's'} for {athlete?.bowler_id}</Small>
      {plans.map((p) => (
        <Pressable key={p.id} onPress={() => p.id && toggle(p.id)} accessibilityRole="button" accessibilityState={{ expanded: open === p.id }}
          style={[s.item, { borderLeftColor: tierColor[p.risk_tier] }]}>
          <View style={s.between}>
            <Text style={s.date}>{new Date(p.generated_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
            <TierBadge tier={p.risk_tier} size="sm" />
          </View>
          <Small>
            {p.risk_score != null ? `Score ${Math.round(p.risk_score * 100)}` : 'Guideline estimate'} · {p.recommendations.length} actions
            {p.referral.required ? ' · physio referral' : ''} · workload ratio {p.metrics.acwr ?? '—'}
          </Small>
          {open === p.id && (
            <View style={{ marginTop: 8, gap: 6 }}>
              {p.plan.map((x, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                  <Ionicons name="checkmark" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                  <Text style={s.line}>{x.action}</Text>
                </View>
              ))}
              {(fb[p.id!] ?? []).map((f) => (
                <View key={f.id} style={s.fb}>
                  <Text style={s.fbHead}>{ROLE[f.role]} {f.reviewer} · {DECISION[f.decision]}{f.usefulness ? ` · ${f.usefulness}/5` : ''}</Text>
                  {f.comment ? <Small>“{f.comment}”</Small> : null}
                </View>
              ))}
            </View>
          )}
        </Pressable>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  item: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderLeftWidth: 4, borderRadius: radius.md, padding: 14, gap: 4 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { color: colors.text, fontWeight: '700', fontSize: 15 },
  line: { color: colors.textSoft, fontSize: 14, lineHeight: 20, flex: 1 },
  fb: { backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: 10, gap: 2 },
  fbHead: { color: colors.primary, fontWeight: '700', fontSize: 13 },
});
