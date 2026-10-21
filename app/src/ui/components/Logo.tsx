// CricShield brand: LogoMark (shield + cricket-ball seam), Wordmark (mark + name) and the in-app Splash.
import React, { useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { color, font, gradient, sp } from '../theme';

/** Shield in the brand gradient with a dark cricket ball and its stitched seam. Drawn on a 64 x 64 grid. */
export function LogoMark({ size = 40 }: { size?: number }) {
  const id = `cs-logo-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel="CricShield">
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradient.brand[0]} />
            <Stop offset="1" stopColor={gradient.brand[1]} />
          </LinearGradient>
        </Defs>
        <Path d="M32 3 L55 11 V29 C55 44 45 55 32 61 C19 55 9 44 9 29 V11 Z" fill={`url(#${id})`} />
        <Circle cx={32} cy={31} r={14} fill={color.bg} />
        <Path d="M21.5 38.5 C26 31 32 25.5 41 22.5" stroke={color.text} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        <Path d="M23.5 41 C28 33.5 34 28 43 25" stroke={color.text} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        <Path d="M22.5 39.7 C27 32.3 33 26.8 42 23.8" stroke={gradient.brand[1]} strokeWidth={2.4} fill="none"
          strokeDasharray="1.2 2.6" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/** Mark + "CricShield". */
export function Wordmark({ size = 32 }: { size?: number }) {
  return (
    <View style={s.row}>
      <LogoMark size={size} />
      <Text style={[s.word, { fontSize: Math.round(size * 0.56) }]}>CricShield</Text>
    </View>
  );
}

/** Full-screen brand splash while the app loads its saved settings. */
export function Splash() {
  return (
    <View style={s.splash} accessibilityLabel="CricShield is loading">
      <LogoMark size={88} />
      <Text style={s.splashName}>CricShield</Text>
      <Text style={s.splashTag}>Safer fast bowling</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  word: { color: color.text, fontWeight: '700', letterSpacing: -0.3 },
  splash: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', gap: sp(1.5) },
  splashName: { ...font.title, color: color.text, marginTop: sp(1) },
  splashTag: { ...font.body, color: color.muted },
});
