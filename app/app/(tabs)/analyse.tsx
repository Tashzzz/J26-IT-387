// Analyse (centre tab): profile first - pick the bowler, then go to capture.
// Phase 4 replaces the hand-off to the C1 capture screen with the guided analysis flow.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BowlerCard } from '../../src/shell/BowlerCard';
import { openAnalysis } from '../../src/shell/links';
import { useSquad } from '../../src/shell/squad';
import {
  color, EmptyState, ErrorBanner, font, GradientHeader, PipelineStepper, PrimaryButton, Screen, Skeleton, sp, StepIndicator,
} from '../../src/ui';

export default function Analyse() {
  const router = useRouter();
  const params = useLocalSearchParams<{ athleteId?: string }>();
  const { rows, loading, error, refresh } = useSquad();
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => { if (params.athleteId) setPicked(Number(params.athleteId)); }, [params.athleteId]);
  const bowler = rows.find((r) => r.athlete.id === picked);

  return (
    <Screen safeTop onRefresh={refresh}>
      <GradientHeader title="New analysis" subtitle="One delivery video → pose → joint angles → risk → plan." icon="videocam" />
      <PipelineStepper states={{}} compact />
      <StepIndicator steps={['Bowler', 'Record', 'Results']} current={0} />

      <Text style={s.h2}>Who is bowling?</Text>
      {error ? <ErrorBanner title="Can't load the squad" message={error} onRetry={refresh} />
        : loading ? [0, 1, 2].map((i) => <Skeleton key={i} height={92} round={20} />)
        : rows.length === 0 ? (
          <EmptyState icon="person-add" title="Add a bowler first" text="Each analysis is saved to a bowler's profile."
            actionTitle="Add bowler" onAction={() => router.push('/bowler/edit')} />
        ) : rows.map((r) => (
          <BowlerCard key={r.athlete.id} row={r} selected={r.athlete.id === picked} onPress={() => setPicked(r.athlete.id)} />
        ))}

      {rows.length > 0 && (
        <View style={s.footer}>
          <PrimaryButton title={bowler ? `Record ${bowler.athlete.bowler_id}` : 'Pick a bowler'} icon="videocam"
            disabled={!bowler} onPress={() => bowler && openAnalysis(router, bowler.athlete.id)} />
          {bowler && <Text style={s.hint}>Name the video starting with {bowler.athlete.bowler_id} (e.g. {bowler.athlete.bowler_id}_D01.mp4) so the results are matched to this bowler.</Text>}
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
