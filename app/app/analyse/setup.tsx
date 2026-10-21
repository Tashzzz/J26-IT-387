// Analysis step 2 - camera setup: four view cards (diagram + what you will see), distance, how well that
// position tracks the body (C1 reliability study), and a filming checklist.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAnalysis } from '../../src/analysis/AnalysisContext';
import { studyForSetup } from '../../src/analysis/reliability';
import { c1 } from '../../src/api/c1';
import type { CameraDistance, Reliability } from '../../src/c1/types';
import {
  alpha, BodyReliabilityMap, CAMERA_VIEW, CameraSetupDiagram, CameraViewPreview, Card, ChipGroup, color, COMPONENT, EmptyState, font,
  PrimaryButton, radius, RISK, Screen, Skeleton, sp, StepIndicator, useResearchMode, type CameraView,
} from '../../src/ui';
import { ANALYSIS_STEPS } from '../../src/analysis/steps';

const VIEWS: CameraView[] = ['side', 'semi_side', 'front', 'rear'];
const DISTANCES: CameraDistance[] = [4, 5, 6, 10];
const CHECKLIST = [
  'Only the bowler in the frame',
  'Whole body visible, run-up to follow-through',
  'Phone held landscape',
  '60 fps slow-mo if the phone has it',
  'Phone steady at hip height',
];
const C1 = COMPONENT.c1.color;

export default function CameraSetup() {
  const router = useRouter();
  const { athlete, angle, distance, setSetup } = useAnalysis();
  const [rel, setRel] = useState<Reliability | null | 'error'>(null);
  const [ticks, setTicks] = useState<boolean[]>(CHECKLIST.map(() => false));
  const research = useResearchMode();

  useEffect(() => { c1.reliability().then(setRel, () => setRel('error')); }, []);

  if (!athlete) {
    return <Screen><EmptyState spot="squad" title="Pick a bowler first" text="Every analysis is saved to one bowler." actionTitle="Choose bowler" onAction={() => router.replace('/analyse')} /></Screen>;
  }

  const study = angle && rel && rel !== 'error' ? studyForSetup(rel, angle, distance) : null;

  return (
    <Screen>
      <StepIndicator steps={ANALYSIS_STEPS} current={1} />
      <Text style={s.title}>Where will you film {athlete.bowler_id}?</Text>

      <ChipGroup label="Distance from the bowler" value={distance} tint={C1}
        onChange={(d) => setSetup(angle, d)} options={DISTANCES.map((d) => ({ value: d, label: `${d} m` }))} />

      {VIEWS.map((v) => {
        const on = angle === v;
        return (
          <Pressable key={v} onPress={() => setSetup(v, distance)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            accessibilityLabel={`${CAMERA_VIEW[v].label}. ${CAMERA_VIEW[v].hint}`}
            style={[s.option, on && { borderColor: C1, backgroundColor: alpha(C1, 0.06) }]}>
            <View style={s.optionHead}>
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? C1 : color.muted} />
              <Text style={[s.optionTitle, on && { color: C1 }]}>{CAMERA_VIEW[v].label}</Text>
            </View>
            <Text style={s.body}>{CAMERA_VIEW[v].hint}</Text>
            <View style={s.pics}>
              <View style={{ flex: 2 }}><CameraSetupDiagram angle={v} distance={distance} caption={false} /></View>
              <View style={{ flex: 3, justifyContent: 'center' }}><CameraViewPreview angle={v} caption={false} /></View>
            </View>
            <Text style={s.muted}>{CAMERA_VIEW[v].sees}</Text>
          </Pressable>
        );
      })}

      <Card>
        <Text style={s.h2}>How well this position tracks the body</Text>
        {!angle ? <Text style={s.muted}>Choose a camera view to see which body parts are tracked reliably from there.</Text>
          : rel === null ? <Skeleton height={200} />
          : rel === 'error' ? <Text style={s.muted}>This could not be loaded from the team computer. You can still continue.</Text>
          : study ? (
            <>
              <Text style={s.muted}>Closest tested position: {study.label} · {study.usable} of {study.total} body points tracked reliably{research ? ` (ICC ≥ ${rel.gate})` : ''}.</Text>
              <BodyReliabilityMap regions={study.regions} />
            </>
          ) : (
            <View style={s.untested}>
              <Ionicons name="help-circle" size={22} color={RISK.moderate.color} />
              <Text style={[s.body, { flex: 1 }]}>This position hasn't been tested yet, so results will be marked unverified.</Text>
            </View>
          )}
      </Card>

      <Card>
        <Text style={s.h2}>Filming checklist</Text>
        {CHECKLIST.map((item, i) => (
          <Pressable key={item} onPress={() => setTicks((t) => t.map((x, k) => (k === i ? !x : x)))}
            accessibilityRole="checkbox" accessibilityState={{ checked: ticks[i] }} style={s.check}>
            <Ionicons name={ticks[i] ? 'checkbox' : 'square-outline'} size={24} color={ticks[i] ? RISK.low.color : color.muted} />
            <Text style={[s.body, { flex: 1 }, ticks[i] && { color: color.muted, textDecorationLine: 'line-through' }]}>{item}</Text>
          </Pressable>
        ))}
      </Card>

      <PrimaryButton title={angle ? 'Next: video' : 'Choose a camera view'} icon="arrow-forward" disabled={!angle}
        onPress={() => router.push('/analyse/video')} />
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { ...font.title, color: color.text },
  h2: { ...font.h2, color: color.text },
  body: { ...font.body, color: color.text },
  muted: { ...font.body, color: color.muted },
  option: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.card, padding: sp(2), gap: sp(1) },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  optionTitle: { ...font.h2, color: color.text },
  pics: { flexDirection: 'row', gap: sp(1.5), alignItems: 'center' },
  untested: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  check: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), minHeight: 44 },
});
