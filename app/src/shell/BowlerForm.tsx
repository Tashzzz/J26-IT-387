// Add / edit a bowler. Same fields and payload as C4's profile screen (app/plan/profile.tsx) via
// c4.createAthlete / c4.updateAthlete. Pace and current soreness are not part of C4's athlete model,
// so they are kept on this phone only (AppContext extras).
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { c4 } from '../api/c4';
import type { Athlete, AthleteInput, InjurySite } from '../c4/types';
import {
  alpha, Card, ChipGroup, color, ErrorBanner, font, gradient, IconButton, PrimaryButton, radius, SecondaryButton, sp, TextField,
} from '../ui';
import { PACE_LABEL, useApp, type PaceBand } from './AppContext';
import { ageOf } from './squad';

const SITES: InjurySite[] = ['lumbar', 'hamstring', 'shoulder', 'knee', 'ankle', 'side_strain', 'other'];
const LEVELS = ['school', 'club', 'provincial', 'national'] as const;
const cap = (t: string) => t.replace('_', ' ').replace(/^./, (c) => c.toUpperCase());

/** Bowler seen from behind with the bowling arm up, so "right" is on the right. */
function ArmFigure({ arm, tint }: { arm: 'left' | 'right'; tint: string }) {
  const up = arm === 'right' ? [40, 30, 50, 14, 52, 4] : [24, 30, 14, 14, 12, 4];
  const down = arm === 'right' ? [24, 30, 18, 46, 16, 58] : [40, 30, 46, 46, 48, 58];
  const hand = arm === 'right' ? [52, 4] : [12, 4];
  return (
    <Svg width={64} height={88} viewBox="0 0 64 88">
      <Line x1={32} y1={26} x2={32} y2={56} stroke={tint} strokeWidth={5} strokeLinecap="round" />
      <Line x1={22} y1={30} x2={42} y2={30} stroke={tint} strokeWidth={5} strokeLinecap="round" />
      <Polyline points={up.join(' ')} fill="none" stroke={tint} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points={down.join(' ')} fill="none" stroke={tint} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
      <Polyline points="32,56 24,72 22,86" fill="none" stroke={tint} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="32,56 40,72 42,86" fill="none" stroke={tint} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={32} cy={16} r={8} fill={tint} />
      <Circle cx={hand[0]} cy={hand[1]} r={4} fill={gradient.brand[1]} />
    </Svg>
  );
}

function ArmChoice({ value, onChange }: { value: 'left' | 'right'; onChange: (v: 'left' | 'right') => void }) {
  return (
    <View style={{ gap: sp(1) }}>
      <Text style={s.label}>Bowling arm</Text>
      <View style={{ flexDirection: 'row', gap: sp(1.5) }}>
        {(['right', 'left'] as const).map((arm) => {
          const on = value === arm;
          const tint = on ? gradient.brand[1] : color.muted;
          return (
            <Pressable key={arm} onPress={() => onChange(arm)} accessibilityRole="radio" accessibilityState={{ selected: on }}
              accessibilityLabel={`${arm === 'right' ? 'Right' : 'Left'}-arm bowler`}
              style={[s.arm, on && { borderColor: gradient.brand[1], backgroundColor: alpha(gradient.brand[1], 0.1) }]}>
              <ArmFigure arm={arm} tint={tint} />
              <Text style={[s.armText, on && { color: gradient.brand[1] }]}>{arm === 'right' ? 'Right-arm' : 'Left-arm'}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function BowlerForm({ athlete, suggestedCode, takenCodes, onSaved, submitTitle }: {
  /** Edit this bowler; omit to create a new one. */
  athlete?: Athlete | null;
  suggestedCode?: string;
  takenCodes?: string[];
  onSaved: (a: Athlete) => void;
  submitTitle?: string;
}) {
  const { extras, saveExtra } = useApp();
  const isNew = !athlete;
  const [form, setForm] = useState<AthleteInput>(() => {
    if (athlete) { const { id: _id, ...rest } = athlete; return rest; }
    return { bowler_id: suggestedCode ?? '', birth_year: new Date().getFullYear() - 17, dominant_arm: 'right', playing_level: 'club', injury_history: [] };
  });
  const ex = athlete ? extras[athlete.id] : undefined;
  const [pace, setPace] = useState<PaceBand | null>(ex?.pace ?? null);
  const [soreness, setSoreness] = useState<number | null>(ex?.soreness ?? null);
  const [injury, setInjury] = useState<{ site: InjurySite; date: string }>({ site: 'lumbar', date: '' });
  const [injuryErr, setInjuryErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const code = form.bowler_id.trim();
  const duplicate = isNew && !!takenCodes?.some((c) => c.toUpperCase() === code);

  function addInjury() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(injury.date)) { setInjuryErr('Injury date must be YYYY-MM-DD.'); return; }
    setInjuryErr(null);
    setForm((f) => ({ ...f, injury_history: [...f.injury_history, { site: injury.site, injury_date: injury.date, returned_to_play: true }] }));
    setInjury({ ...injury, date: '' });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const a = isNew ? await c4.createAthlete({ ...form, bowler_id: code }) : await c4.updateAthlete(athlete!.id, form);
      await saveExtra(a.id, { pace, soreness });
      onSaved(a);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: sp(2) }}>
      <Card>
        <TextField label="Bowler code" value={form.bowler_id} editable={isNew} autoCapitalize="characters" icon="finger-print-outline"
          onChangeText={(t) => setForm({ ...form, bowler_id: t.toUpperCase() })} placeholder="e.g. B07"
          error={duplicate ? `${code} is already in the squad.` : null}
          hint={isNew ? 'Anonymous code only - never a name.' : 'The code cannot be changed after creation.'} />
        <TextField label="Birth year" value={form.birth_year ? String(form.birth_year) : ''} keyboardType="number-pad" icon="calendar-outline"
          onChangeText={(t) => setForm({ ...form, birth_year: Number(t) || 0 })}
          hint={form.birth_year > 1900 ? `Age ${ageOf(form.birth_year)} this year` : undefined} />
        <ChipGroup label="Playing level" value={form.playing_level} onChange={(v) => setForm({ ...form, playing_level: v })}
          options={LEVELS.map((l) => ({ value: l, label: cap(l) }))} />
        <ArmChoice value={form.dominant_arm} onChange={(v) => setForm({ ...form, dominant_arm: v })} />
      </Card>

      <Card>
        <Text style={s.cardTitle}>Injury history</Text>
        {form.injury_history.length === 0 && <Text style={s.muted}>None recorded.</Text>}
        {form.injury_history.map((i, idx) => (
          <View key={`${i.site}-${i.injury_date}-${idx}`} style={s.injury}>
            <Ionicons name="bandage-outline" size={18} color={color.muted} />
            <Text style={s.injuryText}>{cap(i.site)} · {i.injury_date}{i.notes ? ` · ${i.notes}` : ''}</Text>
            <IconButton icon="trash-outline" label={`Remove ${i.site} injury`} tint={color.muted}
              onPress={() => setForm((f) => ({ ...f, injury_history: f.injury_history.filter((_, k) => k !== idx) }))} />
          </View>
        ))}
        <ChipGroup label="Add an injury" value={injury.site} onChange={(v) => setInjury({ ...injury, site: v })}
          options={SITES.map((x) => ({ value: x, label: cap(x) }))} />
        <TextField label="Injury date" value={injury.date} onChangeText={(t) => setInjury({ ...injury, date: t })}
          placeholder="YYYY-MM-DD" autoCapitalize="none" error={injuryErr} />
        <SecondaryButton title="Add injury" icon="add" onPress={addInjury} disabled={!injury.date} />
      </Card>

      <Card>
        <Text style={s.cardTitle}>On this phone only</Text>
        <Text style={s.muted}>CricShield's models don't use these yet; they help you remember. Log soreness after a session in "Log today's overs" so the plan uses it.</Text>
        <ChipGroup label="Typical pace" value={pace} onChange={(v) => setPace(v === pace ? null : v)}
          options={(Object.keys(PACE_LABEL) as PaceBand[]).map((p) => ({ value: p, label: PACE_LABEL[p] }))} />
        <ChipGroup label="Current soreness (0 none - 10 worst)" value={soreness} onChange={(v) => setSoreness(v === soreness ? null : v)}
          options={Array.from({ length: 11 }, (_, n) => n)} />
      </Card>

      {error && <ErrorBanner title="Could not save" message={error} />}
      <PrimaryButton title={submitTitle ?? (isNew ? 'Add bowler' : 'Save changes')} icon="checkmark" onPress={save}
        loading={busy} disabled={!code || duplicate || form.birth_year < 1900} />
    </View>
  );
}

const s = StyleSheet.create({
  label: { ...font.caption, color: color.muted, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  arm: { flex: 1, alignItems: 'center', gap: sp(0.5), paddingVertical: sp(1.5), borderRadius: radius.button, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2 },
  armText: { ...font.h2, fontSize: 15, color: color.muted },
  cardTitle: { ...font.h2, color: color.text },
  muted: { ...font.body, color: color.muted },
  injury: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  injuryText: { ...font.body, color: color.text, flex: 1 },
});
