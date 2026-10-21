// Insights · C4 knowledge base (owned by Rashmi): the rules the plan engine can recommend, the limits per
// age group and risk tier, referral rules and the published sources. Read-only; rule ids and conditions
// are shown in Research mode.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { categoryMeta } from '../../src/c4/theme';
import type { Category } from '../../src/c4/types';
import { describe, fetchKnowledgeBase, template, type KbRule, type KnowledgeBase } from '../../src/insights/knowledge';
import {
  alpha, Card, color, COMPONENT, ErrorBanner, font, GradientHeader, radius, RISK, RiskBadge, Screen, SegmentedControl, Skeleton, sp, Tag,
  toRiskLevel, useResearchMode,
} from '../../src/ui';

const C4 = COMPONENT.c4.color;
const ORDER: Category[] = ['rehabilitation', 'training', 'workload', 'recovery', 'preventive_exercise'];
const TIERS = ['Low', 'Moderate', 'High', 'Critical'] as const;
type Tab = 'rules' | 'limits' | 'sources';

function RuleCard({ rule, kb, research }: { rule: KbRule; kb: KnowledgeBase; research: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = categoryMeta[rule.category];
  return (
    <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
      style={({ pressed }) => [s.rule, { borderColor: alpha(meta.color, 0.4) }, pressed && { opacity: 0.85 }]}>
      <View style={s.ruleHead}>
        <View style={[s.icon, { backgroundColor: alpha(meta.color, 0.16) }]}>
          <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={20} color={meta.color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.ruleTitle}>{rule.title}</Text>
          {research && <Text style={s.mono}>{rule.id} · priority {rule.priority}</Text>}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={color.muted} />
      </View>
      <Text style={s.body}>{template(rule.action)}</Text>
      {open && (
        <View style={{ gap: sp(1) }}>
          {research && <Text style={s.mono}>when {describe(rule.when)}</Text>}
          <Text style={s.muted}>{template(rule.explanation)}</Text>
          {rule.evidence.map((e) => (
            <Text key={e} style={s.cite}>• {kb.sources[e]?.citation ?? e}</Text>
          ))}
        </View>
      )}
    </Pressable>
  );
}

export default function KnowledgeBaseScreen() {
  const research = useResearchMode();
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('rules');
  const load = () => { setError(null); fetchKnowledgeBase().then(setKb, (e: Error) => setError(e.message)); };
  useEffect(load, []);

  return (
    <Screen onRefresh={load}>
      <GradientHeader component="c4" title="Knowledge base" icon="book"
        subtitle="Every action a prevention plan can contain, and the guideline or study behind it." />

      {error ? <ErrorBanner title="Could not load the knowledge base" message={error} onRetry={load} />
        : !kb ? <Skeleton height={320} round={20} />
        : (
          <>
            <Card style={{ borderColor: alpha(RISK.moderate.color, 0.5) }}>
              <View style={s.row}>
                <Tag label={`Version ${kb.version}`} tint={C4} />
                <Tag label={`${kb.rules.length} rules`} />
                <Tag label={`${Object.keys(kb.sources).length} sources`} />
              </View>
              <Text style={s.muted}>{kb.status}</Text>
            </Card>

            <SegmentedControl value={tab} onChange={setTab} tint={C4} options={[
              { value: 'rules', label: 'Rules', icon: 'list' },
              { value: 'limits', label: 'Limits', icon: 'speedometer-outline' },
              { value: 'sources', label: 'Sources', icon: 'book-outline' },
            ]} />

            {tab === 'rules' && (
              <>
                {ORDER.map((c) => {
                  const rules = kb.rules.filter((r) => r.category === c);
                  if (!rules.length) return null;
                  return (
                    <View key={c} style={{ gap: sp(1) }}>
                      <Text style={[s.section, { color: categoryMeta[c].color }]}>{categoryMeta[c].label}</Text>
                      {rules.map((r) => <RuleCard key={r.id} rule={r} kb={kb} research={research} />)}
                    </View>
                  );
                })}
                <Text style={[s.section, { color: RISK.critical.text }]}>Physio referral</Text>
                <Card>
                  {kb.referral_rules.map((r) => (
                    <View key={r.id} style={s.refRow}>
                      <Ionicons name="medkit-outline" size={18} color={RISK.critical.text} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.body}>{r.reason}</Text>
                        {research && <Text style={s.mono}>{r.id} · when {describe(r.when)}</Text>}
                      </View>
                    </View>
                  ))}
                </Card>
              </>
            )}

            {tab === 'limits' && (
              <>
                <Card>
                  <Text style={s.h2}>Base limits by age group</Text>
                  <View style={s.tableHead}>
                    <Text style={[s.th, { flex: 1, textAlign: 'left' }]}>Group</Text>
                    <Text style={s.th}>Overs / day</Text>
                    <Text style={s.th}>Spell cap</Text>
                  </View>
                  {Object.entries(kb.limits.age_groups).map(([g, l]) => (
                    <View key={g} style={s.tr}>
                      <Text style={[s.td, { flex: 1, textAlign: 'left', fontWeight: '700' }]}>{g}</Text>
                      <Text style={s.td}>{l.daily_limit}</Text>
                      <Text style={s.td}>{l.spell_cap}</Text>
                    </View>
                  ))}
                  <Text style={s.muted}>From the ECB fast-bowling directives; the plan scales them down as risk rises.</Text>
                </Card>
                <Card>
                  <Text style={s.h2}>By risk tier</Text>
                  {TIERS.map((t) => {
                    const lvl = toRiskLevel(t)!;
                    const cut = kb.risk_tiers[t];
                    return (
                      <View key={t} style={s.tier}>
                        <View style={s.row}>
                          <RiskBadge level={lvl} size="sm" />
                          {typeof cut === 'number' && <Text style={s.mono}>from score {Math.round(cut * 100)}</Text>}
                        </View>
                        <Text style={s.body}>
                          {kb.limits.tier_multiplier[t] === 0 ? 'No bowling' : `${Math.round(kb.limits.tier_multiplier[t] * 100)}% of the base limits`}
                          {' · '}up to {kb.limits.max_bowling_days_per_week[t]} bowling days a week
                        </Text>
                        <Text style={s.muted}>{kb.limits.rest_window[t]}</Text>
                      </View>
                    );
                  })}
                </Card>
              </>
            )}

            {tab === 'sources' && Object.entries(kb.sources).map(([k, src]) => (
              <Card key={k}>
                <View style={s.row}>
                  {src.verified ? <Tag label="Verified" icon="checkmark-circle" tint={RISK.low.color} /> : <Tag label="To verify" />}
                  {research && <Text style={s.mono}>{k}</Text>}
                </View>
                <Text style={s.body}>{src.citation}</Text>
                {src.key_finding ? <Text style={s.muted}>{src.key_finding}</Text> : null}
              </Card>
            ))}
          </>
        )}
    </Screen>
  );
}

const s = StyleSheet.create({
  h2: { ...font.h2, color: color.text },
  body: { ...font.body, color: color.text },
  muted: { ...font.body, color: color.muted },
  mono: { ...font.caption, color: color.muted, fontFamily: 'monospace' },
  cite: { ...font.caption, color: color.muted, fontStyle: 'italic' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sp(1) },
  section: { ...font.caption, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: sp(1) },
  rule: { backgroundColor: color.surface, borderWidth: 1, borderRadius: radius.card, padding: sp(2), gap: sp(1) },
  ruleHead: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5) },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ruleTitle: { ...font.h2, color: color.text },
  refRow: { flexDirection: 'row', gap: sp(1), alignItems: 'flex-start', paddingVertical: 4 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: color.border, paddingBottom: 6 },
  th: { ...font.caption, color: color.muted, fontWeight: '700', width: 84, textAlign: 'right' },
  tr: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  td: { ...font.body, color: color.text, width: 84, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tier: { gap: 4, paddingVertical: sp(1), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
});
