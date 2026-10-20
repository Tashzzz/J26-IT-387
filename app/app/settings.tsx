// Settings: server connection, demo data, set-up, about, and a diagnostics view for the research team.
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { c4 } from '../src/api/c4';
import type { Upstream } from '../src/c4/types';
import { useApp } from '../src/state/AppContext';
import { Badge, Banner, Body, Button, Card, Field, List, ListItem, Screen, Section, Small } from '../src/ui/components';
import { colors } from '../src/ui/theme';

export default function Settings() {
  const router = useRouter();
  const { apiBase, online, athlete, changeApiBase, refreshAthletes, restartOnboarding } = useApp();
  const [url, setUrl] = useState(apiBase);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [up, setUp] = useState<Upstream | null>(null);

  async function test() {
    setBusy(true);
    setMsg(null);
    await changeApiBase(url);
    try {
      const p = await c4.ping();
      setMsg({ ok: true, text: `Connected · plan engine ${p.engine_version}, ${p.rules} rules.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function resetDemo() {
    if (!confirmReset) { setConfirmReset(true); return; }
    setConfirmReset(false);
    try {
      await c4.resetDemo();
      await refreshAthletes();
      setMsg({ ok: true, text: 'Demo bowlers DEMO01–DEMO03 restored.' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <Screen>
      <Section title="Server connection">
        <Card>
          <View style={s.between}>
            <Text style={s.title}>Status</Text>
            <Badge text={online ? 'Connected' : online === false ? 'Offline' : 'Checking…'} tone={online ? 'ok' : online === false ? 'danger' : 'neutral'} />
          </View>
          <Field label="Server address" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url"
            hint="On a phone use your computer’s Wi-Fi address, e.g. http://192.168.1.23:8000. Leave empty for automatic." />
          <Button title="Save & test connection" variant="secondary" icon="wifi-outline" onPress={test} loading={busy} />
          {msg && <Banner tone={msg.ok ? 'ok' : 'danger'} icon={msg.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'} title={msg.ok ? 'Done' : 'Something went wrong'}><Body muted>{msg.text}</Body></Banner>}
        </Card>
      </Section>

      <Section title="Data">
        <List>
          <ListItem icon="refresh-outline" iconColor={colors.danger} danger title={confirmReset ? 'Tap again to confirm reset' : 'Reset demo data'}
            subtitle="Restores the demo bowlers DEMO01–DEMO03 and their sample data" onPress={resetDemo} />
          <ListItem icon="play-circle-outline" title="Show the welcome again" subtitle="Run the first-launch set-up" onPress={async () => { await restartOnboarding(); router.replace('/welcome'); }} last />
        </List>
      </Section>

      <Section title="About">
        <Card>
          <Text style={s.title}>CricShield {Constants.expoConfig?.version ?? ''}</Text>
          <Small>AI-powered injury-risk prediction and prevention for fast bowlers from smartphone video. SLIIT research project J26-IT-387.</Small>
          <Small>Pose tracking → joint angles → risk model with explanations → prevention plan.</Small>
          <Banner tone="info" icon="medkit-outline" title="Not a medical device">
            <Body muted>CricShield supports coaches and physiotherapists. It does not diagnose injuries. If a bowler has pain, refer them to a qualified professional.</Body>
          </Banner>
        </Card>
      </Section>

      <Section title="For the research team" action={up ? 'Hide' : 'Show'} onAction={async () => {
        if (up) { setUp(null); return; }
        if (athlete) { try { setUp(await c4.upstream(athlete.id)); } catch { setUp({ c3: null, c2: [] }); } }
      }}>
        {up && (
          <Card>
            <Small>Data stored for {athlete?.bowler_id}, which the risk model and the plan read.</Small>
            {!up.c3 ? <Small>No risk result received yet — the plan uses the guideline fallback.</Small> : (
              <>
                <Text style={s.kv}>Risk: <Text style={s.v}>{Math.round(up.c3.risk_score * 100)} ({up.c3.risk_level})</Text> · {up.c3.model}</Text>
                {up.c3.top_factors.map((f) => (
                  <Text key={f.feature} style={s.mono}>{f.shap >= 0 ? '▲' : '▼'} {f.feature} = {String(f.value ?? '—')} (SHAP {f.shap >= 0 ? '+' : ''}{f.shap.toFixed(2)})</Text>
                ))}
              </>
            )}
            <View style={s.divider} />
            {up.c2.length === 0 ? <Small>No deliveries analysed yet.</Small> : up.c2.map((r) => (
              <View key={r.video_id} style={{ gap: 2 }}>
                <Text style={s.kv}>Delivery <Text style={s.v}>{r.video_id}</Text></Text>
                {Object.entries(r.features).map(([k, f]) => (
                  <Text key={k} style={[s.mono, f.breach && { color: colors.danger }]}>
                    {f.breach ? '● over' : '○ ok  '} {k} = {f.value ?? '—'}{f.threshold != null ? ` (limit ${f.threshold})` : ''}{f.reliable === false ? ' · low visibility' : ''}
                  </Text>
                ))}
              </View>
            ))}
            {up.received_at && <Small>Received {new Date(up.received_at).toLocaleString()}</Small>}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  kv: { color: colors.muted, fontSize: 13 },
  v: { color: colors.text, fontWeight: '700' },
  mono: { color: colors.text, fontSize: 12, fontFamily: 'monospace' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 8 },
});
