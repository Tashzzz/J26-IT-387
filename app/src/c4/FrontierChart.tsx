// C4 research figure (native SVG): squad overs kept vs expected injuries for every policy.
// Same data as components/c4_recommend/experiments/weekplan_frontier_test.png, drawn in the app theme.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { RESEARCH, type Pt } from './researchData';
import { colors } from './theme';

const C = {
  planner: colors.accent,
  uniform: '#F59E0B',
  rules: '#A78BFA',
  ecb: '#F87171',
  usual: '#22C55E',
  rest: '#B08968',
  grid: colors.border,
};

const H = 260;
const PAD = { l: 44, r: 14, t: 14, b: 40 };
const X0 = 0, X1 = 100;
const Y0 = 5.2, Y1 = 6.45;

export function FrontierChart() {
  const [w, setW] = useState(340);
  const iw = w - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const sx = (x: number) => PAD.l + ((x - X0) / (X1 - X0)) * iw;
  const sy = (y: number) => PAD.t + (1 - (y - Y0) / (Y1 - Y0)) * ih;
  const path = (pts: readonly Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const P = RESEARCH.points;

  return (
    <View onLayout={(e) => setW(Math.max(260, e.nativeEvent.layout.width))} accessible
      accessibilityLabel={`Chart: the AI week planner line stays below the same-cut line and reaches ${P.best.y.toFixed(2)} injuries per 100, rule engine ${P.rules.y.toFixed(2)}.`}>
      <Svg width={w} height={H}>
        {/* grid + axes */}
        {[5.2, 5.4, 5.6, 5.8, 6.0, 6.2, 6.4].map((y) => (
          <G key={y}>
            <Line x1={PAD.l} x2={w - PAD.r} y1={sy(y)} y2={sy(y)} stroke={C.grid} strokeWidth={1} />
            <SvgText x={PAD.l - 6} y={sy(y) + 4} fill={colors.muted} fontSize={10} textAnchor="end">{y.toFixed(1)}</SvgText>
          </G>
        ))}
        {[0, 20, 40, 60, 80, 100].map((x) => (
          <SvgText key={x} x={sx(x)} y={H - PAD.b + 16} fill={colors.muted} fontSize={10} textAnchor="middle">{x}%</SvgText>
        ))}
        <SvgText x={PAD.l + iw / 2} y={H - 6} fill={colors.muted} fontSize={11} textAnchor="middle">Squad overs kept next week</SvgText>

        {/* curves */}
        <Path d={path(RESEARCH.curves.uniform)} stroke={C.uniform} strokeWidth={2} strokeDasharray="6 4" fill="none" />
        <Path d={path(RESEARCH.curves.model)} stroke={C.planner} strokeWidth={3} fill="none" />
        {RESEARCH.curves.model.map((p) => <Circle key={`m${p.x}`} cx={sx(p.x)} cy={sy(p.y)} r={2.5} fill={C.planner} />)}

        {/* single policies */}
        <Rect x={sx(P.usual.x) - 6} y={sy(P.usual.y) - 6} width={12} height={12} fill={C.usual} />
        <Rect x={sx(P.ecb.x) - 5} y={sy(P.ecb.y) - 5} width={10} height={10} fill={C.ecb} transform={`rotate(45 ${sx(P.ecb.x)} ${sy(P.ecb.y)})`} />
        <Polygon points={`${sx(P.rules.x)},${sy(P.rules.y) - 8} ${sx(P.rules.x) + 8},${sy(P.rules.y)} ${sx(P.rules.x)},${sy(P.rules.y) + 8} ${sx(P.rules.x) - 8},${sy(P.rules.y)}`} fill={C.rules} />
        <Polygon points={`${sx(P.rest.x) - 7},${sy(P.rest.y) - 6} ${sx(P.rest.x) + 7},${sy(P.rest.y) - 6} ${sx(P.rest.x)},${sy(P.rest.y) + 7}`} fill={C.rest} />
        <Circle cx={sx(P.planner.x)} cy={sy(P.planner.y)} r={9} stroke={colors.text} strokeWidth={2} fill="none" />
        <Circle cx={sx(P.best.x)} cy={sy(P.best.y)} r={9} stroke={C.planner} strokeWidth={2} strokeDasharray="3 3" fill="none" />
      </Svg>

      <View style={s.legend}>
        <Key color={C.planner} label="AI week planner (each setting)" line />
        <Key color={C.uniform} label="Same % cut for every flagged bowler" line dashed />
        <Key color={C.rules} label={`C4 rule engine (${P.rules.y.toFixed(2)})`} />
        <Key color={C.ecb} label={`ECB limits only (${P.ecb.y.toFixed(2)})`} />
        <Key color={C.usual} label={`Usual week (${P.usual.y.toFixed(2)})`} />
        <Key color={C.rest} label={`Rest every flagged bowler (${P.rest.y.toFixed(2)})`} />
        <Key color={colors.text} label={`Default planner setting (${P.planner.y.toFixed(2)})`} ring />
        <Key color={C.planner} label={`Planner's best point (${P.best.y.toFixed(2)})`} ring />
      </View>
      <Text style={s.axis}>Vertical axis: expected injuries per 100 screened bowlers (true 28-day risk). Lower is better.</Text>
    </View>
  );
}

function Key({ color, label, line, dashed, ring }: { color: string; label: string; line?: boolean; dashed?: boolean; ring?: boolean }) {
  return (
    <View style={s.key}>
      {line ? <View style={[s.keyLine, { backgroundColor: dashed ? 'transparent' : color, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }]} />
        : ring ? <View style={[s.keyRing, { borderColor: color }]} />
          : <View style={[s.keyDot, { backgroundColor: color }]} />}
      <Text style={s.keyText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: '45%' },
  keyLine: { width: 18, height: 0, borderTopWidth: 3 },
  keyDot: { width: 10, height: 10, borderRadius: 2 },
  keyRing: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  keyText: { color: colors.muted, fontSize: 12, flexShrink: 1 },
  axis: { color: colors.muted, fontSize: 12, marginTop: 8 },
});
