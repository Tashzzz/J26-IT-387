// CricShield UI kit. Screens are built only from these blocks and the tokens in ./theme,
// so the look stays consistent and can be changed in one place.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Tier } from '../c4/types';
import { colors, radius, shadow, tierColor, tierLabel, tierSoft, type as t } from './theme';

export type IconName = keyof typeof Ionicons.glyphMap;

// ---------------------------------------------------------------- layout

/**
 * Page wrapper. With `title` it draws a large page header under the status bar (tab screens);
 * without it the native stack header is used (pushed screens).
 */
export function Screen({ children, scroll = true, title, subtitle, right, footer, onRefresh, refreshing, safeTop }: {
  children: React.ReactNode;
  safeTop?: boolean; // no native header and no title: keep content below the status bar
  scroll?: boolean;
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  footer?: React.ReactNode; // sticky bottom area, e.g. the main call to action
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const header = title ? (
    <View style={[s.pageHeader, { paddingTop: insets.top + 12 }]}>
      <View style={{ flex: 1 }}>
        <Text style={t.display} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={[t.small, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  ) : null;

  const body = <View style={[s.inner, safeTop && !title && { paddingTop: insets.top + 8 }]}>{children}</View>;
  return (
    <View style={s.screen}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[s.pad, { paddingBottom: footer ? 24 : 40 }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}>
          {header}
          {body}
        </ScrollView>
      ) : (
        <View style={[s.pad, { flex: 1 }]}>{header}{body}</View>
      )}
      {footer ? <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}><View style={s.footerInner}>{footer}</View></View> : null}
    </View>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string;
}) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [s.card, style, pressed && s.pressed]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.row, style]}>{children}</View>;
}

export const Divider = () => <View style={s.divider} />;

/** Section title with an optional action on the right ("See all"). */
export function Section({ title, action, onAction, children }: {
  title: string; action?: string; onAction?: () => void; children?: React.ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View style={s.sectionHead}>
        <Text style={t.heading} accessibilityRole="header">{title}</Text>
        {action && onAction ? (
          <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
            <Text style={s.link}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------- text

export const H = ({ children }: { children: React.ReactNode }) => <Text style={[t.overline, { marginTop: 8 }]} accessibilityRole="header">{children}</Text>;
export const Label = ({ children }: { children: React.ReactNode }) => <Text style={s.label}>{children}</Text>;
export const Title = ({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) => <Text style={[t.title, style]}>{children}</Text>;
export const Body = ({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: StyleProp<TextStyle> }) => (
  <Text style={[t.body, muted && { color: colors.muted }, style]}>{children}</Text>
);
export const Small = ({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) => <Text style={[t.small, style]}>{children}</Text>;

// ---------------------------------------------------------------- buttons

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, size = 'md', style }: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'light' | 'onDark';
  icon?: IconName; loading?: boolean; disabled?: boolean; size?: 'md' | 'sm'; style?: StyleProp<ViewStyle>;
}) {
  const v = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.primary, border: colors.borderStrong },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.surface, fg: colors.danger, border: '#FCA5A5' },
    light: { bg: colors.surface, fg: colors.navy, border: colors.surface },
    onDark: { bg: 'transparent', fg: colors.onNavy, border: '#3B4F80' },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        s.btn, size === 'sm' && s.btnSm,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && !off && { opacity: 0.85 },
        disabled && !loading && { opacity: 0.45 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={v.fg} /> : (
        <>
          {icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 19} color={v.fg} />}
          <Text style={[s.btnText, size === 'sm' && { fontSize: 14 }, { color: v.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color = colors.text }: { icon: IconName; onPress: () => void; label: string; color?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}>
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );
}

// ---------------------------------------------------------------- inputs

export function Field({ label, hint, half, error, ...props }: TextInputProps & { label: string; hint?: string; half?: boolean; error?: string | null }) {
  return (
    <View style={[{ marginBottom: 14 }, half && { flexGrow: 1, flexBasis: 140 }]}>
      <Label>{label}</Label>
      <TextInput placeholderTextColor="#94A3B8" accessibilityLabel={label}
        style={[s.input, props.multiline && { minHeight: 88, textAlignVertical: 'top' }, error ? { borderColor: colors.danger } : null, props.editable === false && { backgroundColor: colors.surfaceAlt, color: colors.muted }]}
        {...props} />
      {error ? <Text style={[s.hint, { color: colors.danger }]}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Wrapping option chips (single choice). */
export function Chips<T extends string | number>({ label, options, value, onChange, hint }: {
  label?: string; options: { label: string; value: T; icon?: IconName }[]; value: T | null | undefined; onChange: (v: T) => void; hint?: string;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Label>{label}</Label> : null}
      <View style={s.chips}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable key={String(o.value)} onPress={() => onChange(o.value)}
              accessibilityRole="radio" accessibilityState={{ selected: active }}
              style={({ pressed }) => [s.chip, active && s.chipOn, pressed && s.pressed]}>
              {o.icon ? <Ionicons name={o.icon} size={15} color={active ? colors.primary : colors.muted} /> : null}
              <Text style={[s.chipText, active && { color: colors.primary }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Equal-width segmented control (2-4 options). */
export function Segmented<T extends string | number>({ label, options, value, onChange }: {
  label?: string; options: { label: string; value: T }[]; value: T | null | undefined; onChange: (v: T) => void;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Label>{label}</Label> : null}
      <View style={s.seg} accessibilityRole="radiogroup">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: active }}
              style={[s.segItem, active && s.segOn]}>
              <Text style={[s.segText, active && { color: colors.text }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Large tappable option with icon, title and description (wizard choices). */
export function OptionCard({ icon, title, text, selected, onPress, disabled }: {
  icon: IconName; title: string; text?: string; selected?: boolean; onPress: () => void; disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="radio" accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => [s.option, selected && s.optionOn, pressed && s.pressed, disabled && { opacity: 0.45 }]}>
      <View style={[s.optionIcon, selected && { backgroundColor: colors.primary }]}>
        <Ionicons name={icon} size={20} color={selected ? colors.onPrimary : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.optionTitle}>{title}</Text>
        {text ? <Text style={t.small}>{text}</Text> : null}
      </View>
      {selected !== undefined ? (
        <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.primary : colors.borderStrong} />
      ) : <Ionicons name="chevron-forward" size={20} color={colors.muted} />}
    </Pressable>
  );
}

// ---------------------------------------------------------------- display

export function TierBadge({ tier, size = 'md' }: { tier: Tier; size?: 'md' | 'sm' }) {
  return (
    <View style={[s.badge, { backgroundColor: tierSoft[tier] }]} accessibilityLabel={tierLabel[tier]}>
      <View style={[s.badgeDot, { backgroundColor: tierColor[tier] }]} />
      <Text style={[s.badgeText, { color: tierColor[tier] }, size === 'sm' && { fontSize: 11 }]}>{tierLabel[tier]}</Text>
    </View>
  );
}

export function Badge({ text, tone = 'neutral', icon }: { text: string; tone?: Tone; icon?: IconName }) {
  const c = toneColors[tone];
  return (
    <View style={[s.badge, { backgroundColor: c.soft }]}>
      {icon ? <Ionicons name={icon} size={12} color={c.fg} /> : null}
      <Text style={[s.badgeText, { color: c.fg }]}>{text}</Text>
    </View>
  );
}

type Tone = 'danger' | 'warn' | 'ok' | 'info' | 'neutral';
const toneColors: Record<Tone, { fg: string; soft: string }> = {
  danger: { fg: colors.danger, soft: colors.dangerSoft },
  warn: { fg: colors.warn, soft: colors.warnSoft },
  ok: { fg: colors.ok, soft: colors.okSoft },
  info: { fg: colors.info, soft: colors.infoSoft },
  neutral: { fg: colors.textSoft, soft: colors.surfaceAlt },
};

/** Small statistic: label above a large value. */
export function Tile({ label, value, tone = 'neutral', wide, icon, caption }: {
  label: string; value: string; tone?: 'danger' | 'ok' | 'neutral' | 'warn'; wide?: boolean; icon?: IconName; caption?: string;
}) {
  const fg = tone === 'neutral' ? colors.text : toneColors[tone].fg;
  return (
    <View style={[s.tile, wide && { flexBasis: '100%' }]}>
      <View style={s.rowCenter}>
        {icon ? <Ionicons name={icon} size={14} color={colors.muted} /> : null}
        <Text style={t.overline} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[s.tileValue, { color: fg }]} numberOfLines={2}>{value}</Text>
      {caption ? <Text style={t.small} numberOfLines={2}>{caption}</Text> : null}
    </View>
  );
}

/** Inline message. `info` for tips, `warn` for caution, `danger` for errors or referrals. */
export function Banner({ tone, icon, title, children, action, onAction }: {
  tone: 'danger' | 'warn' | 'info' | 'ok'; icon: IconName; title: string; children?: React.ReactNode; action?: string; onAction?: () => void;
}) {
  const c = toneColors[tone];
  return (
    <View style={[s.banner, { backgroundColor: c.soft }]} accessibilityRole="summary">
      <Ionicons name={icon} size={20} color={c.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[s.bannerTitle, { color: c.fg }]}>{title}</Text>
        {children}
        {action && onAction ? (
          <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8} style={{ marginTop: 2 }}>
            <Text style={[s.link, { color: c.fg }]}>{action} ›</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Settings-style row: icon, title, subtitle, chevron. */
export function ListItem({ icon, iconColor = colors.primary, title, subtitle, onPress, right, last, danger }: {
  icon?: IconName; iconColor?: string; title: string; subtitle?: string; onPress?: () => void; right?: React.ReactNode; last?: boolean; danger?: boolean;
}) {
  const content = (
    <>
      {icon ? (
        <View style={[s.listIcon, { backgroundColor: `${iconColor}14` }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[s.listTitle, danger && { color: colors.danger }]}>{title}</Text>
        {subtitle ? <Text style={t.small} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null)}
    </>
  );
  const style = [s.listItem, !last && s.listBorder];
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [...style, pressed && { backgroundColor: colors.surfaceAlt }]}>{content}</Pressable>
  ) : <View style={style}>{content}</View>;
}

/** Group of ListItems in one card. */
export function List({ children }: { children: React.ReactNode }) {
  return <View style={[s.card, { padding: 0, gap: 0, overflow: 'hidden' }]}>{children}</View>;
}

export function EmptyState({ icon, title, text, action, onAction, secondary, onSecondary }: {
  icon: IconName; title: string; text: string; action?: string; onAction?: () => void; secondary?: string; onSecondary?: () => void;
}) {
  return (
    <View style={[s.card, s.empty]}>
      <View style={s.emptyIcon}><Ionicons name={icon} size={28} color={colors.primary} /></View>
      <Text style={[t.heading, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[t.body, { textAlign: 'center', color: colors.muted }]}>{text}</Text>
      {action && onAction ? <Button title={action} onPress={onAction} style={{ alignSelf: 'stretch', marginTop: 6 }} /> : null}
      {secondary && onSecondary ? <Button title={secondary} onPress={onSecondary} variant="ghost" style={{ alignSelf: 'stretch' }} /> : null}
    </View>
  );
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 12 }} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.primary} size="large" />
      <Body muted>{text}</Body>
    </View>
  );
}

/** Round badge with the bowler code, e.g. "B01". */
export function Avatar({ code, size = 44, dark }: { code: string; size?: number; dark?: boolean }) {
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }, dark && { backgroundColor: colors.navySoft }]}>
      <Text style={[s.avatarText, { fontSize: size * (code.length <= 3 ? 0.32 : code.length <= 4 ? 0.26 : 0.21) }, dark && { color: colors.onNavy }]} numberOfLines={1}>{code.slice(0, 6)}</Text>
    </View>
  );
}

/** Horizontal progress for wizards: "Step 2 of 4" with labelled dots. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View style={s.stepper} accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}>
      {steps.map((label, i) => {
        const done = i < current;
        const on = i === current;
        return (
          <View key={label} style={s.step}>
            <View style={[s.stepBar, (done || on) && { backgroundColor: colors.primary }]} />
            <Text style={[s.stepText, on && { color: colors.primary, fontWeight: '700' }, done && { color: colors.text }]} numberOfLines={1}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Thin bar 0-1. */
export function ProgressBar({ value, color = colors.primary }: { value: number; color?: string }) {
  return (
    <View style={s.track}><View style={[s.fill, { width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color }]} /></View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: 16, paddingTop: 12 },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 16 },
  pageHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 12 },
  footerInner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 8 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow.card },
  pressed: { opacity: 0.8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  link: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  label: { color: colors.textSoft, fontSize: 14, fontWeight: '600', marginBottom: 6 },
  btn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 18, minHeight: 52 },
  btnSm: { paddingVertical: 8, paddingHorizontal: 12, minHeight: 40 },
  btnText: { fontSize: 16, fontWeight: '700' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  input: { backgroundColor: colors.surface, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: radius.md, color: colors.text, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, minHeight: 50 },
  hint: { color: colors.muted, fontSize: 13, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, minHeight: 40 },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { color: colors.textSoft, fontSize: 14, fontWeight: '600' },
  seg: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4, gap: 4 },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, paddingVertical: 10, minHeight: 42 },
  segOn: { backgroundColor: colors.surface, ...shadow.card },
  segText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, minHeight: 64 },
  optionOn: { borderColor: colors.primary, backgroundColor: '#F5F8FF' },
  optionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  optionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  tile: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 14, gap: 4 },
  tileValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  banner: { flexDirection: 'row', gap: 10, borderRadius: radius.md, padding: 14 },
  bannerTitle: { fontWeight: '700', fontSize: 15 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 60, backgroundColor: colors.surface },
  listBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  listIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  listTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, gap: 8 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatar: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '800' },
  stepper: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, gap: 6 },
  stepBar: { height: 4, borderRadius: 2, backgroundColor: colors.border },
  stepText: { color: colors.muted, fontSize: 12 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
