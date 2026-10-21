// Root navigator (ui-v2): bottom tabs in (tabs)/, first-launch flow in onboarding/, bowler screens, the guided
// analysis, and the research workspaces (capture, features, risk, reliability, plan/*) kept as stack routes.
// Every detail screen hides the tab bar (it sits above the tabs) and gets the same back button.
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AnalysisProvider } from '../src/analysis/AnalysisContext';
import { AppProvider } from '../src/shell/AppContext';
import { HeaderBack } from '../src/shell/HeaderBack';
import { SquadProvider } from '../src/shell/squad';
import { color, font, gradient } from '../src/ui';

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: color.bg, card: color.surface, border: color.border, primary: gradient.brand[1], text: color.text } };

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <AppProvider>
        <SquadProvider>
          <AnalysisProvider>
            <Stack screenOptions={{
              headerStyle: { backgroundColor: color.bg }, headerTintColor: color.text, headerShadowVisible: false,
              headerTitleStyle: { fontSize: font.h2.fontSize, fontWeight: font.h2.fontWeight },
              contentStyle: { backgroundColor: color.bg }, headerBackTitle: 'Back',
              headerLeft: () => <HeaderBack />,
            }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
              <Stack.Screen name="bowler/[id]" options={{ title: 'Bowler' }} />
              <Stack.Screen name="bowler/edit" options={{ title: 'Bowler details', presentation: 'modal', headerLeft: () => <HeaderBack icon="close" label="Close" /> }} />
              <Stack.Screen name="analyse/setup" options={{ title: 'Camera setup' }} />
              <Stack.Screen name="analyse/video" options={{ title: 'Film the delivery' }} />
              <Stack.Screen name="analyse/run" options={{ title: 'Analysing' }} />
              <Stack.Screen name="analyse/results" options={{
                title: 'Results', gestureEnabled: false, headerLeft: () => <HeaderBack icon="close" label="Close results" home />,
              }} />
              <Stack.Screen name="analyse/details" options={{ title: 'Full results' }} />
              <Stack.Screen name="capture/index" options={{ title: 'Pose capture' }} />
              <Stack.Screen name="reliability/index" options={{ title: 'Tracking reliability' }} />
              <Stack.Screen name="insights/thresholds" options={{ title: 'Joint-angle limits' }} />
              <Stack.Screen name="insights/model" options={{ title: 'How the risk score works' }} />
              <Stack.Screen name="insights/knowledge" options={{ title: 'Plan rules & sources' }} />
              <Stack.Screen name="features/index" options={{ title: 'Joint angles' }} />
              <Stack.Screen name="risk/index" options={{ title: 'Risk assessment' }} />
              <Stack.Screen name="plan" options={{ headerShown: false }} />
            </Stack>
          </AnalysisProvider>
        </SquadProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
