// C4 model-guided check (research extension): every action in the plan tested against C3's risk
// model - risk now, risk after each action, and the best combination. Counterfactual simulation.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useWhatIf, pts } from '../src/c4/useWhatIf';
import type { WhatIfScenario } from '../src/c4/types';
import { useApp } from '../src/state/AppContext';
import { Badge, Banner, Body, Button, Card, EmptyState, Loading, ProgressBar, Screen, Section, Small, TierBadge } from '../src/ui/components';
import { colors, radius, tierColor, type as t } from '../src/ui/theme';

const CAT: Record<WhatIfScenario['category'], { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  technique: { label: 'Technique', icon: 'fitness-outline' },
  workload: { label: 'Workload', icon: 'speedometer-outline' },
  recovery: { label: 'Recovery', icon: 'bed-outline' },
};

export default function WhatIfScreen() {
  const router = useRouter();
  const { athlete, plan } = useApp();
  const { data, loading, unavailable, rerun } = useWhatIf(athlete?.id, plan?.id ?? plan?.generated_at);

  if (!athlete || !plan) {
    return <Screen><EmptyState icon="clipboard-outline" title="Make a plan first" text="The model check tests the actions in the current prevention plan." action="Go to the plan" onAction={() => router.replace('/plan')} /></Screen>;
  }
  if (loading && !data) return <Screen><Loading text="Testing each action with the risk model…" /></Screen>;
  if (!data) {
    return (
      <Screen footer={<Button title="Try again" icon="refresh" onPress={rerun} />}>
        <Banner tone="warn" icon="flask-outline" title="Model check not available"><Body muted>{unavailable}</Body></Banner>
      </Screen>
    );
  }

  const maxEffect = Math.max(0.01, ...data.scenarios.map((x) => Math.abs(x.effect)));

  return (
    <Screen footer={<Button title="Run the check again" variant="secondary" icon="refresh" onPress={rerun} loading={loading} />}>
      <Card>
        <Text style={t.overline}>How it works</Text>
        <Body>For each action in the plan, we change the bowler's data as if they had followed it (for example, side-bend 52° → 35°) and ask the risk model for a new score. Actions are ranked by how much risk they remove.</Body>
      </Card>

      {/* ---- now vs best ---- */}
      <View style={s.compare}>
        <View style={s.side}>
          <Small>Risk now</Small>
          <Text style={[s.big, { color: tierColor[data.base_tier] }]}>{pts(data.base_risk)}</Text>
          <TierBadge tier={data.base_tier} size="sm" />
        </View>
        <Ionicons name="arrow-forward" size={26} color={colors.muted} />
        <View style={s.side}>
          <Small>With the best actions</Small>
          <Text style={[s.big, { color: tierColor[data.best_plan.tier] }]}>{pts(data.best_plan.risk)}</Text>
          <TierBadge tier={data.best_plan.tier} size="sm" />
        </View>
      </View>

      {data.referral_required && (
        <Banner tone="danger" icon="medkit-outline" title="The physiotherapist referral still stands">
          <Body muted>The model check only ranks actions. It never replaces the referral in the plan.</Body>
        </Banner>
      )}

      {data.best_plan.steps.length > 0 && (
        <Section title="Best combination">
          <Card>
            {data.best_plan.steps.map((st, i) => (
              <View key={st.id} style={s.step}>
                <Text style={s.rank}>{i + 1}</Text>
                <Text style={[t.body, { flex: 1, color: colors.text, fontWeight: '600' }]}>{st.title}</Text>
                <Text style={s.gain}>−{pts(st.gain)}</Text>
                <Text style={s.after}>→ {pts(st.risk_after)}</Text>
              </View>
            ))}
            <Small>Each step is added only if it still lowers the risk by at least {pts(data.min_effect)} points.</Small>
          </Card>
        </Section>
      )}

      <Section title="Every action tested">
        {data.scenarios.length === 0 && <Card><Body muted>No load spike, rest problem or technique breach was found, so there is nothing to test.</Body></Card>}
        {data.scenarios.map((x) => (
          <Card key={x.id}>
            <View style={s.head}>
              <Ionicons name={CAT[x.category].icon} size={18} color={colors.primary} />
              <Text style={[t.heading, { flex: 1 }]}>{x.title}</Text>
              {x.meaningful ? <Badge text={`−${pts(x.effect)}`} tone="ok" /> : <Badge text="little effect" tone="neutral" />}
            </View>
            <Small>Change tested: {x.change}</Small>
            <ProgressBar value={Math.max(0, x.effect) / maxEffect} color={x.meaningful ? colors.ok : colors.borderStrong} />
            <Small>Risk {pts(data.base_risk)} → {pts(x.risk)} · {CAT[x.category].label}</Small>
          </Card>
        ))}
      </Section>

      <Section title="Read this carefully">
        <Card>
          {data.notes.map((n) => <Small key={n}>• {n}</Small>)}
          <Small style={{ marginTop: 4 }}>Model {data.model} · {data.model_calls} model runs · {data.latency_ms} ms</Small>
        </Card>
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  compare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  side: { alignItems: 'center', gap: 4 },
  big: { fontSize: 40, fontWeight: '800' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primarySoft, color: colors.primary, textAlign: 'center', lineHeight: 24, fontWeight: '800', fontSize: 12, overflow: 'hidden' },
  gain: { color: colors.ok, fontWeight: '800' },
  after: { color: colors.muted, fontWeight: '600', width: 44, textAlign: 'right' },
});
