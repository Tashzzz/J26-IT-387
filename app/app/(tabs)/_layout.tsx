// Bottom tabs: Home · Squad · Analyse (gradient button) · Insights · Settings.
// The bar has a fixed height (64 + bottom safe area) and the Analyse button sits fully inside it, so nothing
// overhangs or gets clipped at any window size on web. Until first-launch setup is finished, every tab
// redirects to the onboarding flow.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect } from 'expo-router';
import { Tabs, type BottomTabBarButtonProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '../../src/shell/AppContext';
import { color, gradient, Splash, type IconName } from '../../src/ui';

const BAR = 64;

const icon = (name: IconName, active: IconName) => ({ color: c, size, focused }: { color: ColorValue; size: number; focused: boolean }) =>
  <Ionicons name={focused ? active : name} color={c as string} size={size} />;

function AnalyseButton({ onPress, accessibilityState }: BottomTabBarButtonProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Analyse a delivery" accessibilityState={accessibilityState}
      style={({ pressed }) => [s.slot, pressed && { opacity: 0.85 }]}>
      <LinearGradient colors={gradient.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.fab}>
        <Ionicons name="videocam" size={22} color={color.onBrand} />
      </LinearGradient>
      <Text style={s.fabLabel}>Analyse</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const { ready, onboarded } = useApp();
  const insets = useSafeAreaInsets();
  if (!ready) return <Splash />;
  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: gradient.brand[1],
      tabBarInactiveTintColor: color.muted,
      tabBarStyle: {
        backgroundColor: color.surface, borderTopColor: color.border, borderTopWidth: 1,
        height: BAR + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 6,
      },
      tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
      tabBarLabelPosition: 'below-icon',
      sceneStyle: { backgroundColor: color.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="squad" options={{ title: 'Squad', tabBarIcon: icon('people-outline', 'people') }} />
      <Tabs.Screen name="analyse" options={{ title: 'Analyse', tabBarButton: (p) => <AnalyseButton {...p} /> }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: icon('stats-chart-outline', 'stats-chart') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings-outline', 'settings') }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  fab: { width: 52, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  fabLabel: { fontSize: 12, fontWeight: '700', color: color.text },
});
