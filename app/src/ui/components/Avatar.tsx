// Bowler avatar: code in a circle with a gradient ring coloured by the latest risk level (brand gradient when unknown).
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { alpha, color, gradient, RISK, type RiskLevel } from '../theme';

export function Avatar({ code, risk, size = 56 }: { code: string; risk?: RiskLevel | null; size?: number }) {
  const r = risk ? RISK[risk] : null;
  const stops = r ? ([r.color, alpha(r.color, 0.35)] as const) : gradient.brand;
  const ring = Math.max(3, Math.round(size * 0.06));
  const inner = size - ring * 2;
  const text = code.replace(/\s+/g, '').slice(0, 4).toUpperCase();
  const badge = Math.max(16, Math.round(size * 0.34));
  return (
    <View style={{ width: size, height: size }} accessible
      accessibilityLabel={`Bowler ${code}${r ? `, latest risk ${r.label}` : ''}`}>
      <LinearGradient colors={stops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[s.ring, { width: size, height: size, borderRadius: size / 2 }]}>
        <View style={[s.inner, { width: inner, height: inner, borderRadius: inner / 2 }]}>
          <Text style={[s.text, { fontSize: Math.round(inner * (text.length > 3 ? 0.26 : 0.32)) }]} numberOfLines={1}>{text}</Text>
        </View>
      </LinearGradient>
      {r && (
        <View style={[s.badge, { width: badge, height: badge, borderRadius: badge / 2 }]}>
          <MaterialCommunityIcons name={r.icon} size={badge - 4} color={r.color} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center' },
  inner: { backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center' },
  text: { color: color.text, fontWeight: '700', letterSpacing: 0.5 },
  badge: { position: 'absolute', right: -2, bottom: -2, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
});
