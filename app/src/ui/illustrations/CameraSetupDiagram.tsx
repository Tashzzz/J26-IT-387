// Top-down pitch diagram showing where to stand the phone for each camera view.
// Batting end at the top, bowling end at the bottom; the bowler runs up the screen.
// Side and semi-side positions are drawn to scale (stumps 20.12 m apart); front and rear are fixed spots.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText,
} from 'react-native-svg';

import { alpha, color, COMPONENT, font, sp } from '../theme';
import { CAMERA_VIEW, scene, SvgBox, type CameraView } from './common';

const W = 360;
const H = 520;
const CX = 180;
const BAT_STUMPS = 80;
const BOWL_STUMPS = 344;
const PX_PER_M = (BOWL_STUMPS - BAT_STUMPS) / 20.12;
const POP = 1.22 * PX_PER_M; // popping crease in front of the stumps
const BOWLER = { x: 172, y: 338 }; // right-arm over: just left of the stumps, at the popping crease
const VIEWS: CameraView[] = ['side', 'semi_side', 'front', 'rear'];
const CYAN = COMPONENT.c1.color;

function cameraPos(v: CameraView, distance: number) {
  const d = Math.min(distance, 12) * PX_PER_M;
  switch (v) {
    case 'side': return { x: BOWLER.x + d, y: BOWLER.y };
    case 'semi_side': return { x: BOWLER.x + d * Math.SQRT1_2, y: BOWLER.y - d * Math.SQRT1_2 };
    case 'front': return { x: CX, y: BAT_STUMPS - 46 };
    case 'rear': return { x: CX, y: H - 18 };
  }
}

/** Phone-camera glyph centred on (0,0); the lens side points along +x. */
function CameraGlyph({ x, y, rot, tint, scale = 1 }: { x: number; y: number; rot: number; tint: string; scale?: number }) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${rot}) scale(${scale})`}>
      <Rect x={-12} y={-9} width={20} height={18} rx={4} fill={color.surface} stroke={tint} strokeWidth={2} />
      <Path d="M 8 -5 L 15 -9 L 15 9 L 8 5 Z" fill={tint} />
      <Circle cx={-2} cy={0} r={4} fill={tint} />
    </G>
  );
}

function Stumps({ y }: { y: number }) {
  return (
    <G>
      <Rect x={CX - 7} y={y - 2.5} width={14} height={5} rx={2} fill={scene.stumps} />
      {[-4.5, 0, 4.5].map((dx) => <Circle key={dx} cx={CX + dx} cy={y} r={1.6} fill={scene.pitch} />)}
    </G>
  );
}

/** Popping crease, bowling crease and return creases at one end; dir = -1 for the batting end (creases below). */
function Creases({ stumps, dir }: { stumps: number; dir: 1 | -1 }) {
  const pop = stumps - dir * POP;
  const ret = 1.32 * PX_PER_M;
  const back = stumps + dir * 10;
  const line = { stroke: scene.crease, strokeWidth: 1.5, strokeOpacity: 0.85 };
  return (
    <G>
      <Line x1={CX - 42} y1={pop} x2={CX + 42} y2={pop} {...line} />
      <Line x1={CX - ret} y1={stumps} x2={CX + ret} y2={stumps} {...line} />
      <Line x1={CX - ret} y1={pop} x2={CX - ret} y2={back} {...line} />
      <Line x1={CX + ret} y1={pop} x2={CX + ret} y2={back} {...line} />
    </G>
  );
}

export function CameraSetupDiagram({ angle, distance }: { angle?: CameraView | null; distance?: number | null }) {
  const d = distance ?? 5;
  const sel = angle ?? null;
  const cam = sel ? cameraPos(sel, d) : null;

  // Field-of-view cone: wide enough to frame the bowler with ~28 px either side.
  let cone: string | null = null;
  let mid: { x: number; y: number } | null = null;
  if (cam) {
    const dx = BOWLER.x - cam.x;
    const dy = BOWLER.y - cam.y;
    const dist = Math.hypot(dx, dy);
    const th = Math.atan2(dy, dx);
    const half = Math.atan(30 / dist);
    const L = dist + 26;
    const p = (a: number) => `${cam.x + L * Math.cos(a)} ${cam.y + L * Math.sin(a)}`;
    cone = `M ${cam.x} ${cam.y} L ${p(th - half)} L ${p(th + half)} Z`;
    mid = { x: cam.x + dx * 0.5, y: cam.y + dy * 0.5 };
  }

  const label = sel
    ? `Top-down pitch diagram. ${CAMERA_VIEW[sel].label} camera${distance ? ` about ${distance} metres from the bowler` : ''}. ${CAMERA_VIEW[sel].hint}`
    : 'Top-down pitch diagram showing the four camera positions: side, semi-side, front and rear.';

  return (
    <View style={{ gap: sp(1) }}>
      <SvgBox w={W} h={H} label={label}>
        <Defs>
          <RadialGradient id="camGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={CYAN} stopOpacity={0.55} />
            <Stop offset="1" stopColor={CYAN} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="pitchFill" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={scene.pitchEdge} />
            <Stop offset="0.5" stopColor={scene.pitch} />
            <Stop offset="1" stopColor={scene.pitchEdge} />
          </LinearGradient>
        </Defs>

        {/* Outfield with mowing stripes */}
        <Rect x={0} y={0} width={W} height={H} rx={24} fill={scene.grass} stroke={scene.grassEdge} strokeWidth={2} />
        {Array.from({ length: Math.ceil(H / 52) }, (_, i) => i % 2 === 0 ? null : (
          <Rect key={i} x={1} y={i * 52} width={W - 2} height={52} fill={scene.grassStripe} />
        ))}

        {/* Pitch strip, creases, stumps */}
        <Rect x={CX - 21} y={BAT_STUMPS - 26} width={42} height={BOWL_STUMPS - BAT_STUMPS + 52} rx={3} fill="url(#pitchFill)" />
        <Creases stumps={BAT_STUMPS} dir={-1} />
        <Creases stumps={BOWL_STUMPS} dir={1} />
        <Stumps y={BAT_STUMPS} />
        <Stumps y={BOWL_STUMPS} />
        <SvgText x={16} y={BAT_STUMPS + 4} fill={color.muted} fontSize={11} fontWeight="700">BATTING END</SvgText>
        <SvgText x={16} y={BOWL_STUMPS + 4} fill={color.muted} fontSize={11} fontWeight="700">BOWLING END</SvgText>

        {/* Ball path down the pitch */}
        <Line x1={BOWLER.x + 6} y1={BOWLER.y - 14} x2={CX} y2={BAT_STUMPS + 24} stroke={scene.crease} strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="2 5" />
        <Path d={`M ${CX - 4} ${BAT_STUMPS + 30} L ${CX} ${BAT_STUMPS + 22} L ${CX + 4} ${BAT_STUMPS + 30}`} stroke={scene.crease} strokeOpacity={0.5} strokeWidth={1.5} fill="none" />

        {/* Run-up arrow */}
        <Line x1={BOWLER.x} y1={H - 44} x2={BOWLER.x} y2={BOWLER.y + 22} stroke={scene.figure} strokeOpacity={0.7} strokeWidth={2.5} strokeDasharray="7 6" strokeLinecap="round" />
        <Path d={`M ${BOWLER.x - 7} ${BOWLER.y + 26} L ${BOWLER.x} ${BOWLER.y + 15} L ${BOWLER.x + 7} ${BOWLER.y + 26} Z`} fill={scene.figure} fillOpacity={0.85} />
        <SvgText x={BOWLER.x - 12} y={H - 70} fill={color.muted} fontSize={11} fontWeight="700" textAnchor="end">RUN-UP</SvgText>

        {/* Unselected camera spots, dimmed */}
        {VIEWS.filter((v) => v !== sel).map((v) => {
          const p = cameraPos(v, d);
          const rot = (Math.atan2(BOWLER.y - p.y, BOWLER.x - p.x) * 180) / Math.PI;
          return (
            <G key={v} opacity={sel ? 0.4 : 0.85}>
              <CameraGlyph x={p.x} y={p.y} rot={rot} tint={color.muted} scale={0.85} />
              <SvgText x={p.x + (v === 'front' || v === 'rear' ? 22 : 0)} y={v === 'front' || v === 'rear' ? p.y + 4 : p.y + 26}
                textAnchor={v === 'front' || v === 'rear' ? 'start' : 'middle'} fill={color.muted} fontSize={10} fontWeight="600">
                {CAMERA_VIEW[v].label}
              </SvgText>
            </G>
          );
        })}

        {/* Selected camera: cone, glow, distance */}
        {cam && cone && mid && sel && (
          <G>
            <Path d={cone} fill={CYAN} fillOpacity={0.14} stroke={CYAN} strokeOpacity={0.5} strokeWidth={1} />
            <Line x1={cam.x} y1={cam.y} x2={BOWLER.x} y2={BOWLER.y} stroke={CYAN} strokeOpacity={0.75} strokeWidth={1.5} strokeDasharray="4 4" />
          </G>
        )}

        {/* Bowler (top-down: shoulders, head, raised bowling arm) */}
        <Circle cx={BOWLER.x} cy={BOWLER.y} r={16} fill={scene.figure} fillOpacity={0.08} />
        <Ellipse cx={BOWLER.x} cy={BOWLER.y} rx={10} ry={5} fill={scene.figure} />
        <Line x1={BOWLER.x + 8} y1={BOWLER.y} x2={BOWLER.x + 11} y2={BOWLER.y - 12} stroke={scene.figure} strokeWidth={3.5} strokeLinecap="round" />
        <Circle cx={BOWLER.x} cy={BOWLER.y - 1} r={4.5} fill={color.surface2} stroke={scene.figure} strokeWidth={1.5} />
        <SvgText x={BOWLER.x - 22} y={BOWLER.y + 4} fill={scene.figure} fontSize={11} fontWeight="700" textAnchor="end">Bowler</SvgText>

        {cam && mid && sel && (
          <G>
            <Circle cx={cam.x} cy={cam.y} r={30} fill="url(#camGlow)" />
            <CameraGlyph x={cam.x} y={cam.y} rot={(Math.atan2(BOWLER.y - cam.y, BOWLER.x - cam.x) * 180) / Math.PI} tint={CYAN} />
            {distance ? (
              <G>
                <Rect x={mid.x - 24} y={mid.y - 11} width={48} height={22} rx={11} fill={color.bg} stroke={CYAN} strokeWidth={1.5} />
                <SvgText x={mid.x} y={mid.y + 4} fill={CYAN} fontSize={12} fontWeight="800" textAnchor="middle">~{distance} m</SvgText>
              </G>
            ) : null}
            <SvgText x={sel === 'front' || sel === 'rear' ? cam.x + 24 : cam.x} y={sel === 'front' || sel === 'rear' ? cam.y + 4 : cam.y + 28}
              textAnchor={sel === 'front' || sel === 'rear' ? 'start' : 'middle'} fill={CYAN} fontSize={12} fontWeight="800">
              {CAMERA_VIEW[sel].label}
            </SvgText>
          </G>
        )}
      </SvgBox>

      {sel ? (
        <View style={[s.caption, { borderColor: alpha(CYAN, 0.35) }]}>
          <Text style={[s.capTitle, { color: CYAN }]}>{CAMERA_VIEW[sel].label}{distance ? ` · ~${distance} m` : ''}</Text>
          <Text style={s.capText}>{CAMERA_VIEW[sel].hint}</Text>
        </View>
      ) : (
        <Text style={s.capText}>Pick a camera view to see where to stand the phone.</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  caption: { borderWidth: 1, borderRadius: 14, padding: sp(1.5), gap: 2, backgroundColor: alpha(CYAN, 0.06) },
  capTitle: { ...font.h2 },
  capText: { ...font.body, color: color.muted },
});
