// C3 - Risk classifier + two-level SHAP explanation screen (proposal: risk gauge, attribution charts, narrative).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError, setApiBase } from '../../src/api/client';
import { c3 } from '../../src/api/risk';
import type { Assessment, Factor, HistoryItem, ModelCard, RiskAthlete } from '../../src/c3/types';
import { BowlerPicker, FactorDetail, FactorRow, HistoryStrip, LevelBadge, ModalityBars, RiskMeter } from '../../src/c3/ui';
import { colors } from '../../src/c4/theme';
import { Banner, Body, Button, Card, H, Loading, Row, Screen, Tile } from '../../src/c4/ui';

const KEY_API = 'cricshield.apiBase';               // shared server setting (Plan -> Profile -> Server)
const KEY_SELECTED = 'cricshield.c3.selectedAthlete';

async function load(key: string) {
  try { return await AsyncStorage.getItem(key); } catch { return null; }
}
async function save(key: string, value: string) {
  try { await AsyncStorage.setItem(key, value); } catch { /* storage can be unavailable - ignore */ }
}
const pctText = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

export default function RiskScreen() {
  const router = useRouter();
  const [online, setOnline] = useState<boolean | null>(null);
  const [modelMsg, setModelMsg] = useState<string | null>(null);
  const [athletes, setAthletes] = useState<RiskAthlete[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<Assessment | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [card, setCard] = useState<ModelCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const [detail, setDetail] = useState<Factor | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const p = await c3.ping();
      setOnline(true);
      if (!p.model_loaded) { setModelMsg(p.detail ?? 'The C3 model is not trained yet.'); return; }
      setModelMsg(null);
      const [list, mc] = await Promise.all([c3.athletes(), c3.model()]);
      setAthletes(list);
      setCard(mc);
      const saved = Number(await load(KEY_SELECTED));
      setSelected((cur) => [cur, saved].find((id) => id && list.some((a) => a.athlete_id === id)) ?? list[0]?.athlete_id ?? null);
    } catch (e) {
      setOnline(false);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const base = await load(KEY_API);
      if (base) setApiBase(base);
      await connect();
    })();
  }, [connect]);

  // On bowler change: show the last saved assessment straight away.
  useEffect(() => {
    if (selected == null) return;
    save(KEY_SELECTED, String(selected));
    setShowAll(false);
    (async () => {
      try {
        const h = await c3.history(selected);
        setHistory(h);
        setResult(h[0] ? await c3.assessment(h[0].id) : null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [selected]);

  async function assess() {
    if (selected == null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await c3.assess(selected);
      setResult(r);
      const [h, list] = await Promise.all([c3.history(selected), c3.athletes()]);
      setHistory(h);
      setAthletes(list);
    } catch (e) {
      if (!(e instanceof ApiError && e.status)) setOnline(false);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const bowler = athletes.find((a) => a.athlete_id === selected);
  const factors = useMemo(() => {
    if (!result) return [];
    const measured = result.all_factors.filter((f) => f.measured !== false);
    const unmeasured = result.all_factors.filter((f) => f.measured === false);
    // top_factors carry only the contract fields; show the full record (components, squad typical) for each.
    return showAll ? [...measured, ...unmeasured]
      : result.top_factors.map((t) => result.all_factors.find((f) => f.feature === t.feature) ?? t);
  }, [result, showAll]);
  const maxShap = Math.max(...(result?.all_factors ?? []).map((f) => Math.abs(f.shap)), 1e-6);

  if (online === null) return <Screen><Loading text="Connecting to the C3 risk model…" /></Screen>;

  if (online === false) {
    return (
      <Screen>
        <Banner tone="danger" icon="cloud-offline-outline" title="Backend not reachable"><Body muted>{error}</Body></Banner>
        <Button title="Try again" icon="refresh" onPress={connect} />
        <Button title="Server settings" variant="secondary" icon="settings-outline" onPress={() => router.push('/plan/profile')} />
      </Screen>
    );
  }

  if (modelMsg) {
    return (
      <Screen>
        <Banner tone="warn" icon="construct-outline" title="C3 model not ready">
          <Body muted>{modelMsg}</Body>
        </Banner>
        <Button title="Check again" icon="refresh" onPress={connect} />
      </Screen>
    );
  }

  return (
    <Screen>
      {athletes.length === 0 ? (
        <Card><Body muted>No bowlers yet. Add one in Plan → Profile & inputs (anonymised code only).</Body></Card>
      ) : (
        <BowlerPicker athletes={athletes} value={selected} onChange={setSelected} />
      )}

      <Button title={result ? 'Assess again with the latest data' : 'Assess injury risk'} icon="pulse-outline"
        onPress={assess} loading={busy} disabled={selected == null} />
      {error && <Banner tone="danger" icon="alert-circle-outline" title="Could not assess"><Body muted>{error}</Body></Banner>}

      {!result ? (
        <Card>
          <Body muted>No assessment yet for {bowler?.bowler_id ?? 'this bowler'}. The model combines the C2 joint angles, the workload log and the athlete profile into a risk score, then explains which factors drove it.</Body>
        </Card>
      ) : (
        <>
          {/* ---- risk gauge ---- */}
          <Card>
            <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={s.code}>{result.bowler_id} · {result.inputs.as_of}</Text>
              <LevelBadge level={result.risk_level} tier={result.risk_tier} />
            </Row>
            <RiskMeter score={result.risk_score} tier={result.risk_tier} />
            <Text style={s.prob}>
              <Text style={s.probStrong}>≈{pctText(result.probability_28d)}</Text> chance of a time-loss injury in the next 4 weeks
              {' '}· squad average {pctText(result.base_probability_28d)}
              {result.relative_risk != null ? ` · ${result.relative_risk.toFixed(1)}× average` : ''}
            </Text>
          </Card>

          {result.alert && (
            <Banner tone={result.risk_level === 'high' ? 'danger' : 'warn'} icon="notifications-outline" title="Above the alert level">
              <Body muted>The alert is set so that at least 80% of injuries are caught, so some alerts will be false alarms. Check the prevention plan.</Body>
            </Banner>
          )}

          {/* ---- narrative ---- */}
          <H>Why</H>
          <Card>
            <Body>{result.explanation}</Body>
            {result.factor_lines.map((l) => (
              <View key={l} style={s.bulletRow}>
                <Text style={s.bullet}>•</Text>
                <Text style={s.line}>{l}</Text>
              </View>
            ))}
          </Card>

          {/* ---- level 1 ---- */}
          <H>What drives the score</H>
          <Card>
            <ModalityBars items={result.modality_attribution} />
            <Text style={s.note}>Points on the 0–100 risk score, compared with an average squad member ({Math.round(result.base_score * 100)}).</Text>
          </Card>

          {/* ---- level 2 ---- */}
          <H>{showAll ? 'All factors' : 'Top factors'}</H>
          <Card style={{ gap: 0 }}>
            {factors.map((f) => <FactorRow key={f.feature} f={f} max={maxShap} onPress={() => setDetail(f)} />)}
            <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" style={s.toggle}>
              <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={16} color={colors.accent} />
              <Text style={s.toggleText}>{showAll ? 'Show top 3 only' : `Show all ${result.all_factors.length} factors`}</Text>
            </Pressable>
          </Card>

          {/* ---- inputs ---- */}
          <H>Based on</H>
          <Row>
            <Tile label="Deliveries (C2)" value={String(result.inputs.kinematics.deliveries)} tone={result.inputs.kinematics.deliveries ? 'neutral' : 'danger'} />
            <Tile label="Workload log" value={`${result.inputs.workload.history_days} days`} tone={result.inputs.workload.history_days >= 21 ? 'neutral' : 'danger'} />
            <Tile label="Profile" value={`${result.inputs.athlete.age} y · ${result.inputs.athlete.playing_level}`} wide />
          </Row>
          {result.data_quality.length > 0 && (
            <Card>
              <Text style={s.small}>DATA NOTES</Text>
              {result.data_quality.map((n) => <Text key={n} style={s.noteLine}>• {n}</Text>)}
            </Card>
          )}

          {/* ---- hand-off to C4 ---- */}
          {result.sent_to_c4 !== false && (
            <Banner tone="info" icon="git-merge-outline" title="Sent to the prevention plan (C4)">
              <Body muted>Generate a new plan to turn this risk score and its top factors into actions.</Body>
            </Banner>
          )}
          <Button title="Open prevention plan" variant="secondary" icon="clipboard-outline" onPress={() => router.push('/plan')} />

          {/* ---- history ---- */}
          {history.length > 1 && (
            <>
              <H>Risk history</H>
              <Card>
                <HistoryStrip items={history} />
                {history.slice(0, 4).map((h) => (
                  <View key={h.id} style={s.histItem}>
                    <Text style={s.histDate}>{h.as_of}</Text>
                    <Text style={s.histScore}>{Math.round(h.risk_score * 100)}</Text>
                    <LevelBadge level={h.risk_level} tier={h.risk_tier ?? undefined} />
                  </View>
                ))}
              </Card>
            </>
          )}

          {/* ---- model card ---- */}
          <Pressable onPress={() => setShowModel((v) => !v)} accessibilityRole="button" style={s.toggle}>
            <Ionicons name={showModel ? 'chevron-up' : 'information-circle-outline'} size={16} color={colors.accent} />
            <Text style={s.toggleText}>{showModel ? 'Hide model details' : 'About this model'}</Text>
          </Pressable>
          {showModel && card && (
            <Card>
              <Text style={s.kv}>Model <Text style={s.v}>{card.model}</Text> · trained {card.created}</Text>
              <Text style={s.kv}>Training data <Text style={s.v}>{card.synthetic ? 'synthetic' : card.training_data.source}</Text>
                {card.training_data.sessions ? ` · ${card.training_data.sessions} sessions, ${card.training_data.bowlers} bowlers` : ''}</Text>
              <Text style={s.kv}>Cross-validated AUC <Text style={s.v}>{card.metrics.cv_auc_mean.toFixed(2)}{card.metrics.cv_auc_sd != null ? ` ± ${card.metrics.cv_auc_sd.toFixed(2)}` : ''}</Text> (grouped by bowler)</Text>
              {card.metrics.test?.auc != null && (
                <Text style={s.kv}>Held-out test <Text style={s.v}>AUC {card.metrics.test.auc.toFixed(2)} · recall {card.metrics.test.recall?.toFixed(2)} · precision {card.metrics.test.precision?.toFixed(2)}</Text>
                  {card.metrics.test_bowlers ? ` (${card.metrics.test_bowlers} bowlers)` : ''}</Text>
              )}
              <Text style={s.kv}>Alert at <Text style={s.v}>{pctText(card.thresholds.probability.alert)}</Text> 4-week probability (score 30) · squad average {pctText(card.base_rate)}</Text>
              <Body muted>XGBoost with clinically agreed directions of effect, calibrated to a probability; each factor's contribution is computed with TreeSHAP. Decision support only – not a diagnosis.</Body>
            </Card>
          )}
          <Text style={s.footer}>{result.model} · {result.latency_ms} ms · {new Date(result.generated_at).toLocaleString()}</Text>
        </>
      )}

      <FactorDetail f={detail} onClose={() => setDetail(null)} />
    </Screen>
  );
}

const s = StyleSheet.create({
  code: { color: colors.text, fontSize: 16, fontWeight: '700' },
  prob: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  probStrong: { color: colors.text, fontWeight: '700', fontSize: 15 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bullet: { color: colors.accent, fontSize: 14, lineHeight: 20 },
  line: { color: colors.text, fontSize: 14, lineHeight: 20, flex: 1, opacity: 0.92 },
  note: { color: colors.muted, fontSize: 12, marginTop: 4 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, minHeight: 44 },
  toggleText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  small: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  noteLine: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  histItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  histDate: { color: colors.muted, fontSize: 13, width: 92 },
  histScore: { color: colors.text, fontSize: 15, fontWeight: '700', width: 34 },
  kv: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  v: { color: colors.text, fontWeight: '700' },
  footer: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
