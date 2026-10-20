// Home: the whole CricShield story on one screen (C1 -> C2 -> C3 -> C4).
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../src/c4/theme';
import { Body, Card, H, Screen } from '../src/c4/ui';

const STEPS = [
  { c: 'C1', title: 'Pose estimation', text: '33 keypoints from smartphone video, reliability-tagged', icon: 'videocam-outline', href: '/capture' },
  { c: 'C2', title: 'Biomechanics', text: 'Joint angles mapped to published injury thresholds', icon: 'body-outline', href: '/features' },
  { c: 'C3', title: 'Risk classifier', text: 'XGBoost + LSTM risk score with SHAP factors', icon: 'pulse-outline', href: '/risk' },
  { c: 'C4', title: 'Prevention plan', text: 'Personalised, explained actions + physio referral', icon: 'clipboard-outline', href: '/plan' },
] as const;

export default function Home() {
  const router = useRouter();
  return (
    <Screen>
      <Card>
        <Text style={s.title}>From video to a safer week of bowling</Text>
        <Body muted>Injury risk prediction and prevention for school and club fast bowlers, using only a smartphone.</Body>
      </Card>
      <H>How it fits together</H>
      {STEPS.map((st, i) => (
        <View key={st.c}>
          <Pressable onPress={() => router.push(st.href)} accessibilityRole="button"
            style={({ pressed }) => [s.step, pressed && { opacity: 0.7 }]}>
            <View style={s.code}><Text style={s.codeText}>{st.c}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.stepTitle}>{st.title}</Text>
              <Text style={s.stepText}>{st.text}</Text>
            </View>
            <Ionicons name={st.icon} size={22} color={colors.accent} />
          </Pressable>
          {i < STEPS.length - 1 && <Ionicons name="arrow-down" size={18} color={colors.muted} style={{ alignSelf: 'center', marginVertical: 4 }} />}
        </View>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14 },
  code: { width: 42, height: 42, borderRadius: 10, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center' },
  codeText: { color: colors.accent, fontWeight: '800' },
  stepTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  stepText: { color: colors.muted, fontSize: 13, marginTop: 2 },
});
