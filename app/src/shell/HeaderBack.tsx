// Header back button for every detail screen. Always shown, also when the page was opened directly
// (web refresh / deep link) and there is no history: then it returns to Home.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { color, type IconName } from '../ui';

export function HeaderBack({ icon = 'chevron-back', label = 'Back', home }: {
  icon?: IconName;
  label?: string;
  /** Leave the whole flow and return to the tabs instead of one step back. */
  home?: boolean;
}) {
  const router = useRouter();
  function go() {
    if (home) {
      if (router.canDismiss()) router.dismissAll();
      else router.replace('/');
    } else if (router.canGoBack()) router.back();
    else router.replace('/');
  }
  return (
    <Pressable onPress={go} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => [s.btn, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={26} color={color.text} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
});
