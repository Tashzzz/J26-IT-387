// "What you will see on your phone": a landscape phone with the bowler silhouette for each camera view.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, G, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { color, COMPONENT, font, RISK, sp } from '../theme';
import { CAMERA_VIEW, scene, SvgBox, type CameraView } from './common';

const W = 320;
const H = 200;
const CYAN = COMPONENT.c1.color;

type Pose = { head: [number, number, number]; limbs: number[][]; back?: boolean; stroke?: number };

/** Stick-figure bowler: head + limbs as polylines [x1, y1, x2, y2, ...]. back: back of the head (no face side). */
function Figure({ head, limbs, back, stroke = 7 }: Pose) {
  return (
    <G>
      {limbs.map((l, i) => (
        <Polyline key={i} points={l.join(' ')} fill="none" stroke={scene.figure} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <Circle cx={head[0]} cy={head[1]} r={head[2]} fill={back ? '#C9D2EA' : scene.figure} />
    </G>
  );
}

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 9;
  const p = (da: number) => `${x2 - h * Math.cos(a + da)},${y2 - h * Math.sin(a + da)}`;
  return (
    <G>
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={CYAN} strokeWidth={3} strokeLinecap="round" />
      <Polygon points={`${x2},${y2} ${p(0.5)} ${p(-0.5)}`} fill={CYAN} />
    </G>
  );
}

function Note({ x, y, text, anchor = 'start' }: { x: number; y: number; text: string; anchor?: 'start' | 'end' | 'middle' }) {
  return <SvgText x={x} y={y} fill={CYAN} fontSize={11} fontWeight="800" textAnchor={anchor}>{text}</SvgText>;
}

function Stumps({ x, y, h, w }: { x: number; y: number; h: number; w: number }) {
  return (
    <G>
      {[0, 0.5, 1].map((t) => <Line key={t} x1={x + t * w} y1={y} x2={x + t * w} y2={y + h} stroke={scene.stumps} strokeWidth={Math.max(1.5, w / 6)} strokeLinecap="round" />)}
    </G>
  );
}

// Profile pose facing right, in the delivery stride, bowling arm high.
const PROFILE: Pose = {
  head: [162, 46, 11],
  limbs: [
    [158, 58, 148, 98],
    [148, 98, 168, 120, 186, 144],
    [148, 98, 132, 122, 116, 144],
    [156, 62, 150, 38, 146, 16],
    [156, 62, 176, 60, 192, 50],
  ],
};

function Scene({ view }: { view: CameraView }) {
  switch (view) {
    case 'side':
      return (
        <G>
          <Rect x={0} y={140} width={292} height={36} fill={scene.ground} />
          <Rect x={0} y={140} width={292} height={12} fill={scene.pitch} opacity={0.7} />
          <Stumps x={112} y={112} h={34} w={10} />
          <Line x1={96} y1={70} x2={120} y2={70} stroke={scene.figure} strokeOpacity={0.3} strokeWidth={3} strokeLinecap="round" />
          <Line x1={90} y1={86} x2={118} y2={86} stroke={scene.figure} strokeOpacity={0.3} strokeWidth={3} strokeLinecap="round" />
          <Figure {...PROFILE} />
          <Arrow x1={204} y1={30} x2={262} y2={30} />
          <Note x={233} y={52} text="left → right" anchor="middle" />
        </G>
      );
    case 'semi_side':
      return (
        <G>
          <Rect x={0} y={120} width={292} height={56} fill={scene.ground} />
          <Polygon points="10,118 46,114 292,150 292,176 214,176" fill={scene.pitch} opacity={0.7} />
          <Line x1={72} y1={126} x2={110} y2={126} stroke={scene.crease} strokeOpacity={0.6} strokeWidth={2} />
          <G transform="translate(30 4) scale(0.82 1)">
            <Figure {...PROFILE} limbs={[...PROFILE.limbs, [148, 64, 170, 64]]} />
          </G>
          <Arrow x1={196} y1={34} x2={250} y2={64} />
          <Note x={222} y={92} text="toward you, at 45°" anchor="middle" />
        </G>
      );
    case 'front':
      return (
        <G>
          <Rect x={0} y={106} width={292} height={70} fill={scene.ground} />
          <Polygon points="128,106 164,106 240,176 52,176" fill={scene.pitch} opacity={0.75} />
          <Figure stroke={5} head={[146, 40, 8]} limbs={[
            [146, 49, 146, 80], [132, 54, 160, 54],
            [160, 54, 166, 36, 164, 20], [132, 54, 122, 64, 118, 74],
            [146, 80, 138, 96, 134, 110], [146, 80, 156, 96, 160, 110],
          ]} />
          <Circle cx={186} cy={138} r={9} fill={RISK.critical.text} />
          <Path d="M 180 134 Q 186 138 192 142" stroke={color.bg} strokeWidth={1.5} fill="none" />
          <Line x1={170} y1={122} x2={176} y2={128} stroke={CYAN} strokeWidth={2} strokeLinecap="round" />
          <Line x1={164} y1={128} x2={172} y2={134} stroke={CYAN} strokeWidth={2} strokeLinecap="round" />
          <Stumps x={130} y={150} h={30} w={32} />
          <Note x={284} y={24} text="ball toward you" anchor="end" />
        </G>
      );
    case 'rear':
      return (
        <G>
          <Rect x={0} y={70} width={292} height={106} fill={scene.ground} />
          <Polygon points="136,70 156,70 252,176 40,176" fill={scene.pitch} opacity={0.75} />
          <Stumps x={141} y={58} h={12} w={10} />
          <Circle cx={150} cy={84} r={3.5} fill={RISK.critical.text} />
          <Figure back head={[146, 46, 13]} limbs={[
            [146, 58, 146, 110], [124, 66, 168, 66],
            [168, 66, 176, 42, 174, 18], [124, 66, 112, 84, 106, 100],
            [146, 110, 134, 136, 128, 164], [146, 110, 160, 136, 166, 164],
          ]} />
          <Arrow x1={206} y1={110} x2={186} y2={80} />
          <Note x={284} y={24} text="ball goes away" anchor="end" />
        </G>
      );
  }
}

export function CameraViewPreview({ angle, caption = true }: { angle: CameraView; caption?: boolean }) {
  const v = CAMERA_VIEW[angle];
  return (
    <View style={{ gap: sp(1) }}>
      <SvgBox w={W} h={H} label={`What the ${v.label} video looks like: ${v.sees}`}>
        <Rect x={1} y={1} width={W - 2} height={H - 2} rx={28} fill="#05070D" stroke={color.border} strokeWidth={2} />
        <Circle cx={8} cy={H / 2} r={3} fill={color.border} />
        <G transform="translate(14 12)">
          <Rect x={0} y={0} width={292} height={176} rx={16} fill={scene.screen} />
          {/* rule-of-thirds guide */}
          {[97, 195].map((x) => <Line key={x} x1={x} y1={0} x2={x} y2={176} stroke={color.text} strokeOpacity={0.06} />)}
          {[59, 117].map((y) => <Line key={y} x1={0} y1={y} x2={292} y2={y} stroke={color.text} strokeOpacity={0.06} />)}
          <Scene view={angle} />
          <Circle cx={18} cy={18} r={5} fill={RISK.critical.color} />
          <SvgText x={28} y={22} fill={color.text} fontSize={11} fontWeight="800">REC</SvgText>
        </G>
      </SvgBox>
      {caption && (
        <View style={{ gap: 2 }}>
          <Text style={s.title}>What you will see · {v.label}</Text>
          <Text style={s.text}>{v.sees}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  title: { ...font.h2, color: color.text },
  text: { ...font.body, color: color.muted },
});
