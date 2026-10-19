// C1 Reliability (owner: Nethmi): pilot ICC(2,1) per body region for each camera setup.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { c1 } from '../../src/api/c1';
import type { Band, Reliability, RegionIcc, Setup } from '../../src/c1/types';
import { colors } from '../../src/c4/theme';
import { Banner, Body, Button, Card, Chips, H, Loading, Row, Screen, Tile } from '../../src/c4/ui';

// Koo & Li (2016) bands; the gate (0.75) is where a keypoint counts as usable.
const BAND_COLOR: Record<Band, string> = { excellent: colors.ok, good: colors.accent, moderate: colors.warn, poor: colors.danger };
const band = (icc: number): Band => (icc >= 0.9 ? 'excellent' : icc >= 0.75 ? 'good' : icc >= 0.5 ? 'moderate' : 'poor');

const ANGLE: Record<string, string> = { front: 'Front', semi_side: 'Semi-side', side: 'Side', rear: 'Rear' };
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
        <Banner tone="danger" icon="cloud-offline-outline" title="Could not load reliability"><Body>{error}</Body></Banner>
        <Button title="Try again" icon="refresh-outline" variant="secondary" onPress={load} />
      </Screen>
    );
  }
  if (!data) return <Screen><Loading text="Loading reliability results…" /></Screen>;

  const setup = data.setups.find((s) => s.group === group) ?? data.setups[0];
  return (
    <Screen>
      <Card>
        <Body>How consistently each body keypoint is found when the same bowler repeats the same delivery.</Body>
        <Body muted>Keypoints with ICC ≥ {data.gate} are marked usable for the joint angles in C2.</Body>
      </Card>

      <Chips label="Camera setup" value={setup.group} onChange={(g) => { setGroup(g); setOpen(null); }}
        options={data.setups.map((s) => ({ label: setupName(s), value: s.group }))} />

      <Row>
        <Tile label="Usable keypoints" value={`${setup.usable} / ${setup.total}`} tone={setup.usable / setup.total >= 0.75 ? 'ok' : 'danger'} />
        <Tile label="Bowler" value={setup.bowler ?? '–'} />
      </Row>

      <H>ICC by body region</H>
      <Card>
        {setup.regions.map((r) => (
          <RegionRow key={r.region} region={r} gate={data.gate} open={open === r.region}
            onToggle={() => setOpen(open === r.region ? null : r.region)} />
        ))}
        <Legend />
      </Card>

      <Body muted>{data.icc_type}. Pilot data: a few deliveries per setup, so treat these as early estimates.</Body>
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
        <Text style={s.legendText}>usable gate</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  region: { paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1, gap: 6 },
  regionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  regionLabel: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
  regionValue: { fontSize: 15, fontWeight: '800', width: 44, textAlign: 'right' },
  usable: { color: colors.muted, fontSize: 12, width: 72, textAlign: 'right' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden' },
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
