// C4 model-guided check (research extension): every action in the plan tested against C3's risk
// model - risk now, risk after each action, and the best combination. Counterfactual simulation.
// Ported from c4/what-if to the ui-v2 C4 kit; lives in the plan/ stack so it shares C4Provider.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useC4 } from '../../src/c4/C4Context';
import { colors, tierColor } from '../../src/c4/theme';
import type { WhatIfScenario } from '../../src/c4/types';
import { Banner, Body, Button, Card, H, Loading, Pill, Screen, Small, TierBadge } from '../../src/c4/ui';
import { pts, useWhatIf } from '../../src/c4/useWhatIf';
import { ProgressBar } from '../../src/ui/components/data';

const CAT: Record<WhatIfScenario['category'], { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  technique: { label: 'Technique', icon: 'fitness-outline' },
  workload: { label: 'Workload', icon: 'speedometer-outline' },
  recovery: { label: 'Recovery', icon: 'bed-outline' },
};

export default function WhatIfScreen() {
  const router = useRouter();
  const { athlete, plan } = useC4();
  const { data, loading, unavailable, rerun } = useWhatIf(athlete?.id, plan?.id ?? plan?.generated_at);

  if (!athlete || !plan) {
    return (
      <Screen>
        <Card><Body muted>Make a plan first. The model check tests the actions in the current prevention plan.</Body></Card>
        <Button title="Go to the plan" icon="clipboard-outline" onPress={() => router.replace('/plan')} />
      </Screen>
    );
  }
  if (loading && !data) return <Screen><Loading text="Testing each action with the risk model…" /></Screen>;
  if (!data) {
    return (
      <Screen>
        <Banner tone="warn" icon="flask-outline" title="Model check not available"><Body muted>{unavailable}</Body></Banner>
        <Button title="Try again" icon="refresh" onPress={rerun} />
      </Screen>
    );
  }

  const maxEffect = Math.max(0.01, ...data.scenarios.map((x) => Math.abs(x.effect)));

  return (
    <Screen>
      <Card>
        <H>How it works</H>
        <Body>For each action in the plan, we change the bowler's data as if they had followed it (for example, side-bend 52° → 35°) and ask the risk model for a new score. Actions are ranked by how much risk they remove.</Body>
      </Card>

      {/* ---- now vs best ---- */}
      <View style={s.compare}>
        <View style={s.side}>
          <Small>Risk now</Small>
          <Text style={[s.big, { color: tierColor[data.base_tier] }]}>{pts(data.base_risk)}</Text>
          <TierBadge tier={data.base_tier} />
        </View>
        <Ionicons name="arrow-forward" size={26} color={colors.muted} />
        <View style={s.side}>
          <Small>With the best actions</Small>
          <Text style={[s.big, { color: tierColor[data.best_plan.tier] }]}>{pts(data.best_plan.risk)}</Text>
          <TierBadge tier={data.best_plan.tier} />
        </View>
      </View>

      {data.referral_required && (
        <Banner tone="danger" icon="medkit-outline" title="The physiotherapist referral still stands">
          <Body muted>The model check only ranks actions. It never replaces the referral in the plan.</Body>
        </Banner>
      )}

      {data.best_plan.steps.length > 0 && (
        <View style={{ gap: 10 }}>
          <H>Best combination</H>
          <Card>
            {data.best_plan.steps.map((st, i) => (
              <View key={st.id} style={s.step}>
                <Text style={s.rank}>{i + 1}</Text>
                <Text style={s.stepTitle}>{st.title}</Text>
                <Text style={s.gain}>−{pts(st.gain)}</Text>
                <Text style={s.after}>→ {pts(st.risk_after)}</Text>
              </View>
            ))}
            <Small>Each step is added only if it still lowers the risk by at least {pts(data.min_effect)} points.</Small>
          </Card>
        </View>
      )}

      <View style={{ gap: 10 }}>
        <H>Every action tested</H>
        {data.scenarios.length === 0 && <Card><Body muted>No load spike, rest problem or technique breach was found, so there is nothing to test.</Body></Card>}
        {data.scenarios.map((x) => (
          <Card key={x.id}>
            <View style={s.head}>
              <Ionicons name={CAT[x.category].icon} size={18} color={colors.accent} />
              <Text style={s.title}>{x.title}</Text>
              {x.meaningful ? <Pill text={`−${pts(x.effect)}`} tone="ok" /> : <Pill text="little effect" tone="neutral" />}
            </View>
            <Small>Change tested: {x.change}</Small>
            <ProgressBar value={Math.max(0, x.effect) / maxEffect} tint={x.meaningful ? colors.ok : colors.border} height={6} />
            <Small>Risk {pts(data.base_risk)} → {pts(x.risk)} · {CAT[x.category].label}</Small>
          </Card>
        ))}
      </View>

      <View style={{ gap: 10 }}>
        <H>Read this carefully</H>
        <Card>
          {data.notes.map((n) => <Small key={n}>• {n}</Small>)}
          <Small style={{ marginTop: 4 }}>Model {data.model} · {data.model_calls} model runs · {data.latency_ms} ms</Small>
        </Card>
      </View>

      <Button title="Run the check again" variant="secondary" icon="refresh" onPress={rerun} loading={loading} />
    </Screen>
  );
}

const s = StyleSheet.create({
  compare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: colors.card, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: colors.border },
  side: { alignItems: 'center', gap: 4 },
  big: { fontSize: 40, fontWeight: '800' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  rank: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accentDim, color: colors.accent, textAlign: 'center', lineHeight: 24, fontWeight: '800', fontSize: 12, overflow: 'hidden' },
  gain: { color: colors.ok, fontWeight: '800' },
  after: { color: colors.muted, fontWeight: '600', width: 44, textAlign: 'right' },
});
