// Page scaffolding: Screen, GradientHeader, Card.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { alpha, color, COMPONENT, font, glow, gradient, radius, sp, type ComponentKey, type IconName } from '../theme';

/**
 * Safe-area page. Scrolls by default; pass onRefresh for pull-to-refresh (spinner shows until the promise settles).
 * safeTop: set on screens without a navigator header.
 */
export function Screen({ children, scroll = true, onRefresh, safeTop, style }: {
  children: React.ReactNode;
  scroll?: boolean;
  onRefresh?: () => unknown;
  safeTop?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  }, [onRefresh]);

  const edges: Edge[] = safeTop ? ['top', 'left', 'right'] : ['left', 'right'];
  return (
    <SafeAreaView edges={edges} style={s.screen}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[s.content, style]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={gradient.brand[1]} colors={[...gradient.brand]} progressBackgroundColor={color.surface} />
          ) : undefined}
        >
          <View style={s.inner}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[s.content, s.fill, style]}><View style={[s.inner, s.fill]}>{children}</View></View>
      )}
    </SafeAreaView>
  );
}

/** Hero header. With `component` it uses that component's colour and icon; otherwise the brand gradient. */
export function GradientHeader({ title, subtitle, component, icon, right }: {
  title: string;
  subtitle?: string;
  component?: ComponentKey;
  icon?: IconName;
  right?: React.ReactNode;
}) {
  const c = component ? COMPONENT[component] : null;
  const stops = c ? ([alpha(c.color, 0.35), alpha(c.color, 0.04)] as const) : ([alpha(gradient.brand[0], 0.4), alpha(gradient.brand[1], 0.12)] as const);
  const ic = icon ?? c?.icon;
  return (
    <LinearGradient colors={stops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { borderColor: c ? alpha(c.color, 0.4) : color.border }]}>
      <View style={s.headerRow}>
        {ic && (
          <View style={[s.headerIcon, { backgroundColor: alpha(c?.color ?? gradient.brand[1], 0.18) }]}>
            <Ionicons name={ic} size={22} color={c?.color ?? gradient.brand[1]} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          {c && <Text style={[s.headerKicker, { color: c.color }]}>{c.code} · {c.label.toUpperCase()}</Text>}
          <Text style={s.headerTitle} accessibilityRole="header">{title}</Text>
        </View>
        {right}
      </View>
      {subtitle ? <Text style={s.headerSub}>{subtitle}</Text> : null}
    </LinearGradient>
  );
}

/** Surface card. variant "glow" adds an accent border + coloured shadow (accent defaults to brand). */
export function Card({ children, variant = 'plain', accent, style }: {
  children: React.ReactNode;
  variant?: 'plain' | 'glow';
  accent?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const a = accent ?? gradient.brand[0];
  return (
    <View style={[s.card, variant === 'glow' && [{ borderColor: alpha(a, 0.55) }, glow(a, 0.8)], style]}>{children}</View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { padding: sp(2), paddingBottom: sp(6) },
  fill: { flex: 1 },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: sp(2) },
  header: { borderRadius: radius.card, borderWidth: 1, padding: sp(2.5), gap: sp(1) },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5) },
  headerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerKicker: { ...font.caption, fontWeight: '800', letterSpacing: 1 },
  headerTitle: { ...font.title, color: color.text },
  headerSub: { ...font.body, color: color.muted },
  card: { backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: radius.card, padding: sp(2), gap: sp(1) },
});
