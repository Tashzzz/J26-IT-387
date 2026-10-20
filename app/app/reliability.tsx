// Camera setup guide (C1 - Nethmi): how reliably each body region is tracked from each camera setup
// (pilot ICC(2,1) per body region). Opened from Analyse, Profile and the video-quality card.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { c1 } from '../src/api/c1';
import type { Band, Reliability, RegionIcc, Setup } from '../src/c1/types';
import { Banner, Body, Button, Card, Chips, Loading, Row, Screen, Section, Small, Tile } from '../src/ui/components';
import { colors } from '../src/ui/theme';

// Koo & Li (2016) bands; the gate (0.75) is where a keypoint counts as usable.
const BAND_COLOR: Record<Band, string> = { excellent: colors.ok, good: colors.primary, moderate: colors.warn, poor: colors.danger };
const band = (icc: number): Band => (icc >= 0.9 ? 'excellent' : icc >= 0.75 ? 'good' : icc >= 0.5 ? 'moderate' : 'poor');

const ANGLE: Record<string, string> = { front: 'Front-on', semi_side: 'Diagonal', side: 'Side-on', rear: 'Behind' };
const setupName = (s: Setup) =>
  s.angle ? `${ANGLE[s.angle] ?? s.angle} · ${s.distance_m} m` : s.group;

export default function ReliabilityScreen() {
  const [data, setData] = useState<Reliability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  function load() {
    setError(null);
    c1.reliability()
      .then((d) => { setData(d); setGroup((g) => g ?? d.setups[0]?.group ?? null); })
      .catch((e: Error) => setError(e.message));
  }
  useEffect(load, []);

  if (error) {
    return (
      <Screen>
        <Banner tone="danger" icon="cloud-offline-outline" title="Could not load the guide"><Body muted>{error}</Body></Banner>
        <Button title="Try again" icon="refresh-outline" variant="secondary" onPress={load} />
      </Screen>
    );
  }
  if (!data) return <Screen><Loading text="Loading the camera study…" /></Screen>;

  const setup = data.setups.find((s) => s.group === group) ?? data.setups[0];
  return (
    <Screen>
      <Card>
        <Body>Where you put the phone decides which joints CricShield can measure well. We filmed the same bowler repeating the same delivery from each setup and checked how consistently every body point was found.</Body>
        <Small>Body points scoring {data.gate} or more (ICC) count as reliable and are used for the joint angles; the rest are shown with a “low visibility” warning.</Small>
      </Card>

      <Card>
        <Text style={s.tipTitle}>Quick guide</Text>
        <Tip text="Side-on: the right view for the front-knee angle — check below how reliably knees were tracked." />
        <Tip text="Behind or front-on: the right view for sideways body lean." />
        <Tip text="Whole body in frame, only the bowler in view, 60 fps if the phone allows." />
      </Card>

      <Chips label="Camera setup" value={setup.group} onChange={(g) => { setGroup(g); setOpen(null); }}
        options={data.setups.map((s) => ({ label: setupName(s), value: s.group }))} />

      <Row>
        <Tile label="Reliable body points" value={`${setup.usable} / ${setup.total}`} tone={setup.usable / setup.total >= 0.75 ? 'ok' : 'warn'} />
        <Tile label="Study bowler" value={setup.bowler ?? '–'} />
      </Row>

      <Section title="Reliability by body region">
      <Card>
        {setup.regions.map((r) => (
          <RegionRow key={r.region} region={r} gate={data.gate} open={open === r.region}
            onToggle={() => setOpen(open === r.region ? null : r.region)} />
        ))}
        <Legend />
      </Card>
      </Section>

      <Small>{data.icc_type}. Pilot study: a few deliveries per setup, so treat these as early estimates. Tap a region for each body point.</Small>
    </Screen>
  );
}

function RegionRow({ region, gate, open, onToggle }: { region: RegionIcc; gate: number; open: boolean; onToggle: () => void }) {
  const icc = region.mean_icc;
  const c = icc == null ? colors.muted : BAND_COLOR[band(icc)];
  return (
    <View style={s.region}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={s.regionHead}>
        <Text style={s.regionLabel}>{region.label}</Text>
        <Text style={[s.regionValue, { color: c }]}>{icc == null ? '–' : icc.toFixed(2)}</Text>
        <Text style={s.usable}>{region.usable}/{region.total} usable</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
      </Pressable>
      <Bar value={icc} gate={gate} color={c} />
      {open && region.keypoints.map((k) => (
        <View key={k.keypoint} style={s.kp}>
          <Text style={s.kpName}>{k.keypoint.replace(/_/g, ' ')}</Text>
          <Text style={[s.kpValue, { color: k.icc == null ? colors.muted : BAND_COLOR[k.band] }]}>{k.icc == null ? '–' : k.icc.toFixed(2)}</Text>
          <Ionicons name={k.usable ? 'checkmark-circle' : 'close-circle'} size={16} color={k.usable ? colors.ok : colors.danger} />
        </View>
      ))}
    </View>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Ionicons name="checkmark-circle" size={18} color={colors.ok} style={{ marginTop: 2 }} />
      <Text style={{ color: colors.textSoft, fontSize: 15, lineHeight: 22, flex: 1 }}>{text}</Text>
    </View>
  );
}

function Bar({ value, gate, color }: { value: number | null; gate: number; color: string }) {
  return (
    <View style={s.track}>
      <View style={[s.fill, { width: `${Math.max(0, value ?? 0) * 100}%`, backgroundColor: color }]} />
      <View style={[s.gate, { left: `${gate * 100}%` }]} />
    </View>
  );
}

function Legend() {
  return (
    <View style={s.legend}>
      {(Object.keys(BAND_COLOR) as Band[]).map((b) => (
        <View key={b} style={s.legendItem}>
          <View style={[s.dot, { backgroundColor: BAND_COLOR[b] }]} />
          <Text style={s.legendText}>{b}</Text>
        </View>
      ))}
      <View style={s.legendItem}>
        <View style={[s.gateKey]} />
        <Text style={s.legendText}>reliable from here</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  region: { paddingVertical: 10, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  tipTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  regionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  regionLabel: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
  regionValue: { fontSize: 15, fontWeight: '800', width: 44, textAlign: 'right' },
  usable: { color: colors.muted, fontSize: 12, width: 72, textAlign: 'right' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  gate: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.text },
  kp: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingVertical: 2 },
  kpName: { color: colors.muted, fontSize: 13, flex: 1, textTransform: 'capitalize' },
  kpValue: { fontSize: 13, fontWeight: '700', width: 44, textAlign: 'right' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  gateKey: { width: 2, height: 12, backgroundColor: colors.text },
  legendText: { color: colors.muted, fontSize: 12, textTransform: 'capitalize' },
});
