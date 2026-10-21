// Settings: coach details, team computer (backend) connection, demo data, first-launch flow, about.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { c1 } from '../../src/api/c1';
import { c2 } from '../../src/api/c2';
import { c4 } from '../../src/api/c4';
import { c3 } from '../../src/api/risk';
import { useApp } from '../../src/shell/AppContext';
import { useSquad } from '../../src/shell/squad';
import { StatusPill, useBackendStatus } from '../../src/shell/status';
import {
  Card, color, COMPONENT, COMPONENT_KEYS, font, GradientHeader, gradient, PrimaryButton, RISK, Screen, SecondaryButton, sp, TextField,
  Wordmark, type ComponentKey,
} from '../../src/ui';

type Ping = { ok: boolean; text: string } | null;
const PINGS: Record<ComponentKey, () => Promise<unknown>> = { c1: c1.ping, c2: c2.ping, c3: c3.ping, c4: c4.ping };
/** What each backend part does, in coach words (Research mode shows the component code instead). */
const SERVICE: Record<ComponentKey, string> = { c1: 'Video tracking', c2: 'Joint angles', c3: 'Risk score', c4: 'Plan builder' };

export default function Settings() {
  const router = useRouter();
  const { coach, saveCoach, apiBase, changeApiBase, resetOnboarding, researchMode, setResearchMode } = useApp();
  const { refresh } = useSquad();
  const [name, setName] = useState(coach.name);
  const [team, setTeam] = useState(coach.team);
  const [url, setUrl] = useState(apiBase);
  const [pings, setPings] = useState<Record<ComponentKey, Ping>>({ c1: null, c2: null, c3: null, c4: null });
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const status = useBackendStatus();

  useEffect(() => { setName(coach.name); setTeam(coach.team); }, [coach]);
  useEffect(() => setUrl(apiBase), [apiBase]);

  async function test() {
    setTesting(true);
    await changeApiBase(url);
    const res = await Promise.all(COMPONENT_KEYS.map((k) => PINGS[k]().then(
      () => ({ ok: true, text: 'Connected' }),
      (e: Error) => ({ ok: false, text: e.message }),
    )));
    setPings(Object.fromEntries(COMPONENT_KEYS.map((k, i) => [k, res[i]])) as Record<ComponentKey, Ping>);
    setTesting(false);
    status.check();
  }

  async function resetDemo() {
    setBusy(true);
    setMsg(null);
    try { await c4.resetDemo(); await refresh(); setMsg('Demo bowlers restored.'); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Screen safeTop>
      <GradientHeader title="Settings" />

      <Card>
        <Text style={s.h2}>Coach</Text>
        <TextField label="Your name" value={name} onChangeText={setName} icon="person-outline" />
        <TextField label="Team" value={team} onChangeText={setTeam} icon="shield-outline" />
        <SecondaryButton title="Save" icon="checkmark" onPress={() => saveCoach({ name: name.trim(), team: team.trim() })}
          disabled={name.trim() === coach.name && team.trim() === coach.team} />
      </Card>

      <Card>
        <Text style={s.h2}>Team computer</Text>
        <StatusPill status={status} onPress={status.check} />
        <Text style={s.muted}>Videos are processed on the team computer running the CricShield backend - nothing goes to the cloud.</Text>
        <TextField label="Backend URL" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} icon="desktop-outline"
          hint="Phone: your PC's IP on the same Wi-Fi, e.g. http://192.168.1.23:8000. Leave empty for automatic." />
        <PrimaryButton title="Save & test connection" icon="wifi" onPress={test} loading={testing} />
        {COMPONENT_KEYS.map((k) => {
          const p = pings[k];
          if (!p) return null;
          const c = COMPONENT[k];
          return (
            <View key={k} style={s.ping}>
              <Ionicons name={p.ok ? 'checkmark-circle' : 'close-circle'} size={18} color={p.ok ? RISK.low.color : RISK.critical.text} />
              <Text style={s.pingName}>{researchMode ? `${c.code} ${c.label}` : SERVICE[k]}</Text>
              <Text style={s.pingText} numberOfLines={2}>{p.text}</Text>
            </View>
          );
        })}
      </Card>

      <Card>
        <View style={s.switchRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.h2}>Research mode</Text>
            <Text style={s.muted}>For the project team. Shows component codes, who built each part, technical values (ICC, SHAP, rule ids) and the research workspaces in Insights. Off: plain coaching language.</Text>
          </View>
          <Switch value={researchMode} onValueChange={setResearchMode} accessibilityLabel="Research mode"
            trackColor={{ true: gradient.brand[1], false: color.surface2 }} thumbColor={color.text} />
        </View>
      </Card>

      <Card>
        <Text style={s.h2}>Data</Text>
        <SecondaryButton title="Reset demo bowlers" icon="refresh" onPress={resetDemo} loading={busy} />
        {msg && <Text style={s.muted}>{msg}</Text>}
        <SecondaryButton title="Show the welcome screens again" icon="sparkles-outline"
          onPress={async () => { await resetOnboarding(); router.replace('/onboarding'); }} />
      </Card>

      <Card>
        <Wordmark size={28} />
        <Text style={s.muted}>CricShield · SLIIT research project J26-IT-387. Injury-risk support for fast bowlers; it does not replace a physiotherapist's assessment.</Text>
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  h2: { ...font.h2, color: color.text },
  muted: { ...font.body, color: color.muted },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  ping: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  pingName: { ...font.body, fontWeight: '700', color: color.text, width: 140 },
  pingText: { ...font.caption, color: color.muted, flex: 1 },
});
