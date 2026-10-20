// States: EmptyState, ErrorBanner, Skeleton.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { alpha, color, font, gradient, radius, RISK, sp, type IconName } from '../theme';
import { PrimaryButton, SecondaryButton } from './buttons';

/** Icon in a gradient circle + title + text + optional action. */
export function EmptyState({ icon, title, text, actionTitle, onAction, tint }: {
  icon: IconName;
  title: string;
  text?: string;
  actionTitle?: string;
  onAction?: () => void;
  tint?: string;
}) {
  const stops = tint ? ([tint, alpha(tint, 0.45)] as const) : gradient.brand;
  return (
    <View style={s.empty}>
      <LinearGradient colors={stops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.emptyCircle}>
        <Ionicons name={icon} size={34} color={color.onBrand} />
      </LinearGradient>
      <Text style={s.emptyTitle}>{title}</Text>
      {text ? <Text style={s.emptyText}>{text}</Text> : null}
      {actionTitle && onAction ? <PrimaryButton title={actionTitle} onPress={onAction} tint={tint} style={{ alignSelf: 'stretch', marginTop: sp(1) }} /> : null}
    </View>
  );
}

/** Error message with optional retry. */
export function ErrorBanner({ message, title = 'Something went wrong', onRetry, retrying }: {
  message: string;
  title?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const c = RISK.critical;
  return (
    <View style={[s.banner, { borderColor: alpha(c.color, 0.55), backgroundColor: alpha(c.color, 0.1) }]} accessibilityRole="alert">
      <View style={s.bannerRow}>
        <Ionicons name="cloud-offline" size={22} color={c.text} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.bannerTitle, { color: c.text }]}>{title}</Text>
          <Text style={s.bannerText}>{message}</Text>
        </View>
      </View>
      {onRetry ? <SecondaryButton title="Try again" icon="refresh" onPress={onRetry} loading={retrying} tint={c.text} /> : null}
    </View>
  );
}

/** Pulsing placeholder block while content loads. */
export function Skeleton({ width = '100%', height = 16, round = 8, style }: {
  width?: DimensionValue;
  height?: number;
  round?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.4, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View accessibilityLabel="Loading" style={[{ width, height, borderRadius: round, backgroundColor: color.surface2, opacity: v }, style]} />;
}

const s = StyleSheet.create({
  empty: { alignItems: 'center', gap: sp(1), paddingVertical: sp(4), paddingHorizontal: sp(2) },
  emptyCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: sp(1) },
  emptyTitle: { ...font.h2, color: color.text, textAlign: 'center' },
  emptyText: { ...font.body, color: color.muted, textAlign: 'center' },
  banner: { borderWidth: 1, borderRadius: radius.card, padding: sp(2), gap: sp(1.5) },
  bannerRow: { flexDirection: 'row', gap: sp(1.5), alignItems: 'flex-start' },
  bannerTitle: { ...font.h2 },
  bannerText: { ...font.body, color: color.text },
});
