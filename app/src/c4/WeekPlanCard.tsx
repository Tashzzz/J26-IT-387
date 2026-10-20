// Plan-tab summary of the week planner (research layer 2): usual week vs the model-guided week
// for the next 7 days, with the predicted 2-week injury chance. Full detail on /week-plan.
// If C3's model is not available the card explains why and the plan screen keeps working.
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { c4 } from '../api/c4';
import { ApiError } from '../api/client';
import { Badge, Button, Card, Loading, Small } from '../ui/components';
import { colors, radius, type as t } from '../ui/theme';
import type { WeekPlanOption, WeekPlanResult } from './types';

export function useWeekPlan(athleteId: number | null | undefined, planKey: string | number | null | undefined) {
  const [data, setData] = useState<WeekPlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const run = useCallback(async () => {
    if (athleteId == null) return;
    setLoading(true);
    try {
      setData(await c4.weekPlan(athleteId));
      setUnavailable(null);
    } catch (e) {
      setData(null);
      setUnavailable(e instanceof ApiError && e.status === 503
        ? 'The risk model is not loaded on the server, so next week cannot be planned yet.'
        : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [athleteId]);
  useEffect(() => { if (planKey != null) run(); }, [run, planKey]);
  return { data, loading, unavailable, rerun: run };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const days = (o: WeekPlanOption) => o.days.filter((d) => d.overs > 0).map((d) => `${d.weekday} ${d.overs}`).join(' · ') || 'No bowling';

export function WeekPlanCard({ data, loading, unavailable, onOpen }: {
  data: WeekPlanResult | null; loading: boolean; unavailable: string | null; onOpen: () => void;
}) {
  if (loading && !data) return <Card><Loading text="Planning next week with the risk model…" /></Card>;
  if (!data) {
    if (!unavailable) return null;
    return (
      <Card>
        <View style={s.head}>
          <Ionicons name="calendar-outline" size={18} color={colors.muted} />
          <Text style={t.heading}>Next week</Text>
        </View>
        <Small>{unavailable}</Small>
      </Card>
    );
  }
  const changed = data.status === 'optimised' || data.status === 'safety_stop';
  return (
    <Card onPress={onOpen} accessibilityLabel="Open the week planner">
      <View style={s.head}>
        <Ionicons name="calendar-outline" size={18} color={colors.primary} />
        <Text style={[t.heading, { flex: 1 }]}>Next week</Text>
        <Badge text={`${data.candidates_evaluated} weeks tested`} tone="info" icon="sparkles-outline" />
      </View>
      <Row label="Usual" opt={data.usual} />
      {changed && <Row label="Planned" opt={data.recommended} highlight />}
      <Text style={t.body}>{data.explanation}</Text>
      <Small>Chance of injury over the next 2 weeks, from C3's risk model – an estimate. Rules and referrals still apply.</Small>
      <Button title="Compare options" size="sm" variant="secondary" icon="git-compare-outline" onPress={onOpen} style={{ alignSelf: 'flex-start' }} />
    </Card>
  );
}

function Row({ label, opt, highlight }: { label: string; opt: WeekPlanOption; highlight?: boolean }) {
  return (
    <View style={[s.row, highlight && s.rowHi]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.label}>{label} · {opt.total_overs} overs</Text>
        <Text style={t.small} numberOfLines={1}>{days(opt)}</Text>
      </View>
      <Text style={[s.risk, highlight && { color: colors.primary }]}>{pct(opt.risk_14d)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 12 },
  rowHi: { backgroundColor: colors.primarySoft },
  label: { color: colors.text, fontWeight: '700', fontSize: 15 },
  risk: { color: colors.textSoft, fontWeight: '800', fontSize: 18 },
});
