// Workload log (C4): log a bowling session, see the acute:chronic workload ratio (ACWR) and recent sessions.
// Every change updates the prevention plan.
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { c4 } from '../src/api/c4';
import type { Workload, WorkloadInput } from '../src/c4/types';
import { useApp } from '../src/state/AppContext';
import { Banner, Body, Button, Card, Chips, Field, Loading, Row, Screen, Section, Segmented, Small, Tile } from '../src/ui/components';
import { colors, radius, type as t } from '../src/ui/theme';

const iso = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};
const dayLabel = (d: number) => (d === 0 ? 'Today' : d === 1 ? 'Yesterday' : new Date(iso(d)).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }));
const TYPE_LABEL: Record<WorkloadInput['session_type'], string> = { nets: 'Nets', training: 'Training', match: 'Match' };
const SORENESS = ['None', '', '', 'Mild', '', 'Moderate', '', 'Strong', '', '', 'Worst'];

export default function WorkloadScreen() {
  const { athlete, plan, generatePlan } = useApp();
  const [rows, setRows] = useState<Workload[] | null>(null);
  const [otherDate, setOtherDate] = useState(false);
  const [form, setForm] = useState({ session_date: iso(0), session_type: 'nets' as WorkloadInput['session_type'], overs: '', spells: '1', longest: '', rpe: '', soreness: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!athlete) return;
    try { setRows(await c4.workloads(athlete.id)); } catch (e) { setErr((e as Error).message); }
  }, [athlete]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!athlete) return;
    setBusy(true);
    setErr(null);
    setSaved(false);
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    try {
      await c4.addWorkload(athlete.id, {
        session_date: form.session_date, session_type: form.session_type,
        overs: Number(form.overs), spells: Number(form.spells || 1),
        longest_spell_overs: num(form.longest), rpe: num(form.rpe), soreness: form.soreness,
      });
      setForm((f) => ({ ...f, overs: '', longest: '', rpe: '', soreness: 0 }));
      setSaved(true);
      await load();
      await generatePlan(); // the plan always reflects the latest log
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
  const oversOk = form.overs.trim() !== '' && Number.isFinite(Number(form.overs)) && Number(form.overs) >= 0 && Number(form.overs) <= 60;

  return (
    <Screen>
      {m && (
        <>
          <View style={s.tiles}>
            <Tile label="Last 7 days" value={`${m.acute_overs} ov`} caption={`${m.days_bowled_7} days bowled`} />
            <Tile label="Weekly average" value={`${m.chronic_weekly_overs} ov`} caption="over 4 weeks" />
          </View>
          <Card>
            <Text style={t.overline}>Workload ratio (this week vs. usual)</Text>
            <AcwrBar value={m.acwr} />
            <Small>0.8–1.3 is the safer range; above 1.5 is a spike that raises injury risk (Gabbett 2016; Hulin et al. 2014). {m.consecutive_days} days in a row · highest soreness {m.soreness_max_7}/10.</Small>
          </Card>
        </>
      )}

      <Section title="Log a session">
        <Card>
          <Chips label="When" value={otherDate ? null : form.session_date} onChange={(v) => { setOtherDate(false); setForm({ ...form, session_date: v }); }}
            options={[0, 1, 2, 3].map((d) => ({ label: dayLabel(d), value: iso(d) }))} />
          {otherDate ? (
            <Field label="Date (YYYY-MM-DD)" value={form.session_date} onChangeText={(v) => setForm({ ...form, session_date: v })} autoCapitalize="none" placeholder={iso(7)} />
          ) : (
            <Pressable onPress={() => setOtherDate(true)} accessibilityRole="button" style={{ marginTop: -6, marginBottom: 12 }}>
              <Text style={s.link}>Another date…</Text>
            </Pressable>
          )}
          <Segmented label="Session" value={form.session_type} onChange={(v) => setForm({ ...form, session_type: v })}
            options={(['nets', 'training', 'match'] as const).map((v) => ({ label: TYPE_LABEL[v], value: v }))} />
          <Row>
            <Field half label="Overs bowled" value={form.overs} onChangeText={(v) => setForm({ ...form, overs: v })} keyboardType="decimal-pad" placeholder="e.g. 6" />
            <Field half label="Spells" value={form.spells} onChangeText={(v) => setForm({ ...form, spells: v })} keyboardType="number-pad" />
          </Row>
          <Row>
            <Field half label="Longest spell (overs)" value={form.longest} onChangeText={(v) => setForm({ ...form, longest: v })} keyboardType="decimal-pad" placeholder="optional" />
            <Field half label="Effort 1–10" value={form.rpe} onChangeText={(v) => setForm({ ...form, rpe: v })} keyboardType="number-pad" placeholder="optional" />
          </Row>
          <Text style={s.label}>Soreness after the session: <Text style={{ color: form.soreness >= 5 ? colors.danger : colors.text }}>{form.soreness}/10{SORENESS[form.soreness] ? ` · ${SORENESS[form.soreness]}` : ''}</Text></Text>
          <View style={s.scale}>
            {Array.from({ length: 11 }, (_, n) => (
              <Pressable key={n} onPress={() => setForm({ ...form, soreness: n })} accessibilityRole="radio" accessibilityLabel={`Soreness ${n}`}
                accessibilityState={{ selected: form.soreness === n }}
                style={[s.dot, form.soreness === n && { backgroundColor: n >= 7 ? colors.danger : n >= 4 ? colors.warn : colors.primary, borderColor: 'transparent' }]}>
                <Text style={[s.dotText, form.soreness === n && { color: colors.onPrimary }]}>{n}</Text>
              </Pressable>
            ))}
          </View>
          {err && <Banner tone="danger" icon="alert-circle-outline" title="Check the entry"><Body muted>{err}</Body></Banner>}
          {saved && !err && <Banner tone="ok" icon="checkmark-circle-outline" title="Session saved · plan updated" />}
          <Button title="Save session" icon="add-circle-outline" onPress={save} loading={busy} disabled={!oversOk} />
        </Card>
      </Section>

      <Section title="Recent sessions">
        {!rows ? <Loading /> : rows.length === 0 ? <Card><Small>No sessions yet. Logging the last 3 weeks gives the most accurate workload picture.</Small></Card> : (
          <Card style={{ padding: 0, gap: 0 }}>
            {rows.slice(0, 20).map((w, i) => (
              <View key={w.id} style={[s.row, i < Math.min(rows.length, 20) - 1 && s.rowBorder]}>
                <View style={s.rowIcon}><Ionicons name={w.session_type === 'match' ? 'trophy-outline' : 'baseball-outline'} size={18} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{w.overs} overs · {TYPE_LABEL[w.session_type]}</Text>
                  <Small>{new Date(w.session_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                    {w.longest_spell_overs ? ` · longest spell ${w.longest_spell_overs}` : ''}{w.rpe ? ` · effort ${w.rpe}` : ''}{w.soreness != null ? ` · soreness ${w.soreness}/10` : ''}</Small>
                </View>
                <Pressable onPress={() => remove(w.id)} accessibilityRole="button" accessibilityLabel="Delete session" hitSlop={10} style={s.del}>
                  <Ionicons name="trash-outline" size={19} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

function AcwrBar({ value }: { value: number | null }) {
  const MAX = 2.5;
  const pct = (v: number) => `${(Math.min(v, MAX) / MAX) * 100}%` as const;
  const zone = value == null ? colors.muted : value > 1.5 ? colors.danger : value > 1.3 || value < 0.8 ? colors.warn : colors.ok;
  return (
    <View style={{ gap: 6, marginVertical: 6 }}>
      <Text style={[s.acwr, { color: zone }]}>{value ?? 'Not enough history yet'}</Text>
      {value == null && <Small>21 days of sessions are needed.</Small>}
      <View style={s.track}>
        <View style={[s.zone, { left: pct(0.8), width: pct(0.5), backgroundColor: `${colors.ok}40` }]} />
        <View style={[s.zone, { left: pct(1.5), width: pct(1.0), backgroundColor: `${colors.danger}33` }]} />
        {value != null && <View style={[s.marker, { left: pct(value), backgroundColor: zone }]} />}
      </View>
      <View style={s.ticks}>{['0', '0.8', '1.3', '1.5', '2.5'].map((x) => <Text key={x} style={s.tick}>{x}</Text>)}</View>
    </View>
  );
}

const s = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 10 },
  link: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  label: { color: colors.textSoft, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  scale: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  dot: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  dotText: { color: colors.textSoft, fontWeight: '700' },
  acwr: { fontSize: 28, fontWeight: '800' },
  track: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceAlt, overflow: 'hidden', position: 'relative' },
  zone: { position: 'absolute', top: 0, bottom: 0 },
  marker: { position: 'absolute', top: -2, width: 5, height: 16, marginLeft: -2.5, borderRadius: 2 },
  ticks: { flexDirection: 'row', justifyContent: 'space-between' },
  tick: { color: colors.muted, fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: { width: 36, height: 36, borderRadius: radius.sm + 2, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  del: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
