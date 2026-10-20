// Bowler profile form (athlete registry, C4). Used in three places: first-launch set-up (as a 3-step
// wizard), "Add bowler" and "Edit profile" (all sections on one page). Validation mirrors
// components/c4_recommend/models.py so mistakes are caught before the server sees them.
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Chips, Field, OptionCard, Segmented, Small } from '../ui/components';
import { colors, radius } from '../ui/theme';
import type { Athlete, AthleteInput, InjuryRecord, InjurySite } from './types';

const BOWLER_ID = /^[A-Za-z0-9_-]{2,24}$/;
const THIS_YEAR = new Date().getFullYear();

export const SITE_LABEL: Record<InjurySite, string> = {
  lumbar: 'Lower back', side_strain: 'Side strain', hamstring: 'Hamstring', shoulder: 'Shoulder',
  knee: 'Knee', ankle: 'Ankle', other: 'Other',
};
const SITES = Object.keys(SITE_LABEL) as InjurySite[];

// "When was it?" as easy choices instead of typing a date; stored as an approximate date.
const WHEN = [
  { label: 'Last month', value: 0.5 },
  { label: '1–3 months ago', value: 2 },
  { label: '3–6 months ago', value: 4.5 },
  { label: '6–12 months ago', value: 9 },
  { label: 'Over a year ago', value: 18 },
];
const monthsAgo = (m: number) => {
  const d = new Date();
  d.setDate(d.getDate() - Math.round(m * 30.4));
  return d.toISOString().slice(0, 10);
};

/** Next free code B01, B02 … (anonymised codes only - never a name). */
export function suggestCode(athletes: Pick<Athlete, 'bowler_id'>[]): string {
  const used = new Set(athletes.map((a) => a.bowler_id.toUpperCase()));
  for (let i = 1; i < 1000; i++) {
    const c = `B${String(i).padStart(2, '0')}`;
    if (!used.has(c)) return c;
  }
  return '';
}

export const blankAthlete = (code = ''): AthleteInput => ({
  bowler_id: code, birth_year: THIS_YEAR - 17, dominant_arm: 'right', playing_level: 'club', injury_history: [],
});

export type FormErrors = Partial<Record<'bowler_id' | 'birth_year', string>>;

export function validateIdentity(form: AthleteInput, athletes: Athlete[], isNew: boolean): FormErrors {
  const e: FormErrors = {};
  if (!BOWLER_ID.test(form.bowler_id)) e.bowler_id = 'Use 2–24 letters or numbers, e.g. B07.';
  else if (isNew && athletes.some((a) => a.bowler_id.toUpperCase() === form.bowler_id.toUpperCase())) e.bowler_id = 'This code is already used by another bowler.';
  const age = THIS_YEAR - form.birth_year;
  if (!form.birth_year || age < 8 || age > 50) e.birth_year = 'Enter a birth year for an age between 8 and 50.';
  return e;
}

type Props = { form: AthleteInput; setForm: (f: AthleteInput) => void };

export function IdentityFields({ form, setForm, isNew, errors }: Props & { isNew: boolean; errors: FormErrors }) {
  const age = THIS_YEAR - form.birth_year;
  return (
    <>
      <Field label="Bowler code" value={form.bowler_id} autoCapitalize="characters" autoCorrect={false}
        onChangeText={(t) => setForm({ ...form, bowler_id: t.toUpperCase().replace(/\s/g, '') })}
        editable={isNew} placeholder="e.g. B07" error={errors.bowler_id}
        hint={isNew ? 'An anonymous code, never the bowler’s name (research ethics).' : 'The code cannot be changed after the profile is created.'} />
      <Field label="Birth year" value={form.birth_year ? String(form.birth_year) : ''} keyboardType="number-pad" maxLength={4}
        onChangeText={(t) => setForm({ ...form, birth_year: Number(t.replace(/\D/g, '')) || 0 })}
        error={errors.birth_year} hint={age >= 8 && age <= 50 ? `Age ${age} this year` : undefined} />
    </>
  );
}

export function BowlingFields({ form, setForm, compact }: Props & { compact?: boolean }) {
  const levels = [
    { value: 'school', title: 'School', text: 'School teams, under-13 to under-19' },
    { value: 'club', title: 'Club', text: 'Club and division cricket' },
    { value: 'provincial', title: 'Provincial', text: 'Provincial or district squads' },
    { value: 'national', title: 'National', text: 'National pathway or squad' },
  ] as const;
  return (
    <>
      <Segmented label="Bowling arm" value={form.dominant_arm} onChange={(v) => setForm({ ...form, dominant_arm: v })}
        options={[{ label: 'Right-arm', value: 'right' }, { label: 'Left-arm', value: 'left' }]} />
      {compact ? (
        <Chips label="Playing level" value={form.playing_level} onChange={(v) => setForm({ ...form, playing_level: v })}
          options={levels.map((l) => ({ label: l.title, value: l.value }))} />
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={st.label}>Playing level</Text>
          {levels.map((l) => (
            <OptionCard key={l.value} icon={l.value === 'school' ? 'school-outline' : l.value === 'club' ? 'people-outline' : l.value === 'provincial' ? 'flag-outline' : 'trophy-outline'}
              title={l.title} text={l.text} selected={form.playing_level === l.value} onPress={() => setForm({ ...form, playing_level: l.value })} />
          ))}
        </View>
      )}
    </>
  );
}

export function InjuryFields({ form, setForm }: Props) {
  const [adding, setAdding] = useState(false);
  const [site, setSite] = useState<InjurySite | null>(null);
  const [when, setWhen] = useState<number | null>(null);
  const [back, setBack] = useState<'yes' | 'no'>('yes');

  function add() {
    if (!site || when == null) return;
    const rec: InjuryRecord = { site, injury_date: monthsAgo(when), returned_to_play: back === 'yes' };
    setForm({ ...form, injury_history: [...form.injury_history, rec] });
    setAdding(false); setSite(null); setWhen(null); setBack('yes');
  }

  return (
    <View style={{ gap: 10 }}>
      {form.injury_history.length === 0 && !adding && (
        <View style={st.none}>
          <Ionicons name="checkmark-circle" size={20} color={colors.ok} />
          <Text style={st.noneText}>No injuries recorded</Text>
        </View>
      )}
      {form.injury_history.map((i, idx) => (
        <View key={`${i.site}-${i.injury_date}-${idx}`} style={st.injury}>
          <View style={st.injIcon}><Ionicons name="bandage-outline" size={18} color={colors.danger} /></View>
          <View style={{ flex: 1 }}>
            <Text style={st.injTitle}>{SITE_LABEL[i.site]}</Text>
            <Small>{new Date(i.injury_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} · {i.returned_to_play ? 'Back playing' : 'Not yet back playing'}{i.notes ? ` · ${i.notes}` : ''}</Small>
          </View>
          <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${SITE_LABEL[i.site]} injury`}
            onPress={() => setForm({ ...form, injury_history: form.injury_history.filter((_, k) => k !== idx) })}>
            <Ionicons name="close-circle" size={22} color={colors.muted} />
          </Pressable>
        </View>
      ))}

      {adding ? (
        <View style={st.addBox}>
          <Chips label="Where was the injury?" value={site} onChange={setSite} options={SITES.map((x) => ({ label: SITE_LABEL[x], value: x }))} />
          <Chips label="When did it happen?" value={when} onChange={setWhen} options={WHEN} />
          <Segmented label="Back to full bowling?" value={back} onChange={setBack} options={[{ label: 'Yes', value: 'yes' }, { label: 'Not yet', value: 'no' }]} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Cancel" variant="secondary" onPress={() => setAdding(false)} style={{ flex: 1 }} />
            <Button title="Add injury" onPress={add} disabled={!site || when == null} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <Button title={form.injury_history.length ? 'Add another injury' : 'Add an injury'} icon="add" variant="secondary" onPress={() => setAdding(true)} />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  label: { color: colors.textSoft, fontSize: 14, fontWeight: '600' },
  none: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: radius.md, backgroundColor: colors.okSoft },
  noneText: { color: colors.ok, fontWeight: '700', fontSize: 15 },
  injury: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  injIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  injTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  addBox: { padding: 14, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, gap: 2 },
});
