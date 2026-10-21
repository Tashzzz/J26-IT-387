// Welcome: benefit-led hero (logo, big promise, illustration), the four steps in coach words, three benefits
// and one action. No research components here - those live behind Research mode.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import {
  alpha, color, COMPONENT, COMPONENT_KEYS, font, gradient, PrimaryButton, Screen, sp, WelcomeIllustration, Wordmark, type IconName,
} from '../../src/ui';

const BENEFITS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'videocam', title: 'Just a phone video', text: 'Film one delivery at the nets. No sensors, no lab.' },
  { icon: 'body', title: 'See the action', text: 'A skeleton replay and the key angles at foot contact and release.' },
  { icon: 'shield-checkmark', title: 'Act before an injury', text: 'A clear risk level and a week’s plan you can follow.' },
];

export default function Welcome() {
  const router = useRouter();
  return (
    <Screen safeTop style={s.page}>
      <Wordmark size={36} />

      <View style={s.hero}>
        <Text style={s.title} accessibilityRole="header">Safer fast bowling, from one phone video</Text>
        <Text style={s.promise}>Spot injury risk early and know exactly what to change this week.</Text>
      </View>

      <WelcomeIllustration />

      <View style={s.flow} accessible accessibilityLabel={COMPONENT_KEYS.map((k) => COMPONENT[k].step).join(', then ')}>
        {COMPONENT_KEYS.map((k, i) => (
          <View key={k} style={s.flowItem}>
            <Text style={s.flowText}>{COMPONENT[k].step}</Text>
            {i < COMPONENT_KEYS.length - 1 && <Ionicons name="arrow-forward" size={14} color={gradient.brand[1]} />}
          </View>
        ))}
      </View>

      <View style={s.benefits}>
        {BENEFITS.map((b) => (
          <View key={b.title} style={s.benefit}>
            <View style={s.icon}><Ionicons name={b.icon} size={22} color={gradient.brand[1]} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.bTitle}>{b.title}</Text>
              <Text style={s.bText}>{b.text}</Text>
            </View>
          </View>
        ))}
      </View>

      <PrimaryButton title="Get started" icon="arrow-forward" onPress={() => router.push('/onboarding/consent')} />
      <Text style={s.foot}>Takes about a minute. Your data stays on your team computer.</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingTop: sp(3) },
  hero: { gap: sp(1), marginTop: sp(2) },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.6, color: color.text },
  promise: { ...font.body, fontSize: 17, lineHeight: 24, color: color.muted },
  flow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: sp(1), rowGap: 4 },
  flowItem: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  flowText: { ...font.caption, fontWeight: '700', color: color.text },
  benefits: { gap: sp(1.5), marginTop: sp(1) },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5) },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: alpha(gradient.brand[1], 0.12), alignItems: 'center', justifyContent: 'center' },
  bTitle: { ...font.h2, color: color.text },
  bText: { ...font.body, color: color.muted },
  foot: { ...font.caption, color: color.muted, textAlign: 'center' },
});
