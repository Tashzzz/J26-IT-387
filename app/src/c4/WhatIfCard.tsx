// Plan-tab summary of the model-guided check: "following this plan is predicted to lower the risk
// from X to Y", with the actions that matter most. Full detail is on the /whatif screen.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, Loading, ProgressBar, Small } from '../ui/components';
import { colors, radius, tierColor, type as t } from '../ui/theme';
import type { WhatIfResult } from './types';
import { pts } from './useWhatIf';

export function WhatIfCard({ data, loading, unavailable, onOpen }: {
  data: WhatIfResult | null; loading: boolean; unavailable: string | null; onOpen: () => void;
}) {
  if (loading && !data) return <Card><Loading text="Checking the plan with the risk model…" /></Card>;
  if (!data) {
    if (!unavailable) return null;
    return (
      <Card>
        <View style={s.head}>
          <Ionicons name="flask-outline" size={18} color={colors.muted} />
          <Text style={t.heading}>Model check</Text>
        </View>
        <Small>{unavailable}</Small>
      </Card>
    );
  }

  const best = data.best_plan;
  const top = data.scenarios.filter((x) => x.meaningful).slice(0, 3);
  const maxEffect = Math.max(0.01, ...data.scenarios.map((x) => x.effect));

  return (
    <Card onPress={onOpen} accessibilityLabel="Open the model check">
      <View style={s.head}>
        <Ionicons name="flask-outline" size={18} color={colors.primary} />
        <Text style={[t.heading, { flex: 1 }]}>Model check</Text>
        <Badge text="AI what-if" tone="info" icon="sparkles-outline" />
      </View>

      {best.steps.length > 0 ? (
        <>
          <Text style={t.body}>If the bowler follows the top {best.steps.length === 1 ? 'action' : `${best.steps.length} actions`}, the risk model predicts:</Text>
          <View style={s.fromTo}>
            <Text style={[s.big, { color: tierColor[data.base_tier] }]}>{pts(data.base_risk)}</Text>
            <Ionicons name="arrow-forward" size={22} color={colors.muted} />
            <Text style={[s.big, { color: tierColor[best.tier] }]}>{pts(best.risk)}</Text>
            <Text style={s.drop}>−{pts(best.effect)} points</Text>
          </View>
        </>
      ) : (
        <Text style={t.body}>
          {data.scenarios.length === 0
            ? 'Nothing in the workload or technique needs changing for this bowler, so the plan is mainly maintenance.'
            : 'None of the changes moves the predicted risk by more than a couple of points. Follow the plan, and review technique on video with the coach.'}
        </Text>
      )}

      {top.map((x, i) => (
        <View key={x.id} style={{ gap: 4 }}>
          <View style={s.row}>
            <Text style={s.rank}>{i + 1}</Text>
            <Text style={s.action} numberOfLines={2}>{x.title}</Text>
            <Text style={s.effect}>−{pts(x.effect)}</Text>
          </View>
          <ProgressBar value={x.effect / maxEffect} color={colors.ok} />
        </View>
      ))}

      <Small>Estimate from C3's risk model, not a guarantee. Rules still decide what is safe.</Small>
      <Button title="See every scenario" size="sm" variant="secondary" icon="list-outline" onPress={onOpen} style={{ alignSelf: 'flex-start' }} />
    </Card>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fromTo: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 12 },
  big: { fontSize: 30, fontWeight: '800' },
  drop: { marginLeft: 'auto', color: colors.ok, fontWeight: '800', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primarySoft, color: colors.primary, textAlign: 'center', lineHeight: 22, fontWeight: '800', fontSize: 12, overflow: 'hidden' },
  action: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 15 },
  effect: { color: colors.ok, fontWeight: '800', fontSize: 15 },
});
