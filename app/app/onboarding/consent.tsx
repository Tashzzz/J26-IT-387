// Data & consent: how CricShield handles bowler data; the coach confirms consent before continuing.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ONBOARDING_STEPS } from '../../src/shell/onboarding';
import {
  alpha, color, font, GradientHeader, gradient, PrimaryButton, radius, RISK, Screen, SecondaryButton, sp, StepIndicator, type IconName,
} from '../../src/ui';

const POINTS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'finger-print', title: 'Anonymous codes, never names', text: 'Each bowler is a code like B03. Keep the code list that links codes to names off this phone.' },
  { icon: 'desktop', title: 'Videos stay on the team computer', text: 'Clips are processed by the CricShield backend on your own computer over Wi-Fi. Nothing is uploaded to the cloud.' },
  { icon: 'document-text', title: 'Consent first', text: 'Film and record only bowlers who agreed to take part - and, for under-18s, whose parent or guardian agreed too.' },
  { icon: 'medkit', title: 'Support, not diagnosis', text: 'Risk scores and plans help you decide; a physiotherapist makes clinical decisions.' },
];

export default function Consent() {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  return (
    <Screen safeTop>
      <StepIndicator steps={ONBOARDING_STEPS} current={1} />
      <GradientHeader title="Data & consent" subtitle="How CricShield looks after your bowlers' data." icon="lock-closed" />

      {POINTS.map((p) => (
        <View key={p.title} style={s.point}>
          <View style={s.icon}><Ionicons name={p.icon} size={22} color={gradient.brand[1]} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.title}>{p.title}</Text>
            <Text style={s.text}>{p.text}</Text>
          </View>
        </View>
      ))}

      <Pressable onPress={() => setOk(!ok)} accessibilityRole="checkbox" accessibilityState={{ checked: ok }}
        style={[s.check, ok && { borderColor: RISK.low.color, backgroundColor: alpha(RISK.low.color, 0.1) }]}>
        <Ionicons name={ok ? 'checkbox' : 'square-outline'} size={26} color={ok ? RISK.low.color : color.muted} />
        <Text style={s.checkText}>I confirm consent has been obtained for every bowler I will add.</Text>
      </Pressable>

      <PrimaryButton title="Continue" icon="arrow-forward" disabled={!ok} onPress={() => router.push('/onboarding/coach')} />
      <SecondaryButton title="Back" onPress={() => router.back()} />
    </Screen>
  );
}

const s = StyleSheet.create({
  point: { flexDirection: 'row', gap: sp(1.5), backgroundColor: color.surface, borderRadius: radius.card, borderWidth: 1, borderColor: color.border, padding: sp(2) },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: alpha(gradient.brand[1], 0.14), alignItems: 'center', justifyContent: 'center' },
  title: { ...font.h2, color: color.text },
  text: { ...font.body, color: color.muted },
  check: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), borderWidth: 1, borderColor: color.border, borderRadius: radius.button, padding: sp(2), minHeight: 56 },
  checkText: { ...font.body, color: color.text, flex: 1, fontWeight: '700' },
});
