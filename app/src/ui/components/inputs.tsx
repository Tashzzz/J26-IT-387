// Inputs: Chip, ChipGroup, TextField, SegmentedControl.
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { alpha, color, font, gradient, HIT, radius, RISK, sp, type IconName } from '../theme';

export function Chip({ label, selected, onPress, icon, tint = gradient.brand[1] }: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  tint?: string;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }}
      hitSlop={6}
      style={({ pressed }) => [s.chip, selected && { backgroundColor: alpha(tint, 0.16), borderColor: tint }, pressed && { opacity: 0.75 }]}>
      {selected ? <Ionicons name="checkmark" size={15} color={tint} /> : icon ? <Ionicons name={icon} size={15} color={color.muted} /> : null}
      <Text style={[s.chipText, selected && { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

/** Single-select chips with an optional label. Options can be plain values or {value, label}. */
export function ChipGroup<T extends string | number>({ label, options, value, onChange, tint }: {
  label?: string;
  options: readonly (T | { value: T; label: string })[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  tint?: string;
}) {
  return (
    <View style={{ gap: sp(1) }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.chips}>
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : String(o);
          return <Chip key={String(v)} label={l} selected={v === value} onPress={() => onChange(v)} tint={tint} />;
        })}
      </View>
    </View>
  );
}

export function TextField({ label, hint, error, icon, style, ...props }: TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
  icon?: IconName;
}) {
  const [focus, setFocus] = useState(false);
  const border = error ? RISK.critical.text : focus ? gradient.brand[1] : color.border;
  return (
    <View style={{ gap: sp(0.75) }}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.field, { borderColor: border }]}>
        {icon && <Ionicons name={icon} size={18} color={color.muted} />}
        <TextInput placeholderTextColor={alpha(color.muted, 0.7)} accessibilityLabel={label} {...props}
          onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
          style={[s.input, style]} />
      </View>
      {error ? <Text style={[s.hint, { color: RISK.critical.text }]}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function SegmentedControl<T extends string>({ options, value, onChange, tint = gradient.brand[1] }: {
  options: readonly { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  tint?: string;
}) {
  return (
    <View style={s.seg} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={[s.segItem, on && { backgroundColor: alpha(tint, 0.18), borderColor: alpha(tint, 0.6) }]}>
            {o.icon && <Ionicons name={o.icon} size={16} color={on ? tint : color.muted} />}
            <Text style={[s.segText, on && { color: tint }]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  label: { ...font.caption, color: color.muted, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1) },
  chip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: sp(1.75), borderRadius: radius.chip, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2 },
  chipText: { ...font.body, fontSize: 14, fontWeight: '600', color: color.text },
  field: { minHeight: HIT, flexDirection: 'row', alignItems: 'center', gap: sp(1), borderWidth: 1, borderRadius: radius.button, backgroundColor: color.surface2, paddingHorizontal: sp(1.75) },
  input: { flex: 1, ...font.body, color: color.text, paddingVertical: sp(1.25) },
  hint: { ...font.caption, color: color.muted },
  seg: { flexDirection: 'row', backgroundColor: color.surface2, borderRadius: radius.button, borderWidth: 1, borderColor: color.border, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: sp(1) },
  segText: { ...font.body, fontSize: 14, fontWeight: '700', color: color.muted },
});
