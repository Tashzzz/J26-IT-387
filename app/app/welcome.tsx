// First launch: what CricShield does, then straight into setting up the bowler profile.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '../src/state/AppContext';
import { Banner, Body, Button } from '../src/ui/components';
import { colors, radius } from '../src/ui/theme';

const POINTS = [
  { icon: 'videocam-outline', title: 'Film one delivery', text: 'Use any smartphone. We track the bowling action frame by frame.' },
  { icon: 'pulse-outline', title: 'See the injury risk', text: 'Technique, workload and history combined into one clear risk score.' },
  { icon: 'clipboard-outline', title: 'Get a safe plan', text: 'Daily overs, rest and exercises — each with the reason behind it.' },
] as const;

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { athletes, online } = useApp();

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 32 }]}>
        <View style={s.inner}>
          <View style={s.logo}><Ionicons name="shield-checkmark" size={34} color={colors.onNavy} /></View>
          <Text style={s.brand}>CricShield</Text>
          <Text style={s.headline}>Keep your fast bowlers fit and bowling.</Text>
          <Text style={s.lead}>Injury-risk screening and prevention for school, club and provincial fast bowlers — using just a phone.</Text>

          <View style={s.points}>
            {POINTS.map((p) => (
              <View key={p.title} style={s.point}>
                <View style={s.pointIcon}><Ionicons name={p.icon} size={22} color={colors.onNavy} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.pointTitle}>{p.title}</Text>
                  <Text style={s.pointText}>{p.text}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={s.inner}>
          {online === false && (
            <Banner tone="warn" icon="cloud-offline-outline" title="Can’t reach the CricShield server" action="Connection settings" onAction={() => router.push('/settings')}>
              <Body muted>You need a connection to create a profile.</Body>
            </Banner>
          )}
          <Button title="Set up a bowler profile" icon="arrow-forward" variant="light" onPress={() => router.push('/onboarding')} />
          {athletes.length > 0 && (
            <Button title="Choose an existing profile" variant="onDark" onPress={() => router.push({ pathname: '/onboarding', params: { mode: 'pick' } })} />
          )}
          <Text style={s.legal}>Screening and decision support only — not a medical diagnosis.</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  content: { paddingHorizontal: 24, paddingBottom: 24 },
  inner: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 12 },
  logo: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  brand: { color: colors.onNavyMuted, fontSize: 15, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 },
  headline: { color: colors.onNavy, fontSize: 32, fontWeight: '800', letterSpacing: -0.6, lineHeight: 38 },
  lead: { color: colors.onNavyMuted, fontSize: 16, lineHeight: 24 },
  points: { gap: 18, marginTop: 20 },
  point: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  pointIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.navySoft, alignItems: 'center', justifyContent: 'center' },
  pointTitle: { color: colors.onNavy, fontSize: 17, fontWeight: '700' },
  pointText: { color: colors.onNavyMuted, fontSize: 14, lineHeight: 20, marginTop: 2 },
  footer: { paddingHorizontal: 24, paddingTop: 16 },
  legal: { color: colors.onNavyMuted, fontSize: 12, textAlign: 'center', marginTop: 4 },
});
