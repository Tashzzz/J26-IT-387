// Buttons: PrimaryButton (brand gradient), SecondaryButton (outline), IconButton (48px round).
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { alpha, color, font, glow, gradient, HIT, radius, sp, type IconName } from '../theme';

type BtnProps = {
  title: string;
  onPress: () => void;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Override the colour (e.g. a component colour). Primary: solid fill instead of the brand gradient. */
  tint?: string;
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({ title, onPress, icon, loading, disabled, tint, style }: BtnProps) {
  const off = disabled || loading;
  const stops = tint ? ([tint, tint] as const) : gradient.brand;
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [s.wrap, !off && glow(tint ?? gradient.brand[0], 0.7), off && s.off, pressed && s.pressed, style]}>
      <LinearGradient colors={stops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={s.btn}>
        {loading ? <ActivityIndicator color={color.onBrand} /> : (
          <>
            {icon && <Ionicons name={icon} size={18} color={color.onBrand} />}
            <Text style={[s.label, { color: color.onBrand }]}>{title}</Text>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function SecondaryButton({ title, onPress, icon, loading, disabled, tint, style }: BtnProps) {
  const off = disabled || loading;
  const c = tint ?? color.text;
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [s.wrap, s.btn, s.secondary, tint && { borderColor: alpha(tint, 0.6), backgroundColor: alpha(tint, 0.08) }, off && s.off, pressed && s.pressed, style]}>
      {loading ? <ActivityIndicator color={c} /> : (
        <>
          {icon && <Ionicons name={icon} size={18} color={c} />}
          <Text style={[s.label, { color: c }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Round icon-only button, at least 48x48. `label` is required for screen readers. */
export function IconButton({ icon, label, onPress, loading, disabled, tint = color.text, filled, size = HIT }: {
  icon: IconName;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tint?: string;
  filled?: boolean;
  size?: number;
}) {
  const off = disabled || loading;
  const d = Math.max(size, HIT);
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }} hitSlop={4}
      style={({ pressed }) => [s.icon, { width: d, height: d, borderRadius: d / 2 }, filled && { backgroundColor: alpha(tint, 0.16), borderColor: alpha(tint, 0.4) }, off && s.off, pressed && s.pressed]}>
      <View>{loading ? <ActivityIndicator color={tint} /> : <Ionicons name={icon} size={22} color={tint} />}</View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: radius.button },
  btn: { minHeight: HIT + 4, borderRadius: radius.button, paddingHorizontal: sp(2.5), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(1) },
  secondary: { borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2 },
  label: { ...font.h2, fontSize: 16, fontWeight: '800' },
  icon: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.border, backgroundColor: color.surface },
  off: { opacity: 0.45 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
