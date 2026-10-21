// Analysis step 4 - the pipeline running live: Film > Action > Risk > Plan (C1 > C4 in Research mode) with
// plain stage text and elapsed time. On failure it stops, marks the step, shows the backend's message and
// offers retake / retry.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAnalysis } from '../../src/analysis/AnalysisContext';
import { ANALYSIS_STEPS } from '../../src/analysis/steps';
import {
  alpha, Card, color, COMPONENT, COMPONENT_KEYS, EmptyState, ErrorBanner, font, PipelineStepper, PrimaryButton, radius, RISK, Screen,
  SecondaryButton, sp, StepIndicator, useResearchMode, type ComponentKey,
} from '../../src/ui';

const mmss = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export default function RunStep() {
  const router = useRouter();
  const research = useResearchMode();
  const { athlete, steps, running, startedAt, finished, failedStep, retry, retake } = useAnalysis();
  const [now, setNow] = useState(Date.now());
  const moved = useRef(false);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // All four done -> results hub (once).
  useEffect(() => {
    if (finished && !moved.current) { moved.current = true; router.replace('/analyse/results'); }
  }, [finished, router]);

  if (!athlete || !startedAt) {
    return <Screen><EmptyState spot="video" title="Nothing is running" text="Start an analysis from the Analyse tab." actionTitle="Analyse a delivery" onAction={() => router.replace('/analyse')} /></Screen>;
  }

  const name = (k: ComponentKey) => (research ? `${COMPONENT[k].code} · ${COMPONENT[k].label}` : COMPONENT[k].step);
  const current: ComponentKey | undefined = COMPONENT_KEYS.find((k) => steps[k].state === 'running') ?? failedStep ?? undefined;
  const states = Object.fromEntries(COMPONENT_KEYS.map((k) => [k, steps[k].state])) as Record<ComponentKey, typeof steps.c1.state>;
  const end = running ? now : Math.max(...COMPONENT_KEYS.map((k) => steps[k].endedAt ?? 0), startedAt);
  const open = (k: ComponentKey) => router.push({ pathname: '/analyse/details', params: { start: k } });
  const failed = current && steps[current].state === 'failed';

  return (
    <Screen>
      <StepIndicator steps={ANALYSIS_STEPS} current={3} />
      <Text style={s.title} accessibilityRole="header">Analysing {athlete.bowler_id}</Text>
      <Text style={s.muted}>Elapsed {mmss(end - startedAt)} · you can leave this screen, it keeps running.</Text>

      <Card variant={failed ? 'glow' : 'plain'} accent={RISK.critical.color} style={{ gap: sp(2) }}>
        <PipelineStepper states={states} onPress={(k) => steps[k].state === 'done' && open(k)} />
        {current && (
          <View style={s.stage}>
            <View style={s.stageHead}>
              {failed ? <Ionicons name="close-circle" size={20} color={RISK.critical.text} /> : <View style={[s.live, { backgroundColor: COMPONENT[current].color }]} />}
              <Text style={s.stageName}>{name(current)}</Text>
              {steps[current].startedAt && <Text style={s.time}>{mmss((steps[current].endedAt ?? now) - steps[current].startedAt!)}</Text>}
            </View>
            <Text style={s.stageText}>{steps[current].text}</Text>
          </View>
        )}
      </Card>

      {failedStep && (
        <>
          <ErrorBanner title={`${name(failedStep)} stopped`} message={steps[failedStep].error ?? 'Unknown error'} />
          <PrimaryButton title="Retry this step" icon="refresh" onPress={retry} />
          <SecondaryButton title="Retake video" icon="videocam" onPress={() => { retake(); router.back(); }} />
        </>
      )}

      <View style={{ gap: sp(1) }}>
        {COMPONENT_KEYS.map((k) => {
          const st = steps[k];
          const c = COMPONENT[k];
          const done = st.state === 'done';
          return (
            <Pressable key={k} disabled={!done} onPress={() => open(k)} accessibilityRole="button"
              accessibilityLabel={`${name(k)}: ${st.state}`} style={s.row}>
              <View style={[s.dot, { backgroundColor: st.state === 'pending' ? color.surface2 : st.state === 'failed' ? alpha(RISK.critical.color, 0.2) : alpha(c.color, 0.16) }]}>
                <Ionicons name={done ? 'checkmark' : st.state === 'failed' ? 'close' : c.icon} size={18}
                  color={st.state === 'failed' ? RISK.critical.text : st.state === 'pending' ? color.muted : c.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowTitle, st.state === 'pending' && { color: color.muted }]}>{name(k)}</Text>
                <Text style={s.rowText} numberOfLines={2}>{done ? 'Done – tap to view' : st.state === 'failed' ? 'Stopped' : st.text}</Text>
              </View>
              {st.startedAt && st.endedAt ? <Text style={s.time}>{mmss(st.endedAt - st.startedAt)}</Text> : null}
              {done && <Ionicons name="chevron-forward" size={18} color={color.muted} />}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { ...font.title, color: color.text },
  muted: { ...font.body, color: color.muted },
  stage: { gap: sp(0.5), borderTopWidth: 1, borderTopColor: color.border, paddingTop: sp(1.5) },
  stageHead: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  live: { width: 10, height: 10, borderRadius: 5 },
  stageName: { ...font.overline, color: color.muted, flex: 1 },
  stageText: { ...font.h2, color: color.text },
  time: { ...font.body, color: color.muted, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.button + 2, padding: sp(1.5) },
  dot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...font.body, fontWeight: '700', color: color.text },
  rowText: { ...font.caption, color: color.muted },
});
