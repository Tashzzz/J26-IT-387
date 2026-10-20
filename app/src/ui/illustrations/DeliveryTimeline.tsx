// Horizontal frame timeline with pins for back-foot contact, front-foot contact and release (frames from C2).
// Pins stand at different heights so close events never overlap.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { alpha, color, COMPONENT, font, sp } from '../theme';
import { SvgBox } from './common';

const W = 320;
const H = 124;
const X0 = 20;
const X1 = 300;
const BAR_Y = 90;
const BAR_H = 10;

type Key = 'bfc' | 'ffc' | 'release';
const EVENTS: { key: Key; letter: string; short: string; label: string; color: string; headY: number }[] = [
  { key: 'bfc', letter: 'B', short: 'BFC', label: 'Back-foot contact', color: '#A78BFA', headY: 66 },
  { key: 'ffc', letter: 'F', short: 'FFC', label: 'Front-foot contact', color: '#22D3EE', headY: 42 },
  { key: 'release', letter: 'R', short: 'REL', label: 'Release', color: '#F472B6', headY: 18 },
];

const ok = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

export function DeliveryTimeline({ bfc, ffc, release, total, fps }: {
  bfc?: number | null;
  ffc?: number | null;
  release?: number | null;
  /** Number of frames in the clip. */
  total: number;
  /** Optional: shows times next to the frame numbers. */
  fps?: number | null;
}) {
  const frames: Record<Key, number | null | undefined> = { bfc, ffc, release };
  const known = [bfc, ffc, release].filter(ok);
  const span = total > 0 ? total : Math.max(10, ...known) + 10;
  const x = (f: number) => X0 + (Math.min(Math.max(f, 0), span) / span) * (X1 - X0);
  const strideFrom = ok(bfc) ? bfc : null;
  const strideTo = ok(release) ? release : ok(ffc) ? ffc : null;
  const time = (f: number) => (fps ? ` · ${(f / fps).toFixed(2)} s` : '');
  const c2 = COMPONENT.c2.color;

  const label = `Delivery timeline, ${span} frames. ` + EVENTS.map((e) => {
    const f = frames[e.key];
    return `${e.label}: ${ok(f) ? `frame ${f}` : 'not detected'}`;
  }).join('. ');

  return (
    <View style={{ gap: sp(1.5) }}>
      <SvgBox w={W} h={H} label={label}>
        <Rect x={X0} y={BAR_Y} width={X1 - X0} height={BAR_H} rx={BAR_H / 2} fill={color.surface2} />
        {strideFrom != null && strideTo != null && strideTo > strideFrom && (
          <Rect x={x(strideFrom)} y={BAR_Y} width={x(strideTo) - x(strideFrom)} height={BAR_H} rx={BAR_H / 2} fill={c2} fillOpacity={0.6} />
        )}
        <SvgText x={X0} y={H - 4} fill={color.muted} fontSize={10} fontWeight="600">0</SvgText>
        <SvgText x={X1} y={H - 4} fill={color.muted} fontSize={10} fontWeight="600" textAnchor="end">{span} frames</SvgText>

        {EVENTS.map((e) => {
          const f = frames[e.key];
          if (!ok(f)) return null;
          const px = x(f);
          const right = px < X1 - 70;
          return (
            <G key={e.key}>
              <Line x1={px} y1={e.headY + 10} x2={px} y2={BAR_Y + BAR_H} stroke={e.color} strokeWidth={2} />
              <Circle cx={px} cy={BAR_Y + BAR_H / 2} r={4} fill={e.color} stroke={color.bg} strokeWidth={1.5} />
              <Circle cx={px} cy={e.headY} r={10} fill={e.color} />
              <SvgText x={px} y={e.headY + 4} fill={color.bg} fontSize={11} fontWeight="800" textAnchor="middle">{e.letter}</SvgText>
              <SvgText x={right ? px + 15 : px - 15} y={e.headY + 4} fill={e.color} fontSize={11} fontWeight="800" textAnchor={right ? 'start' : 'end'}>
                {e.short} · {f}
              </SvgText>
            </G>
          );
        })}
      </SvgBox>

      <View style={s.legend}>
        {EVENTS.map((e) => {
          const f = frames[e.key];
          return (
            <View key={e.key} style={s.row}>
              <View style={[s.dot, { backgroundColor: ok(f) ? e.color : 'transparent', borderColor: e.color }]}>
                <Text style={[s.dotText, { color: ok(f) ? color.bg : e.color }]}>{e.letter}</Text>
              </View>
              <Text style={s.name}>{e.label}</Text>
              <Text style={[s.value, !ok(f) && { color: color.muted }]}>{ok(f) ? `frame ${f}${time(f)}` : 'not detected'}</Text>
            </View>
          );
        })}
        {strideFrom != null && strideTo != null && strideTo > strideFrom && (
          <View style={s.row}>
            <View style={[s.swatch, { backgroundColor: alpha(c2, 0.6) }]} />
            <Text style={[s.name, { color: color.muted }]}>Delivery stride ({ok(release) ? 'BFC → release' : 'BFC → FFC'})</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  legend: { gap: sp(1) },
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotText: { fontSize: 11, fontWeight: '800' },
  swatch: { width: 22, height: 8, borderRadius: 4 },
  name: { ...font.body, color: color.text, flex: 1 },
  value: { ...font.body, color: color.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
