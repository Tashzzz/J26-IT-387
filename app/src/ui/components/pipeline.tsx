// Progress through steps: PipelineStepper (Film > Action > Risk > Plan; C1 > C4 in Research mode) and
// StepIndicator (numbered wizard steps).
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useResearchMode } from '../prefs';
import { alpha, color, COMPONENT, COMPONENT_KEYS, font, gradient, RISK, type ComponentKey } from '../theme';

export type StepState = 'pending' | 'running' | 'done' | 'failed';

/** Pulsing ring for the running node. */
function Pulse({ c, d }: { c: string; d: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', width: d, height: d, borderRadius: d / 2, borderWidth: 2, borderColor: c,
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
      transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
    }} />
  );
}

/** Four nodes in component colours. Missing keys are 'pending'. onPress makes nodes tappable. */
export function PipelineStepper({ states, onPress, compact }: {
  states: Partial<Record<ComponentKey, StepState>>;
  onPress?: (k: ComponentKey) => void;
  compact?: boolean;
}) {
  const d = compact ? 36 : 48;
  const research = useResearchMode();
  return (
    <View style={s.row}>
      {COMPONENT_KEYS.map((k, i) => {
        const c = COMPONENT[k];
        const st = states[k] ?? 'pending';
        const prevDone = i > 0 && (states[COMPONENT_KEYS[i - 1]] ?? 'pending') === 'done';
        const nodeColor = st === 'failed' ? RISK.critical.color : c.color;
        const node = (
          <View style={{ alignItems: 'center', gap: 6, width: d + 24 }}>
            <View style={{ width: d, height: d, alignItems: 'center', justifyContent: 'center' }}>
              {st === 'running' && <Pulse c={c.color} d={d} />}
              <View style={[s.node, { width: d, height: d, borderRadius: d / 2 },
                st === 'pending' && { borderColor: alpha(c.color, 0.35), backgroundColor: color.surface2 },
                st === 'running' && { borderColor: c.color, backgroundColor: alpha(c.color, 0.16) },
                st === 'done' && { borderColor: c.color, backgroundColor: c.color },
                st === 'failed' && { borderColor: nodeColor, backgroundColor: alpha(nodeColor, 0.18) }]}>
                {st === 'running' ? <Ionicons name={c.icon} size={d * 0.4} color={c.color} />
                  : st === 'done' ? <Ionicons name="checkmark" size={d * 0.45} color={color.onBrand} />
                  : st === 'failed' ? <Ionicons name="close" size={d * 0.45} color={RISK.critical.text} />
                  : <Ionicons name={c.icon} size={d * 0.4} color={alpha(c.color, 0.7)} />}
              </View>
            </View>
            {!compact && research && <Text style={[s.code, { color: st === 'pending' ? color.muted : st === 'failed' ? RISK.critical.text : c.color }]}>{c.code}</Text>}
            {!compact && <Text style={[s.name, !research && { marginTop: 0 }]} numberOfLines={1}>{research ? c.label : c.short}</Text>}
          </View>
        );
        return (
          <React.Fragment key={k}>
            {i > 0 && (
              <View style={[s.link, { marginTop: d / 2 - 1 }, { backgroundColor: prevDone ? COMPONENT[COMPONENT_KEYS[i - 1]].color : color.border }]} />
            )}
            {onPress ? (
              <Pressable onPress={() => onPress(k)} accessibilityRole="button" accessibilityLabel={`${c.step}: ${st}`}
                style={({ pressed }) => pressed && { opacity: 0.7 }}>{node}</Pressable>
            ) : <View accessible accessibilityLabel={`${c.step}: ${st}`}>{node}</View>}
          </React.Fragment>
        );
      })}
    </View>
  );
}

/** Numbered wizard steps; `current` is 0-based. Steps before it show a tick. */
export function StepIndicator({ steps, current, tint = gradient.brand[1] }: { steps: string[]; current: number; tint?: string }) {
  return (
    <View style={s.row} accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${steps[current] ?? ''}`}>
      {steps.map((label, i) => {
        const done = i < current;
        const on = i === current;
        return (
          <React.Fragment key={label}>
            {i > 0 && <View style={[s.link, { marginTop: 15, backgroundColor: i <= current ? tint : color.border }]} />}
            <View style={{ alignItems: 'center', gap: 6, flexShrink: 1, maxWidth: 88 }}>
              <View style={[s.num, done && { backgroundColor: tint, borderColor: tint }, on && { borderColor: tint, backgroundColor: alpha(tint, 0.18) }]}>
                {done ? <Ionicons name="checkmark" size={16} color={color.onBrand} />
                  : <Text style={[s.numText, on && { color: tint }]}>{i + 1}</Text>}
              </View>
              <Text style={[s.stepLabel, on && { color: color.text }]} numberOfLines={2}>{label}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  node: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  link: { flex: 1, height: 2, borderRadius: 1, minWidth: 8 },
  code: { ...font.caption, fontWeight: '700' },
  name: { ...font.caption, color: color.muted, marginTop: -4 },
  num: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: color.border, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center' },
  numText: { ...font.caption, fontSize: 14, fontWeight: '700', color: color.muted },
  stepLabel: { ...font.caption, color: color.muted, textAlign: 'center' },
});
