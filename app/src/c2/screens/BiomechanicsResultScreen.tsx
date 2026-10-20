// C2 (Tashini) - full joint-angle result for one delivery. Used by the analysis flow and by the
// standalone Joint angles screen (app/features). Status, labels, rules and the detail card all come
// from src/c2/ui.tsx unchanged; this screen adds the delivery timeline and a value-vs-limit bar.
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  alpha, Card, color, COMPONENT, DeliveryTimeline, font, MetricTile, radius, RISK, SecondaryButton, sp, Tag,
} from '../../ui';
import type { Feature, FeatureName, FeatureRow, Threshold, Thresholds } from '../types';
import { EventsCard, FEATURE_LABEL, FEATURE_ORDER, FeatureCard, featureStatus, ruleText, TECH_LABEL } from '../ui';

const fmt = (deg: number | null) => (deg === null ? '—' : `${deg.toFixed(1)}°`);

/** Value against the published limit: green / amber (amber_band) / red zones, marker in the status colour. */
function LimitBar({ f, info, markerColor }: { f: Feature; info?: Threshold; markerColor: string }) {
  if (f.value === null || f.threshold === null || !f.rule) return null;
  const thr = f.threshold;
  const amber = info?.amber_band ?? 0;
  const max = Math.max(thr * 1.5, f.value * 1.15, thr + amber * 2, 10);
  const pct = (v: number) => `${(Math.min(Math.max(v, 0), max) / max) * 100}%` as const;
  const zones = f.rule === 'above'
    ? [{ from: 0, to: thr - amber, c: RISK.low.color }, { from: thr - amber, to: thr, c: RISK.moderate.color }, { from: thr, to: max, c: RISK.critical.color }]
    : [{ from: 0, to: thr, c: RISK.critical.color }, { from: thr, to: thr + amber, c: RISK.moderate.color }, { from: thr + amber, to: max, c: RISK.low.color }];
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`${fmt(f.value)} against a limit of ${thr}°`}>
      <View style={s.track}>
        {zones.filter((z) => z.to > z.from).map((z) => (
          <View key={z.from} style={[s.zone, { left: pct(z.from), width: `${((Math.min(z.to, max) - z.from) / max) * 100}%`, backgroundColor: alpha(z.c, 0.35) }]} />
        ))}
        <View style={[s.limit, { left: pct(thr) }]} />
        <View style={[s.marker, { left: pct(f.value), backgroundColor: markerColor }]} />
      </View>
      <View style={s.ticks}>
        <Text style={s.tick}>0°</Text>
        <Text style={[s.tick, { position: 'absolute', left: pct(thr), transform: [{ translateX: -14 }] }]}>limit {thr}°</Text>
      </View>
    </View>
  );
}

function AngleCard({ name, f, info, trueValue }: { name: FeatureName; f: Feature; info?: Threshold; trueValue?: number }) {
  const [open, setOpen] = useState(false);
  const st = featureStatus(f);
  const muted = st.color === color.muted; // featureStatus uses the shared muted colour for "no limit / no value"
  return (
    <View style={[s.card, { borderColor: muted ? color.border : alpha(st.color, 0.6) }]}>
      <Text style={s.title}>{FEATURE_LABEL[name]}</Text>
      <Text style={s.small}>{TECH_LABEL[name]}</Text>
      <View style={s.valueRow}>
        <Text style={[s.value, { color: muted ? color.text : st.color }]}>{fmt(f.value)}</Text>
        <View style={[s.pill, { borderColor: st.color, backgroundColor: alpha(st.color, 0.12) }]}>
          <Ionicons name={st.icon} size={14} color={st.color} />
          <Text style={[s.pillText, { color: st.color }]}>{st.text}</Text>
        </View>
      </View>
      <LimitBar f={f} info={info} markerColor={muted ? color.text : st.color} />
      <Text style={s.small}>{ruleText(f, name)}</Text>
      <View style={s.tags}>
        {!f.reliable && f.value !== null && <Tag label="Low visibility" icon="eye-off-outline" tint={RISK.moderate.color} />}
        {f.view_suitability !== 'good' && <Tag label={`View: ${f.view_suitability}`} />}
        {f.unusable_keypoints?.length ? <Tag label={`${f.unusable_keypoints.length} keypoint${f.unusable_keypoints.length === 1 ? '' : 's'} below ICC gate`} /> : null}
        <Tag label={f.method.toUpperCase()} />
      </View>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={s.more}>
        <Text style={[s.moreText, { color: COMPONENT.c2.color }]}>{open ? 'Hide details' : 'Meaning, evidence and source'}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={COMPONENT.c2.color} />
      </Pressable>
      {open && <FeatureCard name={name} f={f} info={info} trueValue={trueValue} />}
    </View>
  );
}

export function BiomechanicsResultScreen({ row, thresholds, children }: {
  row: FeatureRow;
  thresholds?: Thresholds | null;
  /** Extra blocks after the angles (e.g. frame correction and Send to C4 on the standalone screen). */
  children?: React.ReactNode;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const reliable = FEATURE_ORDER.filter((n) => row.features[n]?.reliable).length;
  const confirmedBreaches = FEATURE_ORDER.filter((n) => row.features[n]?.breach && row.features[n]?.reliable).length;
  const uncheckedBreaches = row.n_breaches - confirmedBreaches;
  const frames = row.series ? Math.max(0, ...Object.values(row.series).map((v) => v.length)) : 0;
  const tint = COMPONENT.c2.color;

  return (
    <View style={{ gap: sp(2) }}>
      {row.synthetic ? (
        <Card variant="glow" accent={RISK.moderate.color}>
          <Text style={[s.h2, { color: RISK.moderate.color }]}>SYNTHETIC DATA · not a real bowler</Text>
          <Text style={s.muted}>A made-up delivery with known angles, used to check the app and the maths.</Text>
        </Card>
      ) : (
        <Text style={s.h2}>{row.video_id}{row.view ? ` · ${row.view.replace('_', '-')} view` : ''} · {Math.round(row.fps)} fps</Text>
      )}

      <View style={s.tiles}>
        <MetricTile label="Red flags" value={confirmedBreaches} icon="alert-circle" tint={confirmedBreaches ? RISK.critical.text : RISK.low.color} />
        <MetricTile label="Reliable angles" value={`${reliable} / ${FEATURE_ORDER.length}`} icon="eye" tint={reliable ? color.text : RISK.critical.text} />
      </View>
      {uncheckedBreaches > 0 && (
        <Card style={{ borderColor: alpha(RISK.moderate.color, 0.6) }}>
          <Text style={[s.h2, { color: RISK.moderate.color }]}>{uncheckedBreaches} more over the limit · low visibility</Text>
          <Text style={s.muted}>Measured from a camera view that cannot see that angle reliably. Check the camera setup and the video before acting.</Text>
        </Card>
      )}

      <Card>
        <Text style={s.h2}>Delivery events</Text>
        <DeliveryTimeline bfc={row.events.bfc_frame} ffc={row.events.ffc_frame} release={row.events.release_frame} total={frames} fps={row.fps} />
        <EventsCard events={row.events} method={row.event_method} fps={row.fps} />
      </Card>

      <Text style={s.h2}>Joint angles</Text>
      {FEATURE_ORDER.filter((n) => row.features[n]).map((n) => (
        <AngleCard key={n} name={n} f={row.features[n]} info={thresholds?.[n]} trueValue={row.true_values?.[n]} />
      ))}

      <Card variant={confirmedBreaches > 0 ? 'glow' : 'plain'} accent={RISK.critical.color}>
        <View style={s.head}>
          <Ionicons name="alert-circle" size={20} color={RISK.critical.text} />
          <Text style={s.h2}>What a red angle means</Text>
        </View>
        <Text style={s.body}>1. Today: reduce bowling intensity and avoid long spells.</Text>
        <Text style={s.body}>2. Coaching: hip–shoulder alignment and technique drills.</Text>
        <Text style={s.body}>3. If red again in 2 or more sessions: refer to a sports physiotherapist for a lower-back check.</Text>
        <Text style={s.muted}>Screening, not a diagnosis: red means the angle is like the bowlers who got injured in published studies. Never judge on one ball - check one over (4–6 deliveries). A warning that repeats on 2 or more balls matters.</Text>
      </Card>

      {children}

      {row.warnings.length > 0 && (
        <>
          <SecondaryButton title={showNotes ? 'Hide technical notes' : `Technical notes (${row.warnings.length})`} icon="document-text-outline"
            tint={tint} onPress={() => setShowNotes(!showNotes)} />
          {showNotes && <Card>{row.warnings.map((w, i) => <Text key={i} style={s.muted}>• {w}</Text>)}</Card>}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  h2: { ...font.h2, color: color.text },
  body: { ...font.body, color: color.text },
  muted: { ...font.body, color: color.muted },
  head: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1) },
  card: { backgroundColor: color.surface, borderWidth: 1, borderRadius: radius.card, padding: sp(2), gap: sp(1) },
  title: { ...font.h2, color: color.text },
  small: { ...font.caption, color: color.muted },
  valueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: sp(1) },
  value: { fontSize: 30, fontWeight: '800' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  track: { height: 12, borderRadius: 6, backgroundColor: color.surface2, overflow: 'hidden' },
  zone: { position: 'absolute', top: 0, bottom: 0 },
  limit: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: color.text },
  marker: { position: 'absolute', top: 0, bottom: 0, width: 6, marginLeft: -3, borderRadius: 3, borderWidth: 1, borderColor: color.bg },
  ticks: { height: 16, position: 'relative' },
  tick: { ...font.caption, color: color.muted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40 },
  moreText: { ...font.body, fontWeight: '700' },
});
