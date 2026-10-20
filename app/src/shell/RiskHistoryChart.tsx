// Mini line chart of C3 risk scores over time (from c3.history), points coloured by level.
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import type { HistoryItem } from '../c3/types';
import { color, COMPONENT, font, RISK } from '../ui';
import { levelOf } from './squad';

const W = 320;
const H = 140;
const PAD = { l: 28, r: 12, t: 12, b: 24 };

export function RiskHistoryChart({ items }: { items: HistoryItem[] }) {
  // c3.history is newest first; draw oldest -> newest.
  const pts = [...items].reverse();
  if (pts.length === 0) return <Text style={{ ...font.body, color: color.muted }}>No risk assessments yet.</Text>;

  const x = (i: number) => PAD.l + (pts.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i / (pts.length - 1)) * (W - PAD.l - PAD.r));
  const y = (score: number) => PAD.t + (1 - Math.min(1, Math.max(0, score))) * (H - PAD.t - PAD.b);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.risk_score)}`).join(' ');
  const area = `${line} L ${x(pts.length - 1)} ${H - PAD.b} L ${x(0)} ${H - PAD.b} Z`;
  const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const c3 = COMPONENT.c3.color;
  const last = pts[pts.length - 1];

  return (
    <View style={{ width: '100%', aspectRatio: W / H }} accessible accessibilityRole="image"
      accessibilityLabel={`Risk history, ${pts.length} assessments. Latest ${Math.round(last.risk_score * 100)} out of 100 on ${date(last.created_at)}.`}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id="riskArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c3} stopOpacity={0.35} />
            <Stop offset="1" stopColor={c3} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {[0, 0.5, 1].map((v) => (
          <React.Fragment key={v}>
            <Line x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)} stroke={color.border} strokeDasharray={v === 0 ? undefined : '3 4'} />
            <SvgText x={PAD.l - 6} y={y(v) + 4} fill={color.muted} fontSize={10} textAnchor="end">{v * 100}</SvgText>
          </React.Fragment>
        ))}
        {pts.length > 1 && <Path d={area} fill="url(#riskArea)" />}
        {pts.length > 1 && <Path d={line} stroke={c3} strokeWidth={2.5} fill="none" strokeLinejoin="round" />}
        {pts.map((p, i) => {
          const l = levelOf(p);
          return <Circle key={p.id} cx={x(i)} cy={y(p.risk_score)} r={i === pts.length - 1 ? 6 : 4} fill={l ? RISK[l].color : c3} stroke={color.surface} strokeWidth={2} />;
        })}
        <SvgText x={x(0)} y={H - 6} fill={color.muted} fontSize={10} textAnchor={pts.length === 1 ? 'middle' : 'start'}>{date(pts[0].created_at)}</SvgText>
        {pts.length > 1 && <SvgText x={x(pts.length - 1)} y={H - 6} fill={color.muted} fontSize={10} textAnchor="end">{date(last.created_at)}</SvgText>}
      </Svg>
    </View>
  );
}
