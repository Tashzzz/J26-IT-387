// C1 Reliability study (owner: Nethmi): pilot ICC(2,1) per body region for each camera setup.
// Body map + per-region ICC bars with the usable gate; ICC numbers are shown in Research mode.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { combineSetups } from '../../src/analysis/reliability';
import { c1 } from '../../src/api/c1';
import type { Band, RegionIcc, Reliability, Setup } from '../../src/c1/types';
import {
  BodyReliabilityMap, BottomSheet, Card, ChipGroup, color, COMPONENT, ErrorBanner, font, GradientHeader, RISK, ScoreRing, Screen,
  SecondaryButton, Skeleton, sp, useResearchMode,
} from '../../src/ui';

// Koo & Li (2016) bands; the gate (0.75) is where a keypoint counts as usable.
const BAND: Record<Band, { color: string; label: string }> = {
  excellent: { color: RISK.low.color, label: 'Excellent' },
  good: { color: COMPONENT.c1.color, label: 'Good' },
  moderate: { color: RISK.moderate.color, label: 'Moderate' },
  poor: { color: RISK.critical.text, label: 'Poor' },
};
const band = (icc: number): Band => (icc >= 0.9 ? 'excellent' : icc >= 0.75 ? 'good' : icc >= 0.5 ? 'moderate' : 'poor');

const ANGLE: Record<string, string> = { front: 'Front', semi_side: 'Semi-side', side: 'Side', rear: 'Rear' };
const setupName = (s: Setup, withBowler: boolean) =>
  s.angle ? `${ANGLE[s.angle] ?? s.angle} · ${s.distance_m} m${withBowler && s.bowler ? ` · ${s.bowler}` : ''}` : s.group;
const C1 = COMPONENT.c1.color;

export default function ReliabilityScreen() {
  const research = useResearchMode();
  const [data, setData] = useState<Reliability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [explain, setExplain] = useState(false);

  function load() {
    setError(null);
    c1.reliability()
      .then((d) => { setData(d); setGroup((g) => g ?? d.setups[0]?.group ?? null); })
      .catch((e: Error) => setError(e.message));
  }
  useEffect(load, []);

  const setup = data ? (data.setups.find((s) => s.group === group) ?? data.setups[0]) : null;
  const sameSetupTwice = data ? new Set(data.setups.map((s) => `${s.angle}-${s.distance_m}`)).size < data.setups.length : false;

  return (
    <Screen>
      <GradientHeader component="c1" title="Reliability study" icon="analytics"
        subtitle="How consistently each body point is found when the same bowler repeats the same delivery." />
      <SecondaryButton title="What is ICC?" icon="help-circle-outline" tint={C1} onPress={() => setExplain(true)} />

      {error ? <ErrorBanner title="Could not load the reliability study" message={error} onRetry={load} />
        : !data || !setup ? <Skeleton height={360} round={20} />
        : (
          <>
            <ChipGroup label="Camera setup" value={setup.group} tint={C1} onChange={(g) => { setGroup(g); setOpen(null); }}
              options={data.setups.map((s) => ({ value: s.group, label: setupName(s, research || sameSetupTwice) }))} />

            <Card variant="glow" accent={C1}>
              <View style={s.summary}>
                <ScoreRing value={(setup.usable / Math.max(1, setup.total)) * 100} tint={setup.usable / setup.total >= 0.75 ? RISK.low.color : RISK.moderate.color}
                  label="Keypoints usable" display={`${setup.usable}/${setup.total}`} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.h2}>{setupName(setup, false)}</Text>
                  <Text style={s.muted}>{setup.usable} of {setup.total} body points pass the reliability gate (ICC ≥ {data.gate}) from this camera position.</Text>
                  {research && setup.bowler ? <Text style={s.muted}>Studied bowler: {setup.bowler}</Text> : null}
                </View>
              </View>
              <BodyReliabilityMap regions={combineSetups([setup]).regions} />
            </Card>

            <Card>
              <Text style={s.h2}>ICC by body region</Text>
              {setup.regions.map((r) => (
                <RegionRow key={r.region} region={r} gate={data.gate} research={research} open={open === r.region}
                  onToggle={() => setOpen(open === r.region ? null : r.region)} />
              ))}
              <View style={s.legend}>
                {(Object.keys(BAND) as Band[]).map((b) => (
                  <View key={b} style={s.legendItem}>
                    <View style={[s.dot, { backgroundColor: BAND[b].color }]} />
                    <Text style={s.legendText}>{BAND[b].label}</Text>
                  </View>
                ))}
                <View style={s.legendItem}>
                  <View style={s.gateKey} />
                  <Text style={s.legendText}>usable gate {data.gate}</Text>
                </View>
              </View>
            </Card>

            <Text style={s.foot}>{research ? `${data.icc_type}. ` : ''}Pilot data: a few deliveries per setup, so treat these as early estimates.</Text>
          </>
        )}

      <BottomSheet visible={explain} onClose={() => setExplain(false)} title="What is ICC?">
        <Text style={s.body}>The intraclass correlation coefficient (ICC) measures how consistently a body point is found when the same bowler bowls the same delivery again, filmed from the same place.</Text>
        <Text style={s.body}>1.0 means the point lands in the same place every time; 0 means it is no better than chance.</Text>
        {(Object.keys(BAND) as Band[]).map((b) => (
          <View key={b} style={s.legendItem}>
            <View style={[s.dot, { backgroundColor: BAND[b].color }]} />
            <Text style={s.body}>{BAND[b].label}: {b === 'excellent' ? 'above 0.90' : b === 'good' ? '0.75 – 0.90' : b === 'moderate' ? '0.50 – 0.75' : 'below 0.50'}</Text>
          </View>
        ))}
        <Text style={s.body}>CricShield only trusts a body point when its ICC is at least {data?.gate ?? 0.75} (the gate). Joint angles built from points below the gate are tagged "low visibility" in the biomechanics results - they are never silently dropped.</Text>
        <Text style={s.muted}>Bands from Koo & Li (2016). ICC(2,1): two-way random effects, absolute agreement, single measurement.</Text>
      </BottomSheet>
    </Screen>
  );
}

function RegionRow({ region, gate, research, open, onToggle }: { region: RegionIcc; gate: number; research: boolean; open: boolean; onToggle: () => void }) {
  const icc = region.mean_icc;
  const b = icc == null ? null : BAND[band(icc)];
  const c = b?.color ?? color.muted;
  return (
    <View style={s.region}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={`${region.label}: ${b ? b.label : 'not tested'}, ${region.usable} of ${region.total} usable`} style={s.regionHead}>
        <Text style={s.regionLabel}>{region.label}</Text>
        <Text style={[s.regionValue, { color: c }]}>{icc == null ? '–' : research ? icc.toFixed(2) : b!.label}</Text>
        <Text style={s.usable}>{region.usable}/{region.total} usable</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={color.muted} />
      </Pressable>
      <View style={s.track}>
        <View style={[s.fill, { width: `${Math.max(0, icc ?? 0) * 100}%`, backgroundColor: c }]} />
        <View style={[s.gate, { left: `${gate * 100}%` }]} />
      </View>
      {open && region.keypoints.map((k) => (
        <View key={k.keypoint} style={s.kp}>
          <Text style={s.kpName}>{k.keypoint.replace(/_/g, ' ')}</Text>
          {research && <Text style={[s.kpValue, { color: k.icc == null ? color.muted : BAND[k.band].color }]}>{k.icc == null ? '–' : k.icc.toFixed(2)}</Text>}
          <Ionicons name={k.usable ? 'checkmark-circle' : 'close-circle'} size={18} color={k.usable ? RISK.low.color : RISK.critical.text}
            accessibilityLabel={k.usable ? 'usable' : 'below the gate'} />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  h2: { ...font.h2, color: color.text },
  body: { ...font.body, color: color.text },
  muted: { ...font.body, color: color.muted },
  foot: { ...font.caption, color: color.muted, textAlign: 'center' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  region: { paddingVertical: sp(1), borderBottomColor: color.border, borderBottomWidth: 1, gap: 6 },
  regionHead: { flexDirection: 'row', alignItems: 'center', gap: sp(1), minHeight: 40 },
  regionLabel: { ...font.body, fontWeight: '700', color: color.text, flex: 1 },
  regionValue: { ...font.body, fontWeight: '800', minWidth: 48, textAlign: 'right' },
  usable: { ...font.caption, color: color.muted, width: 76, textAlign: 'right' },
  track: { height: 10, borderRadius: 5, backgroundColor: color.surface2, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  gate: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: color.text },
  kp: { flexDirection: 'row', alignItems: 'center', gap: sp(1), paddingLeft: sp(1.5), minHeight: 28 },
  kpName: { ...font.body, fontSize: 14, color: color.muted, flex: 1, textTransform: 'capitalize' },
  kpValue: { ...font.body, fontSize: 14, fontWeight: '700', width: 44, textAlign: 'right' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1.5), paddingTop: sp(1) },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  gateKey: { width: 2, height: 14, backgroundColor: color.text },
  legendText: { ...font.caption, color: color.muted },
});
