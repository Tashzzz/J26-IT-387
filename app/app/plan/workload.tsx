// C4 key function 2 - workload log with ACWR (acute:chronic workload ratio).
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { c4 } from '../../src/api/c4';
import { useC4 } from '../../src/c4/C4Context';
import { colors } from '../../src/c4/theme';
import type { Workload, WorkloadInput } from '../../src/c4/types';
import { Banner, Body, Button, Card, Chips, Field, H, Loading, Row, Screen, Tile } from '../../src/c4/ui';

const iso = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

export default function WorkloadScreen() {
  const { athlete, plan, generatePlan } = useC4();
  const [rows, setRows] = useState<Workload[] | null>(null);
  const [form, setForm] = useState({ session_date: iso(0), session_type: 'nets' as WorkloadInput['session_type'], overs: '', spells: '2', longest: '', rpe: '', soreness: 2 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!athlete) return;
    try { setRows(await c4.workloads(athlete.id)); } catch (e) { setErr((e as Error).message); }
  }, [athlete]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!athlete) return;
    setBusy(true);
    setErr(null);
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    try {
      await c4.addWorkload(athlete.id, {
        session_date: form.session_date, session_type: form.session_type,
        overs: Number(form.overs), spells: Number(form.spells || 1),
        longest_spell_overs: num(form.longest), rpe: num(form.rpe), soreness: form.soreness,
      });
      setForm((f) => ({ ...f, overs: '', longest: '', rpe: '' }));
      await load();
      await generatePlan(); // plan always reflects the latest log
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    try { await c4.deleteWorkload(id); await load(); await generatePlan(); } catch (e) { setErr((e as Error).message); }
  }

  const m = plan?.metrics;
  return (
    <Screen>
      <Text style={s.head}>{athlete?.bowler_id ?? '—'}</Text>
      {m && (
        <>
          <Row>
            <Tile label="Last 7 days" value={`${m.acute_overs} ov`} />
            <Tile label="Weekly avg (28 d)" value={`${m.chronic_weekly_overs} ov`} />
          </Row>
          <Card>
            <Text style={s.small}>ACUTE : CHRONIC WORKLOAD RATIO</Text>
            <AcwrBar value={m.acwr} />
            <Body muted>0.8–1.3 is the safer range; above 1.5 is a spike (Gabbett 2016; Hulin et al. 2014). Bowled {m.days_bowled_7} of the last 7 days, {m.consecutive_days} in a row, max soreness {m.soreness_max_7}/10.</Body>
          </Card>
        </>
      )}

      <H>Log a session</H>
      <Card>
        <Chips label="Date" value={form.session_date} onChange={(v) => setForm({ ...form, session_date: v })}
          options={[0, 1, 2, 3].map((d) => ({ label: d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`, value: iso(d) }))} />
        <Field label="Or type a date (YYYY-MM-DD)" value={form.session_date} onChangeText={(t) => setForm({ ...form, session_date: t })} autoCapitalize="none" />
        <Chips label="Session" value={form.session_type} onChange={(v) => setForm({ ...form, session_type: v })}
          options={[{ label: 'Nets', value: 'nets' }, { label: 'Training', value: 'training' }, { label: 'Match', value: 'match' }]} />
        <Row>
          <Field half label="Overs bowled" value={form.overs} onChangeText={(t) => setForm({ ...form, overs: t })} keyboardType="decimal-pad" placeholder="e.g. 6" />
          <Field half label="Spells" value={form.spells} onChangeText={(t) => setForm({ ...form, spells: t })} keyboardType="number-pad" />
          <Field half label="Longest spell (overs)" value={form.longest} onChangeText={(t) => setForm({ ...form, longest: t })} keyboardType="decimal-pad" />
          <Field half label="Effort RPE 1–10" value={form.rpe} onChangeText={(t) => setForm({ ...form, rpe: t })} keyboardType="number-pad" />
        </Row>
        <Chips label="Soreness after session (0 = none, 10 = worst)" value={form.soreness} onChange={(v) => setForm({ ...form, soreness: v })}
          options={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ label: String(n), value: n }))} />
        {err && <Banner tone="danger" icon="alert-circle-outline" title="Check the entry"><Body muted>{err}</Body></Banner>}
        <Button title="Save session & update plan" icon="add-circle-outline" onPress={save} loading={busy} disabled={!form.overs} />
      </Card>

      <H>Recent sessions</H>
      {!rows ? <Loading /> : rows.length === 0 ? <Card><Body muted>No sessions yet.</Body></Card> : rows.slice(0, 20).map((w) => (
        <View key={w.id} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{w.session_date} · {w.session_type}</Text>
            <Text style={s.rowSub}>{w.overs} overs{w.longest_spell_overs ? ` · longest spell ${w.longest_spell_overs}` : ''}{w.rpe ? ` · RPE ${w.rpe}` : ''}{w.soreness != null ? ` · soreness ${w.soreness}/10` : ''}</Text>
          </View>
          <Pressable onPress={() => remove(w.id)} accessibilityLabel="Delete session" hitSlop={10}>
            <Ionicons name="trash-outline" size={20} color={colors.muted} />
          </Pressable>
        </View>
      ))}
    </Screen>
  );
}

function AcwrBar({ value }: { value: number | null }) {
  const MAX = 2.5;
  const pct = (v: number) => `${(Math.min(v, MAX) / MAX) * 100}%` as const;
  const zone = value == null ? colors.muted : value > 1.5 ? colors.danger : value > 1.3 || value < 0.8 ? colors.warn : colors.ok;
  return (
    <View style={{ gap: 6, marginVertical: 6 }}>
      <Text style={[s.acwr, { color: zone }]}>{value ?? 'Not enough history (21 days needed)'}</Text>
      <View style={s.track}>
        <View style={[s.zone, { left: pct(0.8), width: pct(0.5), backgroundColor: `${colors.ok}55` }]} />
        <View style={[s.zone, { left: pct(1.5), width: pct(1.0), backgroundColor: `${colors.danger}44` }]} />
        {value != null && <View style={[s.marker, { left: pct(value), backgroundColor: zone }]} />}
      </View>
      <View style={s.ticks}>{['0', '0.8', '1.3', '1.5', '2.5'].map((t) => <Text key={t} style={s.tick}>{t}</Text>)}</View>
    </View>
  );
}

const s = StyleSheet.create({
  head: { color: colors.text, fontSize: 18, fontWeight: '700' },
  small: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  acwr: { fontSize: 26, fontWeight: '700' },
  track: { height: 12, borderRadius: 6, backgroundColor: colors.cardAlt, overflow: 'hidden', position: 'relative' },
  zone: { position: 'absolute', top: 0, bottom: 0 },
  marker: { position: 'absolute', top: -2, width: 4, height: 16, marginLeft: -2, borderRadius: 2 },
  ticks: { flexDirection: 'row', justifyContent: 'space-between' },
  tick: { color: colors.muted, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12 },
  rowTitle: { color: colors.text, fontWeight: '700', textTransform: 'capitalize' },
  rowSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
});
