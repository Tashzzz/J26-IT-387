// C2 (Tashini) - "Key moments" card: back-foot contact, front-foot contact and ball release as a vertical
// stepper. Each moment shows a small pose pictogram, its time in the clip, the gap to the next moment and
// the joint angles measured at that moment (chip colour = that angle's traffic light). A thin clip bar at
// the bottom shows where the delivery stride sits in the video. Colours match DeliveryPlayer's markers.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { alpha, Card, color, font, radius, sp } from '../ui';
import type { EventMethod, EventName, FeatureName, FeatureRow } from './types';
import { featureStatus } from './ui';

type Pose = 'bfc' | 'ffc' | 'release';

const MOMENTS: {
  key: EventName; pose: Pose; title: string; short: string; color: string;
  angles: { name: FeatureName; label: string }[];
}[] = [
  {
    key: 'bfc_frame', pose: 'bfc', title: 'Back foot lands', short: 'BFC', color: '#A78BFA',
    angles: [
      { name: 'rear_knee_flexion_bfc_deg', label: 'Back knee' },
      { name: 'rear_hip_flexion_bfc_deg', label: 'Back hip' },
      { name: 'hip_shoulder_separation_bfc_deg', label: 'Hips vs shoulders' },
    ],
  },
  {
    key: 'ffc_frame', pose: 'ffc', title: 'Front foot lands', short: 'FFC', color: '#22D3EE',
    angles: [
      { name: 'front_knee_flexion_ffc_deg', label: 'Front knee' },
      { name: 'front_hip_flexion_ffc_deg', label: 'Front hip' },
      { name: 'shoulder_counter_rotation_deg', label: 'Shoulder twist' },
    ],
  },
  {
    key: 'release_frame', pose: 'release', title: 'Ball release', short: 'Release', color: '#F472B6',
    angles: [
      { name: 'trunk_lateral_flexion_deg', label: 'Side lean' },
      { name: 'front_knee_flexion_release_deg', label: 'Front knee' },
    ],
  },
];

const METHOD: Record<EventMethod, { text: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  model: { text: 'AI model', icon: 'hardware-chip-outline' },
  auto: { text: 'Auto', icon: 'sparkles' },
  estimated: { text: 'Auto', icon: 'sparkles' },
  c1_window: { text: 'Auto', icon: 'sparkles' },
  manual: { text: 'Edited', icon: 'create-outline' },
  not_detected: { text: 'Not found', icon: 'remove-circle-outline' },
};

const ok = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);
const secs = (f: number, fps: number) => `${(f / fps).toFixed(2)} s`;

/** Tiny side-on bowler (facing right) in the pose of each moment. */
function PoseIcon({ pose, tint }: { pose: Pose; tint: string }) {
  const st = { stroke: tint, strokeWidth: 2.6, strokeLinecap: 'round' as const };
  // shared: head, trunk from neck (20,13) to hip (18,27)
  const limbs: Record<Pose, [number, number, number, number][]> = {
    // back foot planted under the hips, front knee lifting, bowling arm low behind
    bfc: [[18, 27, 14, 35], [14, 35, 15, 42], [18, 27, 26, 32], [26, 32, 27, 39], [20, 15, 13, 20], [13, 20, 8, 25], [20, 15, 27, 13], [27, 13, 32, 9]],
    // long stride: front foot down ahead, back foot trailing, bowling arm swinging up behind
    ffc: [[18, 27, 9, 34], [9, 34, 5, 41], [18, 27, 27, 34], [27, 34, 31, 42], [20, 15, 12, 10], [12, 10, 9, 4], [20, 15, 28, 18], [28, 18, 33, 22]],
    // braced front leg, bowling arm straight overhead
    release: [[18, 27, 11, 34], [11, 34, 8, 41], [18, 27, 26, 34], [26, 34, 30, 42], [20, 14, 22, 7], [22, 7, 24, 1], [20, 15, 27, 21], [27, 21, 30, 27]],
  };
  return (
    <Svg width={40} height={44} viewBox="0 0 40 44">
      <Circle cx={21} cy={7.5} r={4} fill={tint} />
      <Line x1={20} y1={13} x2={18} y2={27} {...st} />
      {limbs[pose].map(([x1, y1, x2, y2], i) => <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} {...st} />)}
    </Svg>
  );
}

export function KeyMomentsCard({ row }: { row: FeatureRow }) {
  const fps = row.fps > 0 ? row.fps : 30;
  const frames = MOMENTS.map((m) => row.events[m.key]);
  const total = row.series ? Math.max(0, ...Object.values(row.series).map((v) => v.length)) : 0;
  const span = total > 0 ? total : Math.max(10, ...frames.filter(ok)) + 10;
  const [bfc, , rel] = frames;
  const stride = ok(bfc) && ok(rel) && rel > bfc ? (rel - bfc) / fps : null;
  const pct = (f: number) => `${(Math.min(Math.max(f, 0), span) / span) * 100}%` as const;

  return (
    <Card>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.h2}>Key moments</Text>
          <Text style={s.muted}>Found automatically from the video</Text>
        </View>
        {stride !== null && (
          <View style={s.stride}>
            <Text style={s.strideValue}>{stride.toFixed(2)} s</Text>
            <Text style={s.strideLabel}>delivery stride</Text>
          </View>
        )}
      </View>

      <View style={{ marginTop: sp(2) }}>
        {MOMENTS.map((m, i) => {
          const f = frames[i];
          const next = frames[i + 1];
          const found = ok(f);
          const method = METHOD[row.event_method?.[m.key] ?? (found ? 'auto' : 'not_detected')];
          const last = i === MOMENTS.length - 1;
          const gapMs = found && ok(next) && next > f ? Math.round(((next - f) / fps) * 1000) : null;
          return (
            <View key={m.key} style={s.step}>
              {/* rail: pose badge + connector */}
              <View style={s.rail}>
                <View style={[s.badge, { backgroundColor: alpha(m.color, found ? 0.16 : 0.06), borderColor: alpha(m.color, found ? 0.7 : 0.3) }]}>
                  <PoseIcon pose={m.pose} tint={found ? m.color : alpha(m.color, 0.4)} />
                </View>
                {!last && (
                  <View style={s.connector}>
                    <View style={[s.line, { backgroundColor: alpha(m.color, 0.45) }]} />
                    {gapMs !== null && <Text style={s.gap} numberOfLines={1}>+{gapMs} ms</Text>}
                  </View>
                )}
              </View>

              {/* content */}
              <View style={[s.body, !last && { paddingBottom: sp(2.5) }]}>
                <View style={s.titleRow}>
                  <Text style={[s.short, { color: m.color }]}>{m.short}</Text>
                  <View style={[s.method, { borderColor: alpha(m.color, 0.45) }]}>
                    <Ionicons name={method.icon} size={11} color={m.color} />
                    <Text style={[s.methodText, { color: m.color }]}>{method.text}</Text>
                  </View>
                </View>
                <Text style={s.title}>{m.title}</Text>
                <Text style={s.time}>{found ? `${secs(f, fps)}  ·  frame ${f}` : 'Not found in this clip'}</Text>

                <View style={s.chips}>
                  {m.angles.map((a) => {
                    const feat = row.features[a.name];
                    if (!feat) return null;
                    const stt = featureStatus(feat);
                    const c = feat.level === 'none' ? color.muted : stt.color;
                    return (
                      <View key={a.name} style={[s.chip, { backgroundColor: alpha(c, 0.12), borderColor: alpha(c, 0.4) }]}
                        accessible accessibilityLabel={`${a.label} ${feat.value === null ? 'no value' : `${feat.value.toFixed(0)} degrees`}, ${stt.text}`}>
                        <View style={[s.chipDot, { backgroundColor: c }]} />
                        <Text style={s.chipLabel}>{a.label}</Text>
                        <Text style={[s.chipValue, { color: feat.level === 'none' ? color.text : c }]}>
                          {feat.value === null ? '—' : `${feat.value.toFixed(0)}°`}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* where the stride sits in the clip */}
      <View style={s.clip} accessible accessibilityLabel={`Clip of ${(span / fps).toFixed(1)} seconds with the three key moments marked`}>
        <View style={s.track}>
          {ok(bfc) && ok(rel) && rel > bfc && (
            <View style={[s.strideBar, { left: pct(bfc), width: `${((rel - bfc) / span) * 100}%` }]} />
          )}
          {MOMENTS.map((m, i) => ok(frames[i]) ? (
            <View key={m.key} style={[s.tick, { left: pct(frames[i] as number), backgroundColor: m.color }]} />
          ) : null)}
        </View>
        <View style={s.clipLabels}>
          <Text style={s.caption}>0 s</Text>
          <Text style={s.caption}>{(span / fps).toFixed(1)} s</Text>
        </View>
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5) },
  h2: { ...font.h2, color: color.text },
  muted: { ...font.caption, color: color.muted, marginTop: 2 },
  stride: { alignItems: 'flex-end', backgroundColor: color.surface2, borderRadius: radius.sm, paddingHorizontal: sp(1.25), paddingVertical: sp(0.75) },
  strideValue: { ...font.h2, color: color.text, fontVariant: ['tabular-nums'] },
  strideLabel: { ...font.caption, color: color.muted },

  step: { flexDirection: 'row', gap: sp(1.5) },
  rail: { width: 52, alignItems: 'center' },
  badge: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  connector: { flex: 1, alignSelf: 'stretch', alignItems: 'center', minHeight: 24 },
  line: { width: 2, flex: 1, borderRadius: 1, marginVertical: 4 },
  gap: { ...font.caption, color: color.muted, position: 'absolute', top: '38%', left: -10, width: 72, textAlign: 'center', backgroundColor: color.surface, fontVariant: ['tabular-nums'] },

  body: { flex: 1, paddingTop: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  short: { ...font.overline },
  method: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: radius.chip, paddingHorizontal: 6, paddingVertical: 1 },
  methodText: { fontSize: 11, fontWeight: '700' },
  title: { ...font.h2, color: color.text, marginTop: 2 },
  time: { ...font.caption, color: color.muted, marginTop: 2, fontVariant: ['tabular-nums'] },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: sp(1) },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: radius.chip, paddingHorizontal: 8, paddingVertical: 3 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipLabel: { ...font.caption, color: color.text },
  chipValue: { ...font.caption, fontWeight: '700', fontVariant: ['tabular-nums'] },

  clip: { marginTop: sp(2), gap: 4 },
  track: { height: 8, borderRadius: 4, backgroundColor: color.surface2, overflow: 'hidden' },
  strideBar: { position: 'absolute', top: 0, bottom: 0, backgroundColor: alpha('#A78BFA', 0.35) },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 3, marginLeft: -1.5, borderRadius: 1.5 },
  clipLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  caption: { ...font.caption, color: color.muted },
});
