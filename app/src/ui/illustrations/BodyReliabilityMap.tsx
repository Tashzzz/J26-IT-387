// Front-facing body figure; each joint region coloured by how reliable C1's keypoints are there.
// The caller decides each region's status from C1's results; this only draws it.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';

import { alpha, color, font, RISK, sp } from '../theme';
import { SvgBox } from './common';

export type BodyRegion = 'head' | 'shoulders' | 'elbows' | 'wrists' | 'hips' | 'knees' | 'ankles';
export type RegionStatus = 'usable' | 'moderate' | 'unreliable' | 'untested';

const REGIONS: BodyRegion[] = ['head', 'shoulders', 'elbows', 'wrists', 'hips', 'knees', 'ankles'];

const REGION_LABEL: Record<BodyRegion, string> = {
  head: 'Head', shoulders: 'Shoulders', elbows: 'Elbows', wrists: 'Wrists', hips: 'Hips', knees: 'Knees', ankles: 'Ankles',
};

/** Accepts both C1 spellings: summary names ("wrists") and study keys ("wrist_hand", "ankle_foot", "shoulder"). */
export function toBodyRegion(name: string): BodyRegion | null {
  const k = name.toLowerCase().replace(/_(hand|foot)$/, '');
  const plural = (k.endsWith('s') ? k : `${k}s`) as BodyRegion;
  if (k === 'head') return 'head';
  return REGIONS.includes(plural) ? plural : null;
}

export const STATUS: Record<RegionStatus, { color: string; label: string }> = {
  usable: { color: RISK.low.color, label: 'Usable' },
  moderate: { color: RISK.moderate.color, label: 'Moderate' },
  unreliable: { color: RISK.critical.text, label: 'Unreliable' },
  untested: { color: '#5B6788', label: 'Not tested' },
};

// Viewer's left = bowler's right (front-facing).
const J = {
  head: [100, 30],
  shoulders: [[70, 72], [130, 72]],
  elbows: [[58, 118], [142, 118]],
  wrists: [[50, 162], [150, 162]],
  hips: [[82, 156], [118, 156]],
  knees: [[80, 214], [120, 214]],
  ankles: [[78, 270], [122, 270]],
} as const;

const LIMBS: [number, number, number, number][] = [
  [100, 46, 100, 72], // neck
  [70, 72, 130, 72],
  [70, 72, 58, 118], [58, 118, 50, 162],
  [130, 72, 142, 118], [142, 118, 150, 162],
  [70, 72, 82, 156], [130, 72, 118, 156], [82, 156, 118, 156],
  [82, 156, 80, 214], [80, 214, 78, 270],
  [118, 156, 120, 214], [120, 214, 122, 270],
];

/** Joint dot with a shape mark so the status reads without colour: tick, !, cross, or hollow. */
function Joint({ x, y, status, r = 8 }: { x: number; y: number; status: RegionStatus; r?: number }) {
  const c = STATUS[status].color;
  const k = r / 8;
  return (
    <G transform={`translate(${x} ${y})`}>
      {status !== 'untested' && <Circle r={r + 6} fill={c} fillOpacity={0.18} />}
      <Circle r={r} fill={status === 'untested' ? color.surface2 : c} stroke={status === 'untested' ? c : color.bg} strokeWidth={2} />
      {status === 'usable' && <Path d={`M ${-3.5 * k} ${0} L ${-1 * k} ${2.6 * k} L ${3.8 * k} ${-2.8 * k}`} stroke={color.bg} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {status === 'moderate' && (
        <G>
          <Line x1={0} y1={-4 * k} x2={0} y2={1 * k} stroke={color.bg} strokeWidth={2} strokeLinecap="round" />
          <Circle cx={0} cy={3.8 * k} r={1.2 * k} fill={color.bg} />
        </G>
      )}
      {status === 'unreliable' && <Path d={`M ${-3 * k} ${-3 * k} L ${3 * k} ${3 * k} M ${3 * k} ${-3 * k} L ${-3 * k} ${3 * k}`} stroke={color.bg} strokeWidth={2} strokeLinecap="round" />}
    </G>
  );
}

export function BodyReliabilityMap({ regions, legend = true }: { regions: Partial<Record<string, RegionStatus>>; legend?: boolean }) {
  const st: Record<BodyRegion, RegionStatus> = { head: 'untested', shoulders: 'untested', elbows: 'untested', wrists: 'untested', hips: 'untested', knees: 'untested', ankles: 'untested' };
  for (const [name, v] of Object.entries(regions)) {
    const r = toBodyRegion(name);
    if (r && v) st[r] = v;
  }
  const label = `Body reliability map. ${REGIONS.map((r) => `${REGION_LABEL[r]}: ${STATUS[st[r]].label}`).join('. ')}.`;
  const headC = STATUS[st.head].color;

  return (
    <View style={s.wrap}>
      <SvgBox w={200} h={290} label={label} style={{ maxWidth: 260, alignSelf: 'center' }}>
        {LIMBS.map(([x1, y1, x2, y2], i) => (
          <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#33406A" strokeWidth={7} strokeLinecap="round" />
        ))}
        <Circle cx={J.head[0]} cy={J.head[1]} r={17} fill={st.head === 'untested' ? color.surface2 : alpha(headC, 0.16)} stroke={headC} strokeWidth={2} />
        <Joint x={J.head[0]} y={J.head[1]} status={st.head} r={7} />
        {(['shoulders', 'elbows', 'wrists', 'hips', 'knees', 'ankles'] as const).map((r) =>
          J[r].map(([x, y]) => <Joint key={`${r}${x}`} x={x} y={y} status={st[r]} />))}
      </SvgBox>

      {legend && (
        <View style={s.legend}>
          {(Object.keys(STATUS) as RegionStatus[]).map((k) => (
            <View key={k} style={s.legendItem}>
              <Svg width={26} height={26} viewBox="-14 -14 28 28"><Joint x={0} y={0} status={k} r={7} /></Svg>
              <Text style={s.legendText}>{STATUS[k].label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: sp(1.5), width: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: sp(2), rowGap: sp(1) },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { ...font.caption, fontSize: 13, color: color.text },
});
