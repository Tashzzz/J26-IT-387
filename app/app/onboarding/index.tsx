// Welcome: hero + the four research components as a pipeline.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import {
  alpha, color, COMPONENT, COMPONENT_KEYS, font, glow, gradient, PrimaryButton, radius, Screen, sp, StepIndicator, type ComponentKey,
} from '../../src/ui';
import { ONBOARDING_STEPS } from '../../src/shell/onboarding';

const STORY: Record<ComponentKey, { title: string; text: string }> = {
  c1: { title: 'Pose from video', text: 'Finds 33 body points in a phone video of one delivery.' },
  c2: { title: 'Bowling biomechanics', text: 'Measures joint angles at foot contact and release against published limits.' },
  c3: { title: 'Injury risk', text: 'Combines technique, workload and history into a risk score you can question.' },
  c4: { title: 'Prevention plan', text: 'Turns the risk into a week of limits, exercises and, if needed, a physio referral.' },
};

export default function Welcome() {
  const router = useRouter();
  return (
    <Screen safeTop>
      <LinearGradient colors={gradient.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.hero, glow(gradient.brand[0], 1.2)]}>
        <View style={s.brandRow}>
          <View style={s.badge}><Ionicons name="shield-checkmark" size={30} color={gradient.brand[0]} /></View>
          <Text style={s.brand}>CricShield</Text>
        </View>
        <Text style={s.title}>From one phone video to a safer bowling week</Text>
        <Text style={s.sub}>Injury-risk support for school and club fast bowlers, built for coaches and physios at the nets.</Text>
      </LinearGradient>

      <StepIndicator steps={ONBOARDING_STEPS} current={0} />

      {COMPONENT_KEYS.map((k, i) => {
        const c = COMPONENT[k];
        return (
          <View key={k}>
            <View style={[s.card, { borderColor: alpha(c.color, 0.45) }]}>
              <View style={[s.icon, { backgroundColor: alpha(c.color, 0.16) }]}><Ionicons name={c.icon} size={24} color={c.color} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.code, { color: c.color }]}>{c.code} · {c.label.toUpperCase()}</Text>
                <Text style={s.cardTitle}>{STORY[k].title}</Text>
                <Text style={s.cardText}>{STORY[k].text}</Text>
              </View>
            </View>
            {i < 3 && <Ionicons name="arrow-down" size={18} color={COMPONENT[COMPONENT_KEYS[i + 1]].color} style={s.arrow} />}
          </View>
        );
      })}

      <PrimaryButton title="Get started" icon="arrow-forward" onPress={() => router.push('/onboarding/consent')} />
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: radius.card + 4, padding: sp(3), gap: sp(1.5) },
  badge: { width: 56, height: 56, borderRadius: 18, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  brand: { ...font.caption, fontWeight: '800', letterSpacing: 2, color: gradient.brand[1], textTransform: 'uppercase', backgroundColor: color.bg, borderRadius: 999, paddingHorizontal: sp(1.5), paddingVertical: 6, overflow: 'hidden' },
  title: { ...font.display, color: color.onBrand },
  sub: { ...font.body, color: color.onBrand },
  card: { flexDirection: 'row', gap: sp(1.5), alignItems: 'center', backgroundColor: color.surface, borderWidth: 1, borderRadius: radius.card, padding: sp(2) },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  code: { ...font.caption, fontWeight: '800', letterSpacing: 1 },
  cardTitle: { ...font.h2, color: color.text },
  cardText: { ...font.body, color: color.muted },
  arrow: { alignSelf: 'center', marginTop: sp(1) },
});
