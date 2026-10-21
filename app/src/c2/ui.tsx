// C2 (Samarasinghe) - pieces of the Joint angles screen. Built from the shared blocks in src/c4/ui.tsx
// and the colours in src/c4/theme.ts only, so a later restyle of those two files restyles this screen too.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../c4/theme';
import { Body, Card } from '../c4/ui';
import type { EventMethod, EventName, Events, Feature, FeatureName, Level, Threshold } from './types';

// ---------- Plain-English names (the API uses code names) ----------

export const FEATURE_ORDER: FeatureName[] = [
  'shoulder_counter_rotation_deg',
  'front_knee_flexion_release_deg',
  'trunk_lateral_flexion_deg',
  'front_knee_flexion_ffc_deg',
  'rear_hip_flexion_bfc_deg',
  'rear_knee_flexion_bfc_deg',
  'front_hip_flexion_ffc_deg',
  'hip_shoulder_separation_bfc_deg',
];

// Plain names for coaches (physiotherapist review, 20 Oct) + the technical name shown small underneath.
export const FEATURE_LABEL: Record<FeatureName, string> = {
  shoulder_counter_rotation_deg: 'Shoulder twist',
  front_knee_flexion_release_deg: 'Front knee bend at release',
  trunk_lateral_flexion_deg: 'Sideways body lean at release',
  front_knee_flexion_ffc_deg: 'Front knee bend at landing',
  hip_shoulder_separation_bfc_deg: 'Hips vs shoulders at back-foot landing',
  rear_knee_flexion_bfc_deg: 'Back knee bend at back-foot landing',
  rear_hip_flexion_bfc_deg: 'Back hip bend at back-foot landing',
  front_hip_flexion_ffc_deg: 'Front hip bend at front-foot landing',
};

export const TECH_LABEL: Record<FeatureName, string> = {
  shoulder_counter_rotation_deg: 'shoulder counter-rotation, BFC → FFC',
  front_knee_flexion_release_deg: 'front-knee flexion at ball release',
  trunk_lateral_flexion_deg: 'trunk lateral flexion at ball release',
  front_knee_flexion_ffc_deg: 'front-knee flexion at front-foot contact',
  hip_shoulder_separation_bfc_deg: 'hip–shoulder separation at back-foot contact',
  rear_knee_flexion_bfc_deg: 'rear-knee flexion at back-foot contact',
  rear_hip_flexion_bfc_deg: 'rear-hip flexion at back-foot contact',
  front_hip_flexion_ffc_deg: 'front-hip flexion at front-foot contact',
};

const EVENT_LABEL: Record<EventName, string> = {
  bfc_frame: 'Back-foot contact (BFC)',
  ffc_frame: 'Front-foot contact (FFC)',
  release_frame: 'Ball release',
};

const METHOD_LABEL: Record<EventMethod, string> = {
  auto: 'found automatically',
  estimated: 'found automatically · check on video',
  manual: 'corrected by hand',
  c1_window: 'from the video tracking',
  not_detected: 'not found',
};

const fmt = (deg: number | null) => (deg === null ? '—' : `${deg.toFixed(1)}°`);

// ---------- Traffic light ----------

type Status = { text: string; color: string; icon: keyof typeof Ionicons.glyphMap };

/**
 * One status per feature. An unreliable value is never shown as a confident red breach:
 * it gets the warning colour and "check on video" instead.
 */
export function featureStatus(f: Feature): Status {
  if (f.value === null) return { text: 'No value', color: colors.muted, icon: 'remove-circle-outline' };
  if (f.threshold === null || f.level === 'none') return { text: 'No limit · reported only', color: colors.muted, icon: 'information-circle-outline' };
  if (!f.reliable) {
    return f.breach
      ? { text: 'Over the limit · low visibility', color: colors.warn, icon: 'eye-off-outline' }
      : { text: 'Low visibility', color: colors.muted, icon: 'eye-off-outline' };
  }
  const byLevel: Record<Level, Status> = {
    red: { text: 'Over risk limit', color: colors.danger, icon: 'alert-circle' },
    amber: { text: 'Close to the limit', color: colors.warn, icon: 'warning-outline' },
    green: { text: 'OK', color: colors.ok, icon: 'checkmark-circle-outline' },
    none: { text: 'No limit · reported only', color: colors.muted, icon: 'information-circle-outline' },
  };
  return byLevel[f.level];
}

/** "Breach if more than 30°" / "Breach if less than 30°" / "No published limit". */
export function ruleText(f: Pick<Feature, 'threshold' | 'rule'>, name?: FeatureName): string {
  if (name === 'front_knee_flexion_release_deg') return 'Red if straighter than 150° (bend under 30°) together with twist or lean';
  if (f.threshold === null || !f.rule) return 'No published limit';
  return `Breach if ${f.rule === 'above' ? 'more' : 'less'} than ${f.threshold}°`;
}

// ---------- Cards ----------

export function FeatureCard({ name, f, info, trueValue }: {
  name: FeatureName; f: Feature; info?: Threshold; trueValue?: number;
}) {
  const st = featureStatus(f);
  return (
    <Card style={{ borderColor: st.color === colors.muted ? colors.border : st.color }}>
      <Text style={s.title}>{FEATURE_LABEL[name]}</Text>
      <Text style={s.small}>{TECH_LABEL[name]}</Text>
      {info?.meaning ? <Body muted>{info.meaning}</Body> : null}

      <View style={s.valueRow}>
        <Text style={[s.value, { color: st.color === colors.muted ? colors.text : st.color }]}>{fmt(f.value)}</Text>
        <View style={[s.pill, { borderColor: st.color }]}>
          <Ionicons name={st.icon} size={14} color={st.color} />
          <Text style={[s.pillText, { color: st.color }]}>{st.text}</Text>
        </View>
      </View>

      {f.note && f.value !== null ? <Text style={[s.note, { color: st.color === colors.muted ? colors.text : st.color }]}>{f.note}</Text> : null}
      <Text style={s.small}>{ruleText(f, name)} · measured at {f.event.replace(/_/g, ' ').replace('bfc', 'BFC').replace('ffc', 'FFC')} · {f.method.toUpperCase()}</Text>
      {trueValue !== undefined ? <Text style={s.small}>Demo built with {fmt(trueValue)} (the measured value should be close)</Text> : null}

      {!f.reliable && f.value !== null ? (
        <View style={s.warn}>
          <Ionicons name="eye-off-outline" size={16} color={colors.warn} />
          <Text style={s.warnText}>
            Low visibility · check camera setup.
            {f.view_suitability === 'poor'
              ? ` This camera view cannot see this angle well: film ${name.startsWith('front_knee') ? 'side-on' : 'from behind or in front of'} the bowler.`
              : ' The tracking is not reliable for these joints from this camera position.'}
            {f.unusable_keypoints?.length ? ` (${f.unusable_keypoints.join(', ').replace(/_/g, ' ')})` : ''}
          </Text>
        </View>
      ) : null}

      {info?.evidence ? <Text style={s.small}>Evidence: {info.evidence}</Text> : null}
      <Text style={s.source}>Source: {f.source}</Text>
    </Card>
  );
}

export function EventsCard({ events, method, fps }: { events: Events; method: Record<EventName, EventMethod>; fps: number }) {
  const names: EventName[] = ['bfc_frame', 'ffc_frame', 'release_frame'];
  return (
    <Card>
      {names.map((n) => {
        const fr = events[n];
        return (
          <View key={n} style={s.eventRow}>
            <Text style={s.eventName}>{EVENT_LABEL[n]}</Text>
            <Text style={[s.eventValue, fr === undefined && { color: colors.muted }]}>
              {fr === undefined ? 'not found' : `frame ${fr} · ${(fr / fps).toFixed(2)} s`}
            </Text>
            <Text style={s.small}>{METHOD_LABEL[method[n] ?? 'not_detected']}</Text>
          </View>
        );
      })}
    </Card>
  );
}

const s = StyleSheet.create({
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  valueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  value: { fontSize: 30, fontWeight: '700' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  small: { color: colors.muted, fontSize: 12 },
  note: { fontSize: 14, fontWeight: '700' },
  source: { color: colors.muted, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  warn: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 2 },
  warnText: { color: colors.warn, fontSize: 13, flex: 1 },
  eventRow: { paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  eventName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  eventValue: { color: colors.accent, fontSize: 15, fontWeight: '700' },
});
