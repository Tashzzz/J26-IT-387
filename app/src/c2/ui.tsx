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
  'hip_shoulder_separation_bfc_deg',
];

export const FEATURE_LABEL: Record<FeatureName, string> = {
  shoulder_counter_rotation_deg: 'Shoulder counter-rotation',
  front_knee_flexion_release_deg: 'Front-knee bend at release',
  trunk_lateral_flexion_deg: 'Trunk side-bend at release',
  front_knee_flexion_ffc_deg: 'Front-knee bend at front-foot contact',
  hip_shoulder_separation_bfc_deg: 'Hip–shoulder separation at back-foot contact',
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
  c1_window: 'from C1',
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
      ? { text: 'Over the limit · not confirmed', color: colors.warn, icon: 'help-circle-outline' }
      : { text: 'Within limit · not confirmed', color: colors.muted, icon: 'help-circle-outline' };
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
export function ruleText(f: Pick<Feature, 'threshold' | 'rule'>): string {
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
      {info?.meaning ? <Body muted>{info.meaning}</Body> : null}

      <View style={s.valueRow}>
        <Text style={[s.value, { color: st.color === colors.muted ? colors.text : st.color }]}>{fmt(f.value)}</Text>
        <View style={[s.pill, { borderColor: st.color }]}>
          <Ionicons name={st.icon} size={14} color={st.color} />
          <Text style={[s.pillText, { color: st.color }]}>{st.text}</Text>
        </View>
      </View>

      <Text style={s.small}>{ruleText(f)} · measured at {f.event.replace(/_/g, ' ').replace('bfc', 'BFC').replace('ffc', 'FFC')} · {f.method.toUpperCase()}</Text>
      {trueValue !== undefined ? <Text style={s.small}>Demo built with {fmt(trueValue)} (check: C2 should be close)</Text> : null}

      {!f.reliable && f.value !== null ? (
        <View style={s.warn}>
          <Ionicons name="eye-off-outline" size={16} color={colors.warn} />
          <Text style={s.warnText}>
            Camera view not reliable for this angle (C1 ICC)
            {f.unusable_keypoints?.length ? ` · ${f.unusable_keypoints.join(', ').replace(/_/g, ' ')}` : ''}
            {f.view_suitability === 'poor' ? ' · this view cannot see the angle well' : ''}
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
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  valueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  value: { fontSize: 30, fontWeight: '800' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  small: { color: colors.muted, fontSize: 12 },
  source: { color: colors.muted, fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  warn: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 2 },
  warnText: { color: colors.warn, fontSize: 13, flex: 1 },
  eventRow: { paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  eventName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  eventValue: { color: colors.accent, fontSize: 15, fontWeight: '700' },
});
