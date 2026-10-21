// Week planner (C4 research layer 2 - Rathnayaka). Next week's options are simulated with C3's trained
// risk model: usual week vs the rule plan vs the model-guided week, with predicted 2-week risk for each.
// Layer 1 (/plan/whatif, "Model check") ranks the actions of the current plan; this screen plans the overs.
// Ported from c4/what-if to the ui-v2 C4 kit; lives in the plan/ stack so it shares C4Provider.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { c4 } from '../../src/api/c4';
import { useC4 } from '../../src/c4/C4Context';
import { colors } from '../../src/c4/theme';
import type { WeekPlanOption, WeekPlanResult } from '../../src/c4/types';
import { Banner, Body, Button, Card, Chips, H, Loading, Pill, Screen, Small, TierBadge } from '../../src/c4/ui';

type Mode = WeekPlanResult['mode'];
const MODES: { value: Mode; label: string }[] = [
  { value: 'tradeoff', label: 'Balanced' },
  { value: 'keep_bowling', label: 'Most bowling' },
  { value: 'lower_risk', label: 'Lowest risk' },
];
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function WeekPlanScreen() {
  const router = useRouter();
  const { athlete, plan } = useC4();
  const [mode, setMode] = useState<Mode>('tradeoff');
  const [res, setRes] = useState<WeekPlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!athlete) return;
    setLoading(true);
    setError(null);
    try {
      setRes(await c4.weekPlan(athlete.id, mode));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [athlete, mode]);

  useEffect(() => { run(); }, [run, plan?.generated_at]);

  if (!athlete) {
    return <Screen><Card><Body muted>Set up a bowler first. The planner works for one bowler at a time.</Body></Card></Screen>;
  }

  return (
    <Screen>
      <Small>{athlete.bowler_id} · next 7 days</Small>
      <Chips label="What matters most" options={MODES} value={mode} onChange={setMode} />
      {error && <Banner tone="danger" icon="alert-circle-outline" title="Could not run the planner"><Body muted>{error}</Body></Banner>}
      {loading && !res && <Loading text="Simulating next week's options…" />}
      {res && (
        <>
          <View style={s.hero}>
            <View style={s.between}>
              <TierBadge tier={res.tier} />
              <Pill text={`${res.candidates_evaluated} weeks tested`} icon="flask-outline" />
            </View>
            <Text style={s.summary}>{res.usual.total_overs === 0
              ? 'No workload logged for this bowler yet, so there is no usual week to plan from. Log at least 2-3 weeks of sessions in the Workload log, then run the planner again.'
              : res.explanation}</Text>
            {res.synthetic_model && <Small>Risk model trained on synthetic, literature-informed data – estimates, not certainty.</Small>}
          </View>

          {res.referral_advised && (
            <Banner tone="danger" icon="medkit-outline" title="Physiotherapist review advised before following any plan" />
          )}

          <View style={{ gap: 10 }}>
            <H>Compare next week</H>
            <WeekCard opt={res.usual} title="Your usual week" icon="time-outline" />
            <WeekCard opt={res.rule_plan} title="Rule plan" icon="list-outline" />
            <WeekCard opt={res.recommended} title="Model-guided week" icon="sparkles-outline" highlight />
          </View>

          {res.alternatives.length > 0 && (
            <View style={{ gap: 10 }}>
              <H>Other options (more bowling ↔ lower risk)</H>
              {res.alternatives.map((a) => <WeekCard key={a.label + a.total_overs} opt={a} title={a.label} icon="options-outline" compact />)}
            </View>
          )}

          {res.technique.length > 0 && (
            <View style={{ gap: 10 }}>
              <H>Longer term: technique</H>
              {res.technique.map((tq) => (
                <Card key={tq.feature}>
                  <Text style={s.rowTitle}>{tq.label}</Text>
                  <Body muted>
                    {tq.breached_deliveries} of {tq.deliveries} balls past the {tq.limit}° limit (worst {tq.current}°). If corrected,
                    the risk score would go from {Math.round(tq.risk_now * 100)} to {Math.round(tq.risk_if_corrected * 100)} / 100.
                  </Body>
                </Card>
              ))}
            </View>
          )}

          <Card>
            <H>How this works</H>
            {res.assumptions.map((a) => <Small key={a}>• {a}</Small>)}
          </Card>
          <Small style={{ textAlign: 'center' }}>{res.model} · {res.latency_ms} ms · decision support, not a diagnosis</Small>
        </>
      )}
      <Button title="Run again" variant="secondary" icon="refresh" onPress={run} loading={loading} />
      <Button title="Does this beat the rules? See the research results" variant="secondary" icon="bar-chart-outline"
        onPress={() => router.push('/plan/research')} />
    </Screen>
  );
}

function WeekCard({ opt, title, icon, highlight, compact }: {
  opt: WeekPlanOption; title: string; icon: keyof typeof Ionicons.glyphMap; highlight?: boolean; compact?: boolean;
}) {
  return (
    <View style={[s.week, highlight && s.weekHi]}>
      <View style={s.between}>
        <View style={s.titleRow}>
          <Ionicons name={icon} size={18} color={highlight ? colors.accent : colors.muted} />
          <Text style={s.rowTitle}>{title}</Text>
        </View>
        <Text style={[s.risk, highlight && { color: colors.accent }]}>{pct(opt.risk_14d)}</Text>
      </View>
      <Small>{opt.total_overs} overs · {opt.bowling_days} day(s) · {opt.overs_kept_pct}% of usual · chance of injury next 2 weeks</Small>
      {!compact && (
        <View style={s.days}>
          {opt.days.map((d) => (
            <View key={d.session_date} style={[s.day, d.overs > 0 && s.dayOn]}>
              <Text style={s.dayName}>{d.weekday}</Text>
              <Text style={[s.dayOvers, d.overs > 0 && { color: colors.text }]}>{d.overs > 0 ? d.overs : '–'}</Text>
              {d.session_type === 'match' && d.overs > 0 && <Text style={s.match}>M</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 14, padding: 18, gap: 10, backgroundColor: colors.accentDim },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summary: { color: colors.text, fontSize: 16, lineHeight: 23, fontWeight: '600' },
  week: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  weekHi: { borderColor: colors.accent, borderWidth: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  risk: { color: colors.text, fontSize: 20, fontWeight: '800' },
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: colors.cardAlt },
  dayOn: { backgroundColor: colors.okBg },
  dayName: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  dayOvers: { color: colors.muted, fontSize: 15, fontWeight: '700' },
  match: { color: colors.warn, fontSize: 10, fontWeight: '800' },
});
