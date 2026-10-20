// Injury risk report (C3 - Rizma): risk score, plain-language reasons, two-level SHAP explanation,
// what it was based on, and history. Uses the app-wide current bowler.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../src/api/client';
import { c3 } from '../../src/api/risk';
import type { Assessment, Factor, HistoryItem, ModelCard } from '../../src/c3/types';
import { FactorDetail, FactorRow, HistoryStrip, ModalityBars, RiskMeter } from '../../src/c3/ui';
import { useApp } from '../../src/state/AppContext';
import { Banner, Body, Button, Card, EmptyState, Loading, Screen, Section, Small, TierBadge, Tile } from '../../src/ui/components';
import { colors, type as t } from '../../src/ui/theme';

const pctText = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
const dateText = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

type Status = 'loading' | 'ready' | 'offline' | 'no-model';

export default function RiskScreen() {
  const router = useRouter();
  const { athlete, generatePlan } = useApp();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Assessment | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [card, setCard] = useState<ModelCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const [detail, setDetail] = useState<Factor | null>(null);

  const load = useCallback(async () => {
    if (!athlete) return;
    setError(null);
    try {
      const p = await c3.ping();
      if (!p.model_loaded) { setStatus('no-model'); setMessage(p.detail ?? null); return; }
      const [h, mc] = await Promise.all([c3.history(athlete.id), c3.model().catch(() => null)]);
      setHistory(h);
      setCard(mc);
      setResult(h[0] ? await c3.assessment(h[0].id) : null);
      setStatus('ready');
    } catch (e) {
      setStatus('offline');
      setMessage((e as Error).message);
    }
  }, [athlete]);

  useFocusEffect(useCallback(() => { setShowAll(false); load(); }, [load]));

  async function assess() {
    if (!athlete) return;
    setBusy(true);
    setError(null);
    try {
      const r = await c3.assess(athlete.id);
      setResult(r);
      setHistory(await c3.history(athlete.id));
      generatePlan(); // keep the prevention plan in step with the new score
    } catch (e) {
      if (!(e instanceof ApiError && e.status)) setStatus('offline');
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const factors = useMemo(() => {
    if (!result) return [];
    const measured = result.all_factors.filter((f) => f.measured !== false);
    const unmeasured = result.all_factors.filter((f) => f.measured === false);
    return showAll ? [...measured, ...unmeasured]
      : result.top_factors.map((tf) => result.all_factors.find((f) => f.feature === tf.feature) ?? tf);
  }, [result, showAll]);
  const maxShap = Math.max(...(result?.all_factors ?? []).map((f) => Math.abs(f.shap)), 1e-6);

  const subtitle = athlete ? `${athlete.bowler_id}${result ? ` · checked ${dateText(result.inputs.as_of)}` : ''}` : undefined;

  if (!athlete) {
    return <Screen title="Injury risk"><EmptyState icon="person-add-outline" title="Set up a bowler first" text="Risk is worked out for one bowler at a time." action="Create bowler profile" onAction={() => router.push({ pathname: '/bowler', params: { mode: 'new' } })} /></Screen>;
  }
  if (status === 'loading') return <Screen title="Injury risk" subtitle={subtitle}><Loading text="Loading the risk report…" /></Screen>;
  if (status === 'offline') {
    return (
      <Screen title="Injury risk" subtitle={subtitle}>
        <EmptyState icon="cloud-offline-outline" title="Can’t reach the risk model" text={message ?? 'Check the connection and try again.'}
          action="Try again" onAction={load} secondary="Connection settings" onSecondary={() => router.push('/settings')} />
      </Screen>
    );
  }
  if (status === 'no-model') {
    return (
      <Screen title="Injury risk" subtitle={subtitle}>
        <EmptyState icon="construct-outline" title="Risk model not set up yet" text={message ?? 'The risk model has not been trained on this server. The prevention plan still works from workload guidelines.'}
          action="Check again" onAction={load} secondary="Open prevention plan" onSecondary={() => router.push('/plan')} />
      </Screen>
    );
  }

  const assessButton = (
    <Button title={result ? 'Re-check with the latest data' : `Check ${athlete.bowler_id}’s injury risk`} icon="pulse-outline" onPress={assess} loading={busy} />
  );

  if (!result) {
    return (
      <Screen title="Injury risk" subtitle={subtitle} footer={assessButton}>
        <EmptyState icon="pulse-outline" title="No risk check yet"
          text="CricShield combines the bowling action, recent workload and injury history into one risk score — and shows what drove it." />
        <Card>
          <Text style={t.heading}>For the best result</Text>
          <Ingredient icon="videocam-outline" title="Analyse at least one delivery" onPress={() => router.push('/analyse')} />
          <Ingredient icon="calendar-outline" title="Log 3 weeks of bowling sessions" onPress={() => router.push('/workload')} />
          <Ingredient icon="person-outline" title="Keep the injury history up to date" onPress={() => router.push('/profile')} />
        </Card>
        {error && <Banner tone="danger" icon="alert-circle-outline" title="Could not check the risk"><Body muted>{error}</Body></Banner>}
      </Screen>
    );
  }

  return (
    <Screen title="Injury risk" subtitle={subtitle} footer={assessButton}>
      {error && <Banner tone="danger" icon="alert-circle-outline" title="Could not check the risk"><Body muted>{error}</Body></Banner>}
      {result.synthetic_model && (
        <Banner tone="info" icon="flask-outline" title="Research prototype">
          <Body muted>The model is trained on synthetic development data. It shows how the system works — not a validated clinical prediction.</Body>
        </Banner>
      )}

      {/* ---- score ---- */}
      <Card>
        <View style={s.between}>
          <Text style={t.overline}>Risk score</Text>
          <TierBadge tier={result.risk_tier} />
        </View>
        <RiskMeter score={result.risk_score} tier={result.risk_tier} />
        <Text style={s.prob}>
          About <Text style={s.probStrong}>{pctText(result.probability_28d)}</Text> chance of an injury that stops bowling in the next 4 weeks
          {' '}(squad average {pctText(result.base_probability_28d)}{result.relative_risk != null ? `, ${result.relative_risk.toFixed(1)}× average` : ''}).
        </Text>
      </Card>

      {result.alert && (
        <Banner tone={result.risk_level === 'high' ? 'danger' : 'warn'} icon="notifications-outline" title="Above the alert level"
          action="See the prevention plan" onAction={() => router.push('/plan')}>
          <Body muted>The alert catches at least 8 in 10 injuries, so some alerts will be false alarms. Follow the plan and watch for soreness.</Body>
        </Banner>
      )}

      {/* ---- narrative ---- */}
      <Section title="Why this score">
        <Card>
          <Body>{result.explanation}</Body>
          {result.factor_lines.map((l) => (
            <View key={l} style={s.bulletRow}>
              <View style={s.bullet} />
              <Text style={s.line}>{l}</Text>
            </View>
          ))}
        </Card>
      </Section>

      {/* ---- level 1 ---- */}
      <Section title="What pushes the score">
        <Card>
          <ModalityBars items={result.modality_attribution} />
          <Small>Points on the 0–100 score compared with an average squad member ({Math.round(result.base_score * 100)}).</Small>
        </Card>
      </Section>

      {/* ---- level 2 ---- */}
      <Section title={showAll ? 'All factors' : 'Top factors'} action={showAll ? 'Top 3 only' : `All ${result.all_factors.length}`} onAction={() => setShowAll((v) => !v)}>
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          {factors.map((f, i) => <FactorRow key={f.feature} f={f} max={maxShap} onPress={() => setDetail(f)} last={i === factors.length - 1} />)}
        </Card>
        <Small>Tap a factor to see how it was measured.</Small>
      </Section>

      {/* ---- inputs ---- */}
      <Section title="Based on">
        <View style={s.tiles}>
          <Tile icon="videocam-outline" label="Deliveries" value={String(result.inputs.kinematics.deliveries)} tone={result.inputs.kinematics.deliveries ? 'neutral' : 'warn'}
            caption={result.inputs.kinematics.deliveries ? 'analysed' : 'none yet'} />
          <Tile icon="calendar-outline" label="Workload" value={`${result.inputs.workload.history_days} d`} tone={result.inputs.workload.history_days >= 21 ? 'neutral' : 'warn'}
            caption={result.inputs.workload.history_days >= 21 ? 'of history' : '21 days advised'} />
        </View>
        {result.data_quality.length > 0 && (
          <Card>
            <Text style={t.overline}>Data notes</Text>
            {result.data_quality.map((n) => <Small key={n}>• {n}</Small>)}
          </Card>
        )}
      </Section>

      <Card onPress={() => router.push('/plan')} style={s.planLink} accessibilityLabel="Open the prevention plan">
        <View style={s.planIcon}><Ionicons name="clipboard" size={20} color={colors.onPrimary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.planTitle}>Prevention plan</Text>
          <Small>Safe overs, rest and exercises based on this score</Small>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Card>

      {/* ---- history ---- */}
      {history.length > 1 && (
        <Section title="Risk over time">
          <Card>
            <HistoryStrip items={history} />
            {history.slice(0, 4).map((h) => (
              <View key={h.id} style={s.histItem}>
                <Text style={s.histDate}>{dateText(h.as_of)}</Text>
                <Text style={s.histScore}>{Math.round(h.risk_score * 100)}</Text>
                {h.risk_tier && <TierBadge tier={h.risk_tier} size="sm" />}
              </View>
            ))}
          </Card>
        </Section>
      )}

      {/* ---- model card ---- */}
      <Pressable onPress={() => setShowModel((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showModel }} style={s.toggle}>
        <Ionicons name={showModel ? 'chevron-up' : 'information-circle-outline'} size={18} color={colors.primary} />
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
          <Small>XGBoost with clinically agreed directions of effect, calibrated to a probability; each factor’s contribution is computed with TreeSHAP. Decision support only — not a diagnosis.</Small>
          <Small>{result.model} · {result.latency_ms} ms · {new Date(result.generated_at).toLocaleString()}</Small>
        </Card>
      )}

      <FactorDetail f={detail} onClose={() => setDetail(null)} />
    </Screen>
  );
}

function Ingredient({ icon, title, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.ing, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={[t.body, { flex: 1, color: colors.text }]}>{title}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  prob: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  probStrong: { color: colors.text, fontWeight: '800' },
  bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 8 },
  line: { color: colors.textSoft, fontSize: 15, lineHeight: 22, flex: 1 },
  tiles: { flexDirection: 'row', gap: 10 },
  planLink: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  planTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  histItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  histDate: { color: colors.muted, fontSize: 14, width: 110 },
  histScore: { color: colors.text, fontSize: 16, fontWeight: '800', width: 34 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, minHeight: 44, alignSelf: 'center' },
  toggleText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  kv: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  v: { color: colors.text, fontWeight: '700' },
  ing: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
});
