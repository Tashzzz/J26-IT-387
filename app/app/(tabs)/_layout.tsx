// Bottom tabs: Home · Squad · Analyse (raised gradient button) · Insights · Settings.
// Until first-launch setup is finished, every tab redirects to the onboarding flow.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect } from 'expo-router';
import { Tabs, type BottomTabBarButtonProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '../../src/shell/AppContext';
import { color, glow, gradient, type IconName } from '../../src/ui';

const icon = (name: IconName, active: IconName) => ({ color: c, size, focused }: { color: string; size: number; focused: boolean }) =>
  <Ionicons name={focused ? active : name} color={c} size={size} />;

function AnalyseButton({ onPress, accessibilityState }: BottomTabBarButtonProps) {
  return (
    <View style={s.fabSlot} pointerEvents="box-none">
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Analyse a delivery" accessibilityState={accessibilityState}
        style={({ pressed }) => [s.fabWrap, glow(gradient.brand[0], 1.1), pressed && { transform: [{ scale: 0.95 }] }]}>
        <LinearGradient colors={gradient.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.fab}>
          <Ionicons name="videocam" size={28} color={color.onBrand} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const { ready, onboarded } = useApp();
  const insets = useSafeAreaInsets();
  if (!ready) return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: gradient.brand[1],
      tabBarInactiveTintColor: color.muted,
      tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.border, height: 64 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 6 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      sceneStyle: { backgroundColor: color.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="squad" options={{ title: 'Squad', tabBarIcon: icon('people-outline', 'people') }} />
      <Tabs.Screen name="analyse" options={{ title: 'Analyse', tabBarLabel: () => null, tabBarButton: (p) => <AnalyseButton {...p} /> }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: icon('stats-chart-outline', 'stats-chart') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings-outline', 'settings') }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  fabSlot: { flex: 1, alignItems: 'center' },
  fabWrap: { marginTop: -26, borderRadius: 34 },
  fab: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: color.bg },
});
