// Insights · C2 threshold library: every joint-angle limit C2 uses, what it means and where it comes from
// (c2.thresholds(), owned by Tashini). Read-only.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { c2 } from '../../src/api/c2';
import type { Thresholds } from '../../src/c2/types';
import { FEATURE_LABEL, FEATURE_ORDER, ruleText, TECH_LABEL } from '../../src/c2/ui';
import {
  alpha, Card, color, COMPONENT, ErrorBanner, font, GradientHeader, RISK, Screen, Skeleton, sp, Tag, useResearchMode,
} from '../../src/ui';

const C2 = COMPONENT.c2.color;

export default function ThresholdLibrary() {
  const research = useResearchMode();
  const [data, setData] = useState<Thresholds | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => { setError(null); c2.thresholds().then(setData, (e: Error) => setError(e.message)); };
  useEffect(load, []);

  return (
    <Screen onRefresh={load}>
      <GradientHeader component="c2" title="Threshold library" icon="library"
        subtitle="The published joint-angle limits behind every red, amber and green angle." />

      {error ? <ErrorBanner title="Could not load the thresholds" message={error} onRetry={load} />
        : !data ? [0, 1, 2].map((i) => <Skeleton key={i} height={160} round={20} />)
        : FEATURE_ORDER.filter((n) => data[n]).map((n) => {
          const t = data[n];
          return (
            <Card key={n} style={{ borderColor: alpha(C2, 0.35) }}>
              <Text style={s.title}>{FEATURE_LABEL[n]}</Text>
              {research && <Text style={s.small}>{TECH_LABEL[n]} · {n}</Text>}
              <View style={s.limitRow}>
                <Ionicons name={t.threshold == null ? 'information-circle' : 'alert-circle'} size={20} color={t.threshold == null ? color.muted : RISK.critical.text} />
                <Text style={s.limit}>{ruleText(t, n)}</Text>
              </View>
              <View style={s.tags}>
                {t.threshold != null && <Tag label={`Limit ${t.threshold}°`} tint={RISK.critical.text} />}
                {t.amber_band ? <Tag label={`Amber within ${t.amber_band}° of the limit`} tint={RISK.moderate.color} /> : null}
                {t.rule && <Tag label={t.rule === 'above' ? 'Risk when above' : 'Risk when below'} />}
              </View>
              <Text style={s.body}>{t.meaning}</Text>
              {t.evidence ? (
                <View style={s.evidence}>
                  <Text style={s.label}>EVIDENCE</Text>
                  <Text style={s.muted}>{t.evidence}</Text>
                </View>
              ) : null}
              <Text style={s.source}>Source: {t.source}</Text>
            </Card>
          );
        })}

      <Text style={s.foot}>Limits are screening thresholds from published studies of fast bowlers, not diagnoses. C2 owns these values; the plan engine (C4) only reads them.</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { ...font.h2, color: color.text },
  small: { ...font.caption, color: color.muted },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  limit: { ...font.body, color: color.text, fontWeight: '700', flex: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  body: { ...font.body, color: color.text },
  muted: { ...font.body, color: color.muted },
  label: { ...font.caption, color: color.muted, fontWeight: '700', letterSpacing: 1 },
  evidence: { gap: 2, borderLeftWidth: 3, borderLeftColor: alpha(C2, 0.6), paddingLeft: sp(1.5) },
  source: { ...font.caption, color: color.muted, fontStyle: 'italic' },
  foot: { ...font.caption, color: color.muted, textAlign: 'center' },
});
