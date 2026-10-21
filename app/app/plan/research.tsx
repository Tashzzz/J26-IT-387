// C4 research results (Rashmi): does the AI week planner beat the rule engine?
// Evidence for the research layer: held-out C3 test bowlers, every plan judged by the TRUE injury mechanism
// of the synthetic cohort (experiments/oracle.py), not by C3. Numbers come from src/c4/researchData.ts.
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { FrontierChart } from '../../src/c4/FrontierChart';
import { RESEARCH } from '../../src/c4/researchData';
import { colors } from '../../src/c4/theme';
import { Banner, Body, Button, Card, H, Pill, Screen, Small } from '../../src/c4/ui';

const ROWS: { key: keyof typeof RESEARCH.points; label: string; highlight?: boolean }[] = [
  { key: 'usual', label: 'Usual week (no CricShield)' },
  { key: 'ecb', label: 'ECB limits only' },
  { key: 'rules', label: 'C4 rule engine' },
  { key: 'planner', label: 'C4 week planner (AI, default)', highlight: true },
  { key: 'rest', label: 'Rest every flagged bowler' },
  { key: 'best', label: "Week planner, best point" },
];

export default function ResearchScreen() {
  const router = useRouter();
  const R = RESEARCH;
  const extra = R.extraPreventedPct; // from unrounded experiment values

  return (
    <Screen>
      <Card>
        <View style={s.between}>
          <Text style={s.title}>Does the AI week planner beat the rules?</Text>
        </View>
        <View style={s.pills}>
          <Pill text={`${R.test.bowlers} held-out bowlers`} icon="people-outline" />
          <Pill text={`${R.test.sessions} sessions`} icon="calendar-outline" />
          <Pill text="True injury risk" icon="flask-outline" tone="neutral" />
        </View>
        <Body muted>
          For each screening session, each policy chose next week's bowling. Every plan was then judged by the true injury
          formula that generated C3's data – not by C3 itself – so the AI is not grading its own homework.
        </Body>
      </Card>

      <Card>
        <H>Bowling kept vs injuries</H>
        <FrontierChart />
      </Card>

      <Card>
        <H>Results</H>
        <View style={[s.tr, s.th]}>
          <Text style={[s.tdLabel, s.thText]}>Policy</Text>
          <Text style={[s.td, s.thText]}>Injuries / 100</Text>
          <Text style={[s.td, s.thText]}>Overs kept</Text>
        </View>
        {ROWS.map((r) => {
          const p = R.points[r.key];
          return (
            <View key={r.key} style={[s.tr, r.highlight && s.trHi]}>
              <Text style={[s.tdLabel, r.highlight && s.hiText]}>{r.label}</Text>
              <Text style={[s.td, r.highlight && s.hiText]}>{p.y.toFixed(2)}</Text>
              <Text style={[s.td, r.highlight && s.hiText]}>{Math.round(p.x)}%</Text>
            </View>
          );
        })}
      </Card>

      <Card>
        <H>Key findings</H>
        <Finding n="1" text={`The week planner prevents ${extra}% more injuries than the rule engine (${R.prevented.planner.toFixed(2)} vs ${R.prevented.rules.toFixed(2)} per 100 bowlers, compared with the usual week).`} />
        <Finding n="2" text={`Paired vs rules: ${R.vsRules.injuries} injuries per 100 (95% CI ${R.vsRules.injuriesCi[0]} to ${R.vsRules.injuriesCi[1]}) for ${R.vsRules.overs} points of overs (95% CI ${R.vsRules.oversCi[0]} to ${R.vsRules.oversCi[1]}).`} />
        <Finding n="3" text="The AI curve stays below 'same cut for everyone' and reaches the lowest injury level of all policies – lower than resting every flagged bowler, because it avoids the load spike when rested bowlers return." />
        <Finding n="4" text={`C3 orders two plans the same way as the true mechanism in ${R.validity.agreementPct}% of ${R.validity.pairs} pairs (Spearman ${R.validity.spearman}) – useful but imperfect, so safety rules stay outside the model's control.`} />
        <Finding n="5" text={`About ${R.latencyMs} ms per bowler (requirement: under 3 s).`} />
      </Card>

      <Banner tone="info" icon="information-circle-outline" title="Limits of this study">
        <Body muted>• Synthetic cohort: it shows the method works when the injury mechanism is known, not real-world effect sizes.</Body>
        <Body muted>• At exactly the rule engine's workload the policies are equal – the gain comes from where extra overs are cut.</Body>
        <Body muted>• Small test set (29 bowlers), so the confidence intervals are wide.</Body>
        <Body muted>• Next: real workload logs and a blinded physiotherapist review of rule vs AI plans.</Body>
      </Banner>

      <Button title="Open the week planner" icon="git-compare-outline" variant="secondary" onPress={() => router.push('/plan/week-plan')} />
      <Small style={{ textAlign: 'center' }}>
        Source: components/c4_recommend/experiments (weekplan_frontier.py, weekplan_study.py). Exchange rate {R.overValue} chosen on
        validation bowlers, tested once on held-out bowlers.
      </Small>
    </Screen>
  );
}

function Finding({ n, text }: { n: string; text: string }) {
  return (
    <View style={s.finding}>
      <Text style={s.num}>{n}</Text>
      <Text style={s.findingText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', flex: 1 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  th: { borderBottomColor: colors.muted },
  thText: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  trHi: { backgroundColor: colors.accentDim, borderRadius: 8 },
  tdLabel: { flex: 2, color: colors.text, fontSize: 14 },
  td: { flex: 1, color: colors.text, fontSize: 14, textAlign: 'right' },
  hiText: { color: colors.accent, fontWeight: '800' },
  finding: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accentDim, color: colors.accent, textAlign: 'center', lineHeight: 24, fontWeight: '800', overflow: 'hidden' },
  findingText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
});
