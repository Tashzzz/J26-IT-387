// Page scaffolding: Screen, GradientHeader (page title), SectionTitle, Card.
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useResearchMode } from '../prefs';
import { alpha, color, COMPONENT, font, gradient, layout, radius, sp, type ComponentKey, type IconName } from '../theme';

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

/**
 * Page title block: optional small icon, title, one-line subtitle. Neutral by default: `tint` only colours the
 * icon (e.g. a bowler's risk colour). The "C2 · BIOMECHANICS" kicker appears in Research mode only.
 * (Named GradientHeader for older callers; it no longer draws a gradient box.)
 */
export function GradientHeader({ title, subtitle, component, icon, tint, right, children }: {
  title: string;
  subtitle?: string;
  component?: ComponentKey;
  icon?: IconName;
  tint?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const research = useResearchMode();
  const c = component ? COMPONENT[component] : null;
  const hue = tint ?? c?.color ?? gradient.brand[1];
  const ic = icon ?? c?.icon;
  return (
    <View style={s.header}>
      <View style={s.headerRow}>
        {ic && (
          <View style={[s.headerIcon, { backgroundColor: alpha(hue, 0.14) }]}>
            <Ionicons name={ic} size={20} color={hue} />
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          {c && research && <Text style={[s.headerKicker, { color: c.color }]}>{c.code} · {c.label}</Text>}
          <Text style={s.headerTitle} accessibilityRole="header">{title}</Text>
        </View>
        {right}
      </View>
      {subtitle ? <Text style={s.headerSub}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

/** Section heading with an optional action (e.g. "See all") on the right. */
export function SectionTitle({ title, action, style }: { title: string; action?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.section, style]}>
      <Text style={s.sectionTitle} accessibilityRole="header">{title}</Text>
      {action}
    </View>
  );
}

/** Surface card. Neutral by default; variant "glow" adds a quiet accent border for things that mean something (risk, selection). */
export function Card({ children, variant = 'plain', accent, style }: {
  children: React.ReactNode;
  variant?: 'plain' | 'glow';
  accent?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const a = accent ?? gradient.brand[0];
  return (
    <View style={[s.card, variant === 'glow' && { borderColor: alpha(a, 0.5) }, style]}>{children}</View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { padding: layout.pad, paddingBottom: sp(5) },
  fill: { flex: 1 },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: layout.gap },
  header: { gap: sp(0.5), paddingTop: sp(0.5) },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: layout.gap },
  headerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerKicker: { ...font.overline },
  headerTitle: { ...font.display, color: color.text },
  headerSub: { ...font.body, color: color.muted },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp(1), marginTop: sp(1), minHeight: 32 },
  sectionTitle: { ...font.h2, color: color.text, flexShrink: 1 },
  card: { backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: radius.card, padding: layout.pad, gap: layout.gap },
});
