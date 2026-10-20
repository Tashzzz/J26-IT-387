// First-launch flow: Welcome -> Data & consent -> Coach setup -> First bowler -> Home.
import { Stack } from 'expo-router';

import { color } from '../../src/ui';

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: 'slide_from_right' }} />;
}
