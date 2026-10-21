// C4 FR10 - log of every generated plan, with the feedback it received.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { c4 } from '../../src/api/c4';
import { useC4 } from '../../src/c4/C4Context';
import { colors, tierColor } from '../../src/c4/theme';
import type { Feedback, PreventionPlan } from '../../src/c4/types';
import { Body, Card, Loading, Row, Screen, TierBadge } from '../../src/c4/ui';

export default function HistoryScreen() {
  const { athlete } = useC4();
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

  if (err) return <Screen><Card><Body muted>{err}</Body></Card></Screen>;
  if (!plans) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <Text style={s.head}>{athlete?.bowler_id} · {plans.length} plan{plans.length === 1 ? '' : 's'}</Text>
      {plans.length === 0 && <Card><Body muted>No plans generated yet.</Body></Card>}
      {plans.map((p) => (
        <Pressable key={p.id} onPress={() => p.id && toggle(p.id)} accessibilityRole="button"
          style={[s.item, { borderLeftColor: tierColor[p.risk_tier] }]}>
          <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.date}>{new Date(p.generated_at).toLocaleString()}</Text>
            <TierBadge tier={p.risk_tier} />
          </Row>
          <Text style={s.sub}>
            {p.risk_score != null ? `${Math.round(p.risk_score * 100)}% risk` : 'fallback estimate'} · {p.recommendations.length} actions
            {p.referral.required ? ' · referral' : ''} · ACWR {p.metrics.acwr ?? '—'}
          </Text>
          {open === p.id && (
            <View style={{ marginTop: 8, gap: 4 }}>
              {p.plan.map((x, i) => <Text key={i} style={s.line}>• [{x.type}] {x.action}</Text>)}
              {(fb[p.id!] ?? []).map((f) => (
                <Text key={f.id} style={s.fb}>
                  {f.role} {f.reviewer}: {f.decision}{f.usefulness ? ` · usefulness ${f.usefulness}/5` : ''}{f.rule_id ? ` · ${f.rule_id}` : ''}{f.comment ? ` - "${f.comment}"` : ''}
                </Text>
              ))}
            </View>
          )}
        </Pressable>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { color: colors.text, fontSize: 18, fontWeight: '700' },
  item: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, padding: 14 },
  date: { color: colors.text, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 4 },
  line: { color: colors.text, fontSize: 13, lineHeight: 19 },
  fb: { color: colors.accent, fontSize: 13, lineHeight: 19 },
});
