// "Log today's overs": same fields and payload as C4's workload screen (app/plan/workload.tsx),
// then regenerates the plan like that screen does so it reflects the latest log.
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { c4 } from '../api/c4';
import type { WorkloadInput } from '../c4/types';
import { Card, ChipGroup, color, COMPONENT, ErrorBanner, font, PrimaryButton, SecondaryButton, sp, TextField } from '../ui';
import { isoDay } from './WorkloadCard';

export function QuickLogCard({ athleteId, onLogged }: { athleteId: number; onLogged: () => void }) {
  const [form, setForm] = useState({ session_date: isoDay(0), session_type: 'nets' as WorkloadInput['session_type'], overs: '', spells: '2', longest: '', rpe: '', soreness: 2 });
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const tint = COMPONENT.c4.color;

  async function save() {
    setBusy(true);
    setErr(null);
    setDone(null);
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    try {
      await c4.addWorkload(athleteId, {
        session_date: form.session_date, session_type: form.session_type,
        overs: Number(form.overs), spells: Number(form.spells || 1),
        longest_spell_overs: num(form.longest), rpe: num(form.rpe), soreness: form.soreness,
      });
      const logged = `${form.overs} overs saved.`;
      setForm((f) => ({ ...f, overs: '', longest: '', rpe: '' }));
      try { await c4.generatePlan(athleteId); setDone(`${logged} Plan updated.`); } catch { setDone(`${logged} The plan could not be updated right now.`); }
      onLogged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="glow" accent={tint}>
      <Text style={s.title}>Log today's overs</Text>
      <ChipGroup value={form.session_type} onChange={(v) => setForm({ ...form, session_type: v })} tint={tint}
        options={[{ value: 'nets', label: 'Nets' }, { value: 'training', label: 'Training' }, { value: 'match', label: 'Match' }]} />
      <TextField label="Overs bowled" value={form.overs} onChangeText={(t) => setForm({ ...form, overs: t })} keyboardType="decimal-pad" placeholder="e.g. 6" icon="baseball-outline" />
      <ChipGroup label="Soreness after (0 none - 10 worst)" value={form.soreness} onChange={(v) => setForm({ ...form, soreness: v })} tint={tint}
        options={Array.from({ length: 11 }, (_, n) => n)} />
      {more && (
        <View style={{ gap: sp(1.5) }}>
          <ChipGroup label="Date" value={form.session_date} onChange={(v) => setForm({ ...form, session_date: v })} tint={tint}
            options={[0, 1, 2, 3].map((d) => ({ value: isoDay(d), label: d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago` }))} />
          <TextField label="Or type a date" value={form.session_date} onChangeText={(t) => setForm({ ...form, session_date: t })} placeholder="YYYY-MM-DD" autoCapitalize="none" />
          <View style={s.row}>
            <View style={{ flex: 1 }}><TextField label="Spells" value={form.spells} onChangeText={(t) => setForm({ ...form, spells: t })} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><TextField label="Longest spell" value={form.longest} onChangeText={(t) => setForm({ ...form, longest: t })} keyboardType="decimal-pad" placeholder="overs" /></View>
          </View>
          <TextField label="Effort RPE 1–10" value={form.rpe} onChangeText={(t) => setForm({ ...form, rpe: t })} keyboardType="number-pad" />
        </View>
      )}
      <SecondaryButton title={more ? 'Fewer details' : 'More details (date, spells, RPE)'} icon={more ? 'chevron-up' : 'chevron-down'} onPress={() => setMore(!more)} />
      {err && <ErrorBanner title="Check the entry" message={err} />}
      {done && <Text style={[s.done, { color: tint }]}>{done}</Text>}
      <PrimaryButton title="Save session" icon="add-circle" onPress={save} loading={busy} disabled={!form.overs} tint={tint} />
    </Card>
  );
}

const s = StyleSheet.create({
  title: { ...font.h2, color: color.text },
  row: { flexDirection: 'row', gap: sp(1.5) },
  done: { ...font.body, fontWeight: '700' },
});
