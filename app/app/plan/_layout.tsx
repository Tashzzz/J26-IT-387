// C4 (Rathnayaka) - stack of prevention-plan screens sharing one state provider.
import { Stack } from 'expo-router';

import { C4Provider } from '../../src/c4/C4Context';
import { HeaderBack } from '../../src/shell/HeaderBack';
import { colors } from '../../src/c4/theme';

export default function PlanLayout() {
  return (
    <C4Provider>
      <Stack screenOptions={{ headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.bg }, headerShadowVisible: false, headerLeft: () => <HeaderBack /> }}>
        <Stack.Screen name="index" options={{ title: 'Prevention plan' }} />
        <Stack.Screen name="why/[ruleId]" options={{ title: 'Why this?' }} />
        <Stack.Screen name="workload" options={{ title: 'Workload log' }} />
        <Stack.Screen name="profile" options={{ title: 'Bowler inputs' }} />
        <Stack.Screen name="history" options={{ title: 'Plan history' }} />
        <Stack.Screen name="feedback" options={{ title: 'Coach feedback', presentation: 'modal', headerLeft: () => <HeaderBack icon="close" label="Close" /> }} />
      </Stack>
    </C4Provider>
  );
}
