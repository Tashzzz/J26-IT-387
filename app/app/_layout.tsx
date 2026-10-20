// Root navigator. One app-wide state (current bowler, plan, server) around a stack:
//   welcome -> onboarding (create bowler profile)  ->  (tabs): Home · Analyse · Risk · Plan · Profile
// Detail screens (workload log, why-this, plan history, feedback, bowlers, settings) are pushed on top.
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProvider } from '../src/state/AppContext';
import { colors } from '../src/ui/theme';

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.surface, border: colors.border, primary: colors.primary, text: colors.text },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <AppProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerShadowVisible: false,
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.text, fontWeight: '700' },
            headerBackTitle: 'Back',
            contentStyle: { backgroundColor: colors.bg },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="bowlers" options={{ title: 'Bowlers' }} />
          <Stack.Screen name="bowler" options={{ title: 'Bowler profile' }} />
          <Stack.Screen name="workload" options={{ title: 'Workload log' }} />
          <Stack.Screen name="why/[ruleId]" options={{ title: 'Why this action?' }} />
          <Stack.Screen name="plan-history" options={{ title: 'Plan history' }} />
          <Stack.Screen name="feedback" options={{ title: 'Review this plan', presentation: 'modal' }} />
          <Stack.Screen name="reliability" options={{ title: 'Camera setup guide' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      </AppProvider>
    </ThemeProvider>
  );
}
