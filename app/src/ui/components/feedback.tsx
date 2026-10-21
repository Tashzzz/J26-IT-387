// States: EmptyState, ErrorBanner, Skeleton (+ SkeletonCard for list rows).
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { Spot, type SpotKind } from '../illustrations/Spot';
import { alpha, color, font, radius, RISK, sp, type IconName } from '../theme';
import { PrimaryButton, SecondaryButton } from './buttons';

/** Illustration + title + one line + at most one action. `icon` is used only when no illustration fits. */
export function EmptyState({ spot, icon, title, text, actionTitle, onAction }: {
  spot?: SpotKind;
  icon?: IconName;
  title: string;
  text?: string;
  actionTitle?: string;
  onAction?: () => void;
  /** Kept for older callers; empty states are neutral now. */
  tint?: string;
}) {
  return (
    <View style={s.empty}>
      {spot ? <Spot kind={spot} /> : (
        <View style={s.emptyCircle}><Ionicons name={icon ?? 'sparkles-outline'} size={32} color={color.muted} /></View>
      )}
      <Text style={s.emptyTitle}>{title}</Text>
      {text ? <Text style={s.emptyText}>{text}</Text> : null}
      {actionTitle && onAction ? <PrimaryButton title={actionTitle} onPress={onAction} style={s.emptyAction} /> : null}
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

/** Placeholder shaped like a list row (avatar + two lines + tag) or a plain block. */
export function SkeletonCard({ height, avatar = true }: { height?: number; avatar?: boolean }) {
  if (height) return <Skeleton height={height} round={radius.card} />;
  return (
    <View style={s.skCard} accessibilityLabel="Loading">
      {avatar && <Skeleton width={48} height={48} round={24} />}
      <View style={{ flex: 1, gap: sp(1) }}>
        <Skeleton width="40%" height={16} />
        <Skeleton width="75%" height={12} />
      </View>
      <Skeleton width={56} height={24} round={12} />
    </View>
  );
}

const s = StyleSheet.create({
  empty: { alignItems: 'center', gap: sp(1), paddingVertical: sp(3), paddingHorizontal: sp(2) },
  emptyCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: sp(1), backgroundColor: color.surface2 },
  emptyAction: { alignSelf: 'center', minWidth: 220, marginTop: sp(1) },
  skCard: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: radius.card, padding: sp(1.5) },
  emptyTitle: { ...font.h2, color: color.text, textAlign: 'center' },
  emptyText: { ...font.body, color: color.muted, textAlign: 'center', maxWidth: 360 },
  banner: { borderWidth: 1, borderRadius: radius.card, padding: sp(2), gap: sp(1.5) },
  bannerRow: { flexDirection: 'row', gap: sp(1.5), alignItems: 'flex-start' },
  bannerTitle: { ...font.h2 },
  bannerText: { ...font.body, color: color.text },
});
