// Root navigator (ui-v2): bottom tabs in (tabs)/, first-launch flow in onboarding/, bowler screens,
// and every member screen (capture, features, risk, reliability, plan/*) kept as a stack route.
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProvider } from '../src/shell/AppContext';
import { SquadProvider } from '../src/shell/squad';
import { color, gradient } from '../src/ui';

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: color.bg, card: color.surface, border: color.border, primary: gradient.brand[1], text: color.text } };

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <AppProvider>
        <SquadProvider>
          <Stack screenOptions={{
            headerStyle: { backgroundColor: color.surface }, headerTintColor: color.text, headerShadowVisible: false,
            contentStyle: { backgroundColor: color.bg }, headerBackTitle: 'Back',
          }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="bowler/[id]" options={{ title: 'Bowler' }} />
            <Stack.Screen name="bowler/edit" options={{ title: 'Bowler details', presentation: 'modal' }} />
            <Stack.Screen name="capture/index" options={{ title: 'Capture (C1)' }} />
            <Stack.Screen name="reliability/index" options={{ title: 'Reliability (C1)' }} />
            <Stack.Screen name="features/index" options={{ title: 'Biomechanics (C2)' }} />
            <Stack.Screen name="risk/index" options={{ title: 'Risk (C3)' }} />
            <Stack.Screen name="plan" options={{ headerShown: false }} />
          </Stack>
        </SquadProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
