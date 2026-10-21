// Insights · C3 model card (c3.model(), owned by Rizma): what the risk model is, what it was trained on,
// how well it does and where its alert levels sit. Plain words first; extra statistics in Research mode.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { c3 } from '../../src/api/risk';
import type { Modality, ModelCard } from '../../src/c3/types';
import { modalityMeta } from '../../src/c3/ui';
import {
  alpha, Card, color, COMPONENT, ErrorBanner, font, GradientHeader, MetricTile, ProgressBar, RISK, Screen, Skeleton, sp, useResearchMode,
} from '../../src/ui';

const C3 = COMPONENT.c3.color;
const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

export default function ModelCardScreen() {
  const research = useResearchMode();
  const [card, setCard] = useState<ModelCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => { setError(null); c3.model().then(setCard, (e: Error) => setError(e.message)); };
  useEffect(load, []);

  const m = card?.metrics;
  const shares = m?.shap_modality_share_test;

  return (
    <Screen onRefresh={load}>
      <GradientHeader component="c3" title="Risk model card" icon="pulse"
        subtitle="What the injury-risk model is, what it learned from, and how far to trust it." />

      {error ? <ErrorBanner title="Could not load the model card" message={error} onRetry={load} />
        : !card || !m ? <Skeleton height={320} round={20} />
        : (
          <>
            {card.synthetic && (
              <Card style={{ borderColor: alpha(RISK.moderate.color, 0.6) }}>
                <View style={s.head}>
                  <Ionicons name="flask-outline" size={18} color={RISK.moderate.color} />
                  <Text style={[s.h2, { color: RISK.moderate.color }]}>Development model – synthetic training data</Text>
                </View>
                <Text style={s.muted}>Shows how the system works; not a validated clinical prediction.</Text>
              </Card>
            )}

            <Card variant="glow" accent={C3}>
              <Text style={s.h2}>{card.model}</Text>
              <Text style={s.muted}>Trained {card.created}. XGBoost with clinically agreed directions of effect, calibrated to a probability; each factor's contribution is explained with TreeSHAP. Decision support only – not a diagnosis.</Text>
              <View style={s.tiles}>
                <MetricTile label="Training data" value={card.synthetic ? 'Synthetic' : 'Real'} icon="server-outline" hint={card.training_data.source} />
                {card.training_data.bowlers ? <MetricTile label="Bowlers" value={card.training_data.bowlers} icon="people-outline"
                  hint={card.training_data.sessions ? `${card.training_data.sessions} sessions` : undefined} /> : null}
              </View>
            </Card>

            <Card>
              <Text style={s.h2}>How good is it?</Text>
              <Text style={s.muted}>AUC is how often the model ranks an injured bowler above an uninjured one: 0.5 is a coin toss, 1.0 is perfect.</Text>
              <View style={s.tiles}>
                <MetricTile label="Cross-validated AUC" value={m.cv_auc_mean.toFixed(2)} tint={C3}
                  hint={research && m.cv_auc_sd != null ? `± ${m.cv_auc_sd.toFixed(2)}, grouped by bowler` : 'grouped by bowler'} />
                {m.test?.auc != null && <MetricTile label="Held-out test AUC" value={m.test.auc.toFixed(2)} tint={C3}
                  hint={m.test_bowlers ? `${m.test_bowlers} unseen bowlers` : undefined} />}
              </View>
              {m.test?.recall != null && (
                <Text style={s.body}>On unseen bowlers it caught <Text style={s.bold}>{pct(m.test.recall)}</Text> of injuries{m.test.precision != null ? <>; <Text style={s.bold}>{pct(m.test.precision)}</Text> of its alerts were followed by an injury</> : null}.</Text>
              )}
              {research && m.test && (
                <Text style={s.mono}>
                  test: AUC {m.test.auc?.toFixed(3)} · recall {m.test.recall?.toFixed(3)} · precision {m.test.precision?.toFixed(3)} · F1 {m.test.f1?.toFixed(3)}
                  {m.test.flagged_share != null ? ` · flagged ${pct(m.test.flagged_share)}` : ''}
                  {m.test_ci95 ? `\nCI95: ${Object.entries(m.test_ci95).map(([k, [a, b]]) => `${k} ${a.toFixed(2)}–${b.toFixed(2)}`).join(' · ')}` : ''}
                </Text>
              )}
            </Card>

            <Card>
              <Text style={s.h2}>When does it raise an alert?</Text>
              <Text style={s.body}>An average squad member has a <Text style={s.bold}>{pct(card.base_rate)}</Text> chance of a time-loss injury in the next 4 weeks.</Text>
              <Text style={s.body}>Alert at <Text style={s.bold}>{pct(card.thresholds.probability.alert)}</Text> · high at {pct(card.thresholds.probability.high)} · critical at {pct(card.thresholds.probability.critical)} (4-week probability).</Text>
              {card.thresholds.rule ? <Text style={s.muted}>{card.thresholds.rule}</Text> : null}
              {research && <Text style={s.mono}>score cut-offs: {Object.entries(card.thresholds.score).map(([k, v]) => `${k} ${v}`).join(' · ')}</Text>}
            </Card>

            {shares && (
              <Card>
                <Text style={s.h2}>What drives the scores</Text>
                <Text style={s.muted}>Share of the explanation coming from each kind of information, on the test bowlers.</Text>
                {(Object.keys(shares) as Modality[]).map((k) => (
                  <View key={k} style={{ gap: 4 }}>
                    <View style={s.head}>
                      <Ionicons name={modalityMeta[k].icon} size={16} color={modalityMeta[k].color} />
                      <Text style={[s.body, { flex: 1 }]}>{modalityMeta[k].label}</Text>
                      <Text style={s.bold}>{pct(shares[k])}</Text>
                    </View>
                    <ProgressBar value={shares[k]} tint={modalityMeta[k].color} />
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
    </Screen>
  );
}

const s = StyleSheet.create({
  h2: { ...font.h2, color: color.text },
  body: { ...font.body, color: color.text },
  bold: { ...font.body, color: color.text, fontWeight: '700' },
  muted: { ...font.body, color: color.muted },
  mono: { ...font.caption, color: color.muted, fontFamily: 'monospace' },
  head: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1) },
});
