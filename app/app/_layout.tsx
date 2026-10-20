// Root navigator: one tab per component (app/README.md). Owners replace their placeholder screens.
import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, Tabs, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ColorValue } from 'react-native';

import { colors } from '../src/c4/theme';

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.bg, card: colors.card, border: colors.border, primary: colors.accent, text: colors.text } };

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color as string} size={size} />;

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Tabs screenOptions={{ tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.muted, headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.text }}>
        <Tabs.Screen name="index" options={{ title: 'CricShield', tabBarLabel: 'Home', tabBarIcon: icon('shield-checkmark-outline') }} />
        <Tabs.Screen name="capture/index" options={{ title: 'Capture (C1)', tabBarLabel: 'Capture', tabBarIcon: icon('videocam-outline') }} />
        <Tabs.Screen name="features/index" options={{ title: 'Biomechanics (C2)', tabBarLabel: 'Features', tabBarIcon: icon('body-outline') }} />
        <Tabs.Screen name="risk/index" options={{ title: 'Risk (C3)', tabBarLabel: 'Risk', tabBarIcon: icon('pulse-outline') }} />
        <Tabs.Screen name="plan" options={{ headerShown: false, title: 'Prevention plan', tabBarLabel: 'Plan', tabBarIcon: icon('clipboard-outline') }} />
        {/* Hidden from the tab bar but still reachable (SDK 58: href: null now redirects away). */}
        <Tabs.Screen name="reliability/index" options={{ tabBarItemStyle: { display: 'none' }, title: 'Reliability (C1)' }} />
      </Tabs>
    </ThemeProvider>
  );
}
