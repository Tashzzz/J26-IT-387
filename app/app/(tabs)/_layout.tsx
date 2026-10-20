// Main tabs. First launch goes to the welcome + profile set-up before any tab is shown.
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { ColorValue } from 'react-native';

import { useApp } from '../../src/state/AppContext';
import { Loading } from '../../src/ui/components';
import { colors } from '../../src/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (off: IconName, on: IconName) => ({ color, focused }: { color: ColorValue; focused: boolean }) =>
  <Ionicons name={focused ? on : off} color={color as string} size={24} />;

export default function TabsLayout() {
  const { ready, onboarded } = useApp();

  if (!ready) {
    return (
      <View style={s.splash}>
        <View style={s.logo}><Ionicons name="shield-checkmark" size={36} color={colors.onNavy} /></View>
        <Text style={s.brand}>CricShield</Text>
        <Loading text="Getting things ready…" />
      </View>
    );
  }
  if (!onboarded) return <Redirect href="/welcome" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="analyse" options={{ title: 'Analyse', tabBarIcon: icon('videocam-outline', 'videocam') }} />
      <Tabs.Screen name="risk" options={{ title: 'Risk', tabBarIcon: icon('pulse-outline', 'pulse') }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: icon('clipboard-outline', 'clipboard') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  logo: { width: 72, height: 72, borderRadius: 22, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 24, fontWeight: '800', color: colors.text },
});
