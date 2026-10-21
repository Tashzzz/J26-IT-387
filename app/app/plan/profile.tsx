// C4 key function 2 - athlete profile (FR2), what C3/C2 sent (integration view), server settings.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { c4 } from '../../src/api/c4';
import { useC4 } from '../../src/c4/C4Context';
import { colors } from '../../src/c4/theme';
import type { AthleteInput, InjurySite, Upstream } from '../../src/c4/types';
import { Banner, Body, Button, Card, Chips, Field, H, Row, Screen } from '../../src/c4/ui';

const SITES: InjurySite[] = ['lumbar', 'hamstring', 'shoulder', 'knee', 'ankle', 'side_strain', 'other'];
const blank = (): AthleteInput => ({ bowler_id: '', birth_year: new Date().getFullYear() - 17, dominant_arm: 'right', playing_level: 'club', injury_history: [] });

export default function ProfileScreen() {
  const { athlete, apiBase, changeApiBase, refreshAthletes, selectAthlete, setAthletes } = useC4();
  const [mode, setMode] = useState<'edit' | 'new'>('edit');
  const [form, setForm] = useState<AthleteInput>(blank());
  const [injury, setInjury] = useState<{ site: InjurySite; date: string }>({ site: 'lumbar', date: '' });
  const [up, setUp] = useState<Upstream | null>(null);
  const [url, setUrl] = useState(apiBase);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && athlete) {
      const { id: _id, ...rest } = athlete;
      setForm(rest);
    }
  }, [athlete, mode]);

  const loadUp = useCallback(async () => {
    if (!athlete) return;
    try { setUp(await c4.upstream(athlete.id)); } catch { setUp(null); }
  }, [athlete]);
  useEffect(() => { loadUp(); }, [loadUp]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'new') {
        const a = await c4.createAthlete(form);
        await refreshAthletes();
        selectAthlete(a.id);
        setMode('edit');
      } else if (athlete) {
        const a = await c4.updateAthlete(athlete.id, form);
        setAthletes((list) => list.map((x) => (x.id === a.id ? a : x)));
      }
      setMsg({ ok: true, text: 'Profile saved.' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function addInjury() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(injury.date)) {
      setMsg({ ok: false, text: 'Injury date must be YYYY-MM-DD.' });
      return;
    }
    setForm((f) => ({ ...f, injury_history: [...f.injury_history, { site: injury.site, injury_date: injury.date, returned_to_play: true }] }));
    setInjury({ ...injury, date: '' });
  }

  return (
    <Screen>
      <Chips value={mode} onChange={(v) => { setMode(v); if (v === 'new') setForm(blank()); }}
        options={[{ label: `Edit ${athlete?.bowler_id ?? ''}`, value: 'edit' }, { label: '+ New bowler', value: 'new' }]} />

      <Card>
        <Row>
          <Field half label="Bowler code (anonymised)" value={form.bowler_id} onChangeText={(t) => setForm({ ...form, bowler_id: t.toUpperCase() })}
            editable={mode === 'new'} autoCapitalize="characters" placeholder="e.g. B07" hint="Never a name (ethics)" />
          <Field half label="Birth year" value={String(form.birth_year)} onChangeText={(t) => setForm({ ...form, birth_year: Number(t) || 0 })} keyboardType="number-pad" />
        </Row>
        <Chips label="Bowling arm" value={form.dominant_arm} onChange={(v) => setForm({ ...form, dominant_arm: v })}
          options={[{ label: 'Right', value: 'right' }, { label: 'Left', value: 'left' }]} />
        <Chips label="Playing level" value={form.playing_level} onChange={(v) => setForm({ ...form, playing_level: v })}
          options={(['school', 'club', 'provincial', 'national'] as const).map((l) => ({ label: l[0].toUpperCase() + l.slice(1), value: l }))} />

        <Text style={s.small}>INJURY HISTORY</Text>
        {form.injury_history.length === 0 && <Body muted>None recorded.</Body>}
        {form.injury_history.map((i, idx) => (
          <Row key={`${i.site}-${i.injury_date}-${idx}`} style={{ alignItems: 'center' }}>
            <Text style={s.inj}>{i.site.replace('_', ' ').replace(/^./, (c) => c.toUpperCase())} · {i.injury_date}{i.notes ? ` · ${i.notes}` : ''}</Text>
            <Text style={s.remove} onPress={() => setForm((f) => ({ ...f, injury_history: f.injury_history.filter((_, k) => k !== idx) }))}>Remove</Text>
          </Row>
        ))}
        <Chips label="Add injury" value={injury.site} onChange={(v) => setInjury({ ...injury, site: v })}
          options={SITES.map((x) => ({ label: x.replace('_', ' '), value: x }))} />
        <Row style={{ alignItems: 'flex-end' }}>
          <Field half label="Injury date (YYYY-MM-DD)" value={injury.date} onChangeText={(t) => setInjury({ ...injury, date: t })} autoCapitalize="none" />
          <View style={{ marginBottom: 12 }}><Button title="Add" variant="secondary" onPress={addInjury} /></View>
        </Row>
        {msg && <Banner tone={msg.ok ? 'info' : 'danger'} icon={msg.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'} title={msg.ok ? 'Done' : 'Check the form'}><Body muted>{msg.text}</Body></Banner>}
        <Button title={mode === 'new' ? 'Create bowler' : 'Save profile'} icon="save-outline" onPress={save} loading={busy} />
      </Card>

      {mode === 'edit' && (
        <>
          <H>Inputs received from C3 and C2</H>
          <Card>
            {!up?.c3 ? <Body muted>No C3 risk output yet - the plan uses the guideline fallback.</Body> : (
              <>
                <Text style={s.kv}>C3 risk: <Text style={s.v}>{Math.round(up.c3.risk_score * 100)}% ({up.c3.risk_level})</Text> · model {up.c3.model}</Text>
                {up.c3.top_factors.map((f) => (
                  <Text key={f.feature} style={s.factor}>{f.shap >= 0 ? '▲' : '▼'} {f.feature} = {String(f.value ?? '—')}  (SHAP {f.shap >= 0 ? '+' : ''}{f.shap.toFixed(2)})</Text>
                ))}
              </>
            )}
            <View style={s.divider} />
            {!up || up.c2.length === 0 ? <Body muted>No C2 feature rows yet.</Body> : up.c2.map((r) => (
              <View key={r.video_id} style={{ gap: 2 }}>
                <Text style={s.kv}>C2 delivery <Text style={s.v}>{r.video_id}</Text></Text>
                {Object.entries(r.features).map(([k, f]) => (
                  <Text key={k} style={[s.factor, f.breach && { color: colors.danger }]}>
                    {f.breach ? '● breach' : '○ ok'}  {k} = {f.value ?? '—'}{f.threshold != null ? ` (limit ${f.threshold})` : ''}{f.reliable === false ? '  · unreliable view' : ''}
                  </Text>
                ))}
              </View>
            ))}
            {up?.received_at && <Text style={s.meta}>Received {new Date(up.received_at).toLocaleString()} via POST /recommend/athletes/{'{id}'}/upstream</Text>}
          </Card>
        </>
      )}

      <H>Server</H>
      <Card>
        <Field label="Backend URL" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false}
          hint="Phone: use your PC's IP, e.g. http://192.168.1.23:8000 (same Wi-Fi). Leave empty for automatic." />
        <Row>
          <Button title="Save & test" variant="secondary" icon="wifi-outline" onPress={async () => {
            await changeApiBase(url);
            try { const p = await c4.ping(); setMsg({ ok: true, text: `Connected: C4 engine ${p.engine_version}, ${p.rules} rules.` }); }
            catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
          }} />
          <Button title="Reset demo data" variant="danger" icon="refresh-outline" onPress={async () => {
            try { await c4.resetDemo(); await refreshAthletes(); setMsg({ ok: true, text: 'Demo bowlers DEMO01-03 restored.' }); }
            catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
          }} />
        </Row>
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  small: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 8 },
  inj: { color: colors.text, flex: 1 },
  remove: { color: colors.danger, fontWeight: '700', padding: 6 },
  kv: { color: colors.muted, fontSize: 13 },
  v: { color: colors.text, fontWeight: '700' },
  factor: { color: colors.text, fontSize: 13, fontFamily: 'monospace' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 6 },
});
