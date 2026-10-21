// Workload at a glance: overs per day for the last 7 days (from the log) and this week vs usual
// (acute / chronic weekly overs as computed by C4 in the latest plan - not recalculated here).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { PreventionPlan, Workload } from '../c4/types';
import { alpha, color, COMPONENT, font, sp } from '../ui';

// Same date format as C4's workload screen (app/plan/workload.tsx).
export const isoDay = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

export function WorkloadCard({ workloads, plan }: { workloads: Workload[]; plan: PreventionPlan | null }) {
  const c4 = COMPONENT.c4.color;
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = isoDay(6 - i);
    const overs = workloads.filter((w) => w.session_date === day).reduce((t, w) => t + w.overs, 0);
    return { day, overs, label: new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' }) };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.overs));
  const m = plan?.metrics;
  const maxWeek = m ? Math.max(1, m.acute_overs, m.chronic_weekly_overs) : 1;

  return (
    <View style={{ gap: sp(2) }}>
      <View style={s.bars} accessible accessibilityLabel={`Overs in the last 7 days: ${days.map((d) => `${d.label} ${d.overs}`).join(', ')}`}>
        {days.map((d, i) => (
          <View key={d.day} style={s.barCol}>
            <Text style={s.barVal}>{d.overs ? d.overs : ''}</Text>
            <View style={s.barTrack}>
              <View style={[s.bar, { height: `${(d.overs / maxDay) * 100}%`, backgroundColor: i === 6 ? c4 : alpha(c4, 0.55) }]} />
            </View>
            <Text style={[s.barLabel, i === 6 && { color: color.text }]}>{i === 6 ? 'Today' : d.label}</Text>
          </View>
        ))}
      </View>

      {m ? (
        <View style={{ gap: sp(1) }}>
          <Row label="This week" value={m.acute_overs} max={maxWeek} tint={c4} />
          <Row label="Usual week" value={m.chronic_weekly_overs} max={maxWeek} tint={color.muted} />
          <Text style={s.note}>From the latest plan ({new Date(plan!.generated_at).toLocaleDateString()}). Usual = weekly average over 28 days.</Text>
        </View>
      ) : (
        <Text style={s.note}>Generate a plan to compare this week with the usual week.</Text>
      )}
    </View>
  );
}

function Row({ label, value, max, tint }: { label: string; value: number; max: number; tint: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.rowTrack}><View style={[s.rowBar, { width: `${(value / max) * 100}%`, backgroundColor: tint }]} /></View>
      <Text style={s.rowVal}>{value} ov</Text>
    </View>
  );
}

const s = StyleSheet.create({
  bars: { flexDirection: 'row', gap: sp(1), height: 120 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barVal: { ...font.caption, color: color.text, height: 16 },
  barTrack: { flex: 1, width: '100%', maxWidth: 28, justifyContent: 'flex-end', backgroundColor: color.surface2, borderRadius: 8, overflow: 'hidden' },
  bar: { width: '100%', borderRadius: 8 },
  barLabel: { ...font.caption, color: color.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  rowLabel: { ...font.body, color: color.text, width: 92 },
  rowTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: color.surface2, overflow: 'hidden' },
  rowBar: { height: 10, borderRadius: 5 },
  rowVal: { ...font.body, color: color.text, fontWeight: '700', width: 56, textAlign: 'right' },
  note: { ...font.caption, color: color.muted },
});
