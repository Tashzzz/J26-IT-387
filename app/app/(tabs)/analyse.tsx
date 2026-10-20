// Analyse (centre tab) = analysis step 1: who is bowling? Pick a bowler or add a new one.
// From a bowler profile this step is skipped (the profile starts the flow at camera setup).
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAnalysis } from '../../src/analysis/AnalysisContext';
import { ANALYSIS_STEPS } from '../../src/analysis/steps';
import { BowlerCard } from '../../src/shell/BowlerCard';
import { useSquad } from '../../src/shell/squad';
import {
  color, EmptyState, ErrorBanner, font, GradientHeader, PipelineStepper, PrimaryButton, Screen, SecondaryButton, Skeleton, sp, StepIndicator,
} from '../../src/ui';

export default function Analyse() {
  const router = useRouter();
  const { rows, loading, error, refresh } = useSquad();
  const { begin } = useAnalysis();
  const [picked, setPicked] = useState<number | null>(null);
  const bowler = rows.find((r) => r.athlete.id === picked);

  return (
    <Screen safeTop onRefresh={refresh}>
      <GradientHeader title="New analysis" subtitle="One delivery video → pose → joint angles → risk → plan." icon="videocam" />
      <PipelineStepper states={{}} compact />
      <StepIndicator steps={ANALYSIS_STEPS} current={0} />

      <Text style={s.h2}>Who is bowling?</Text>
      <SecondaryButton title="New bowler" icon="person-add-outline" onPress={() => router.push({ pathname: '/bowler/edit', params: { then: 'analyse' } })} />
      {error ? <ErrorBanner title="Can't load the squad" message={error} onRetry={refresh} />
        : loading ? [0, 1, 2].map((i) => <Skeleton key={i} height={92} round={20} />)
        : rows.length === 0 ? (
          <EmptyState icon="person-add" title="Add a bowler first" text="Each analysis is saved to a bowler's profile." />
        ) : rows.map((r) => (
          <BowlerCard key={r.athlete.id} row={r} selected={r.athlete.id === picked} onPress={() => setPicked(r.athlete.id)} />
        ))}

      {rows.length > 0 && (
        <View style={s.footer}>
          <PrimaryButton title={bowler ? `Next: camera setup for ${bowler.athlete.bowler_id}` : 'Pick a bowler'} icon="arrow-forward"
            disabled={!bowler} onPress={() => { if (bowler) { begin(bowler.athlete); router.push('/analyse/setup'); } }} />
          {bowler && <Text style={s.hint}>{bowler.athlete.dominant_arm === 'left' ? 'Left' : 'Right'}-arm bowler – the arm is taken from the profile.</Text>}
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  h2: { ...font.h2, color: color.text, marginTop: sp(1) },
  footer: { gap: sp(1), marginTop: sp(1) },
  hint: { ...font.caption, color: color.muted, textAlign: 'center' },
});
