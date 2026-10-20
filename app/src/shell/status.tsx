// Backend status: pings C1-C4 on the team computer and shows one pill on Home.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { c1 } from '../api/c1';
import { c2 } from '../api/c2';
import { c4 } from '../api/c4';
import { c3 } from '../api/risk';
import { alpha, color, COMPONENT_KEYS, font, RISK, sp, type ComponentKey } from '../ui';

const PINGS: Record<ComponentKey, () => Promise<unknown>> = { c1: c1.ping, c2: c2.ping, c3: c3.ping, c4: c4.ping };

export type BackendStatus = { checking: boolean; up: Record<ComponentKey, boolean> | null };

/** Pings every component when the screen gains focus; `check` re-runs it. */
export function useBackendStatus() {
  const [status, setStatus] = useState<BackendStatus>({ checking: true, up: null });
  const check = useCallback(async () => {
    setStatus((s) => ({ ...s, checking: true }));
    const res = await Promise.all(COMPONENT_KEYS.map((k) => PINGS[k]().then(() => true, () => false)));
    setStatus({ checking: false, up: Object.fromEntries(COMPONENT_KEYS.map((k, i) => [k, res[i]])) as Record<ComponentKey, boolean> });
  }, []);
  useFocusEffect(useCallback(() => { check(); }, [check]));
  return { ...status, check };
}

export function StatusPill({ status, onPress }: { status: BackendStatus; onPress?: () => void }) {
  const n = status.up ? COMPONENT_KEYS.filter((k) => status.up![k]).length : 0;
  const tone = status.up == null ? null : n === 4 ? RISK.low : n === 0 ? RISK.critical : RISK.moderate;
  const text = status.up == null ? 'Checking the team computer…'
    : n === 4 ? 'All systems ready'
    : n === 0 ? 'Server offline – check Wi-Fi'
    : `${n} of 4 parts ready – some results may be missing`;
  const c = tone?.color ?? color.muted;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={`Backend status: ${text}`}
      style={({ pressed }) => [s.pill, { borderColor: alpha(c, 0.5), backgroundColor: alpha(c, 0.1) }, pressed && { opacity: 0.8 }]}>
      {status.checking && status.up == null ? <ActivityIndicator size="small" color={color.muted} />
        : <Ionicons name={n === 4 ? 'checkmark-circle' : n === 0 ? 'cloud-offline' : 'alert-circle'} size={16} color={tone?.text ?? color.muted} />}
      <Text style={[s.text, { color: tone?.text ?? color.muted }]} numberOfLines={1}>{text}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: sp(1.5), minHeight: 36 },
  text: { ...font.caption, fontSize: 13, fontWeight: '700', flexShrink: 1 },
});
