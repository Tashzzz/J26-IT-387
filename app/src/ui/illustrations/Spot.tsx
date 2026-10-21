// Spot illustrations for the welcome hero and empty states: flat shapes in the surface colours with
// one brand accent, so they sit quietly on the dark theme. Announced as one image each.
import React, { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { color, gradient } from '../theme';

export type SpotKind = 'squad' | 'video' | 'search' | 'results' | 'plan' | 'offline';

const LABEL: Record<SpotKind, string> = {
  squad: 'Bowler cards',
  video: 'Phone filming a delivery',
  search: 'Magnifying glass over a list',
  results: 'Risk gauge',
  plan: 'Clipboard with a plan',
  offline: 'Computer without a connection',
};

/** Bowling-action skeleton (front arm up, bowling arm back) as joints + bones, centred on (x, y). */
function Skeleton({ x, y, s = 1, c }: { x: number; y: number; s?: number; c: string }) {
  const P = {
    head: [0, -46], neck: [0, -36], ls: [-9, -33], rs: [9, -33], le: [-17, -46], lw: [-20, -58],
    re: [17, -22], rw: [26, -12], lh: [-6, -8], rh: [6, -8], lk: [-14, 8], la: [-20, 26], rk: [12, 8], ra: [20, 24],
  } as const;
  const bones: (keyof typeof P)[][] = [
    ['neck', 'ls'], ['neck', 'rs'], ['ls', 'le'], ['le', 'lw'], ['rs', 're'], ['re', 'rw'], ['ls', 'lh'], ['rs', 'rh'],
    ['lh', 'rh'], ['lh', 'lk'], ['lk', 'la'], ['rh', 'rk'], ['rk', 'ra'],
  ];
  const at = (k: keyof typeof P) => [x + P[k][0] * s, y + P[k][1] * s];
  return (
    <G>
      {bones.map(([a, b]) => {
        const [x1, y1] = at(a);
        const [x2, y2] = at(b);
        return <Line key={`${a}-${b}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={2.2 * s} strokeLinecap="round" />;
      })}
      {(Object.keys(P) as (keyof typeof P)[]).filter((k) => k !== 'head').map((k) => {
        const [cx, cy] = at(k);
        return <Circle key={k} cx={cx} cy={cy} r={2.4 * s} fill={color.text} />;
      })}
      <Circle cx={at('head')[0]} cy={at('head')[1]} r={6 * s} fill="none" stroke={c} strokeWidth={2.2 * s} />
    </G>
  );
}

function Grad({ id }: { id: string }) {
  return (
    <Defs>
      <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={gradient.brand[0]} />
        <Stop offset="1" stopColor={gradient.brand[1]} />
      </LinearGradient>
    </Defs>
  );
}

/** Small empty-state illustration, 160 x 120. */
export function Spot({ kind, size = 160 }: { kind: SpotKind; size?: number }) {
  const id = `spot-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const g = `url(#${id})`;
  const a = gradient.brand[1];
  const card = color.surface2;
  const line = color.border;
  return (
    <View style={{ width: size, height: size * 0.75 }} accessible accessibilityRole="image" accessibilityLabel={LABEL[kind]}>
      <Svg width="100%" height="100%" viewBox="0 0 160 120">
        <Grad id={id} />
        <Circle cx={80} cy={62} r={52} fill={color.surface} />
        {kind === 'squad' && (
          <G>
            <Rect x={30} y={34} width={100} height={22} rx={11} fill={card} />
            <Circle cx={42} cy={45} r={7} fill={line} />
            <Rect x={54} y={42} width={44} height={6} rx={3} fill={line} />
            <Rect x={30} y={62} width={100} height={22} rx={11} fill={card} />
            <Circle cx={42} cy={73} r={7} fill={line} />
            <Rect x={54} y={70} width={32} height={6} rx={3} fill={line} />
            <Circle cx={122} cy={88} r={14} fill={g} />
            <Path d="M122 81 V95 M115 88 H129" stroke={color.bg} strokeWidth={3} strokeLinecap="round" />
          </G>
        )}
        {kind === 'video' && (
          <G>
            <Rect x={44} y={22} width={72} height={86} rx={12} fill={card} stroke={line} strokeWidth={2} />
            <Rect x={52} y={32} width={56} height={62} rx={6} fill={color.bg} />
            <Skeleton x={80} y={70} s={0.62} c={a} />
            <Circle cx={112} cy={30} r={12} fill={g} />
            <Path d="M108.5 24.5 L117 30 L108.5 35.5 Z" fill={color.bg} />
          </G>
        )}
        {kind === 'search' && (
          <G>
            <Rect x={34} y={36} width={70} height={8} rx={4} fill={card} />
            <Rect x={34} y={52} width={56} height={8} rx={4} fill={card} />
            <Rect x={34} y={68} width={64} height={8} rx={4} fill={card} />
            <Circle cx={100} cy={70} r={18} fill="none" stroke={g} strokeWidth={6} />
            <Line x1={113} y1={83} x2={126} y2={96} stroke={g} strokeWidth={7} strokeLinecap="round" />
          </G>
        )}
        {kind === 'results' && (
          <G>
            <Path d="M40 84 A40 40 0 0 1 120 84" stroke={card} strokeWidth={12} fill="none" strokeLinecap="round" />
            <Path d="M40 84 A40 40 0 0 1 92 46" stroke={g} strokeWidth={12} fill="none" strokeLinecap="round" />
            <Circle cx={80} cy={84} r={6} fill={color.text} />
            <Line x1={80} y1={84} x2={96} y2={58} stroke={color.text} strokeWidth={3} strokeLinecap="round" />
          </G>
        )}
        {kind === 'plan' && (
          <G>
            <Rect x={48} y={24} width={64} height={84} rx={10} fill={card} stroke={line} strokeWidth={2} />
            <Rect x={66} y={18} width={28} height={12} rx={6} fill={g} />
            {[46, 64, 82].map((y, i) => (
              <G key={y}>
                <Circle cx={62} cy={y} r={5} fill={i < 2 ? a : line} />
                <Rect x={72} y={y - 3} width={i === 1 ? 24 : 30} height={6} rx={3} fill={line} />
              </G>
            ))}
          </G>
        )}
        {kind === 'offline' && (
          <G>
            <Rect x={40} y={34} width={80} height={52} rx={8} fill={card} stroke={line} strokeWidth={2} />
            <Rect x={68} y={86} width={24} height={10} fill={line} />
            <Rect x={56} y={96} width={48} height={6} rx={3} fill={line} />
            <Path d="M66 54 Q80 44 94 54" stroke={color.muted} strokeWidth={3} fill="none" strokeLinecap="round" />
            <Path d="M72 62 Q80 57 88 62" stroke={color.muted} strokeWidth={3} fill="none" strokeLinecap="round" />
            <Line x1={64} y1={70} x2={96} y2={46} stroke={a} strokeWidth={3} strokeLinecap="round" />
          </G>
        )}
      </Svg>
    </View>
  );
}

/** Welcome hero: a phone at the nets showing the skeleton replay, with the shield beside it. 320 x 220. */
export function WelcomeIllustration() {
  const id = `welcome-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const g = `url(#${id})`;
  return (
    <View style={{ width: '100%', maxWidth: 360, aspectRatio: 320 / 220, alignSelf: 'center' }} accessible accessibilityRole="image"
      accessibilityLabel="A phone showing a bowler's skeleton replay">
      <Svg width="100%" height="100%" viewBox="0 0 320 220">
        <Grad id={id} />
        <Circle cx={160} cy={112} r={100} fill={color.surface} />
        {/* pitch strip */}
        <Path d="M120 210 L146 40 H174 L200 210 Z" fill={color.surface2} />
        <Line x1={140} y1={78} x2={180} y2={78} stroke={color.border} strokeWidth={3} />
        {/* phone */}
        <Rect x={104} y={30} width={112} height={176} rx={18} fill={color.bg} stroke={color.border} strokeWidth={3} />
        <Rect x={114} y={46} width={92} height={136} rx={8} fill={color.surface} />
        <Skeleton x={160} y={128} s={1.05} c={gradient.brand[1]} />
        {/* scrubber with three markers */}
        <Rect x={122} y={168} width={76} height={4} rx={2} fill={color.border} />
        <Rect x={122} y={168} width={44} height={4} rx={2} fill={g} />
        {[136, 152, 172].map((x) => <Circle key={x} cx={x} cy={170} r={3.5} fill={color.text} />)}
        {/* shield badge */}
        <Path d="M240 70 L262 78 V96 C262 110 252 120 240 126 C228 120 218 110 218 96 V78 Z" fill={g} />
        <Path d="M231 98 L238 105 L251 90" stroke={color.bg} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* angle arc */}
        <Path d="M60 120 A26 26 0 0 1 86 94" stroke={gradient.brand[0]} strokeWidth={4} fill="none" strokeLinecap="round" />
        <Line x1={60} y1={120} x2={92} y2={120} stroke={color.muted} strokeWidth={3} strokeLinecap="round" />
        <Line x1={60} y1={120} x2={80} y2={88} stroke={color.muted} strokeWidth={3} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
