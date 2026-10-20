// Add a bowler (?mode=new) or edit the current bowler's profile (?mode=edit).
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';

import { c4 } from '../src/api/c4';
import { blankAthlete, BowlingFields, IdentityFields, InjuryFields, suggestCode, validateIdentity, type FormErrors } from '../src/c4/BowlerForm';
import type { AthleteInput } from '../src/c4/types';
import { useApp } from '../src/state/AppContext';
import { Banner, Body, Button, Card, Screen, Section } from '../src/ui/components';

export default function BowlerScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { athlete, athletes, refreshAthletes, selectAthlete, setAthletes, generatePlan } = useApp();
  const isNew = mode === 'new' || !athlete;

  const [form, setForm] = useState<AthleteInput>(() => {
    if (!isNew && athlete) { const { id: _id, ...rest } = athlete; return rest; }
    return blankAthlete(suggestCode(athletes));
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: isNew ? 'Add a bowler' : `Edit ${athlete?.bowler_id ?? 'profile'}` });
  }, [navigation, isNew, athlete]);

  useEffect(() => { setErrors({}); }, [form.bowler_id, form.birth_year]);

  async function save() {
    const e = validateIdentity(form, athletes, isNew);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setError(null);
    try {
      if (isNew) {
        const a = await c4.createAthlete(form);
        await refreshAthletes();
        selectAthlete(a.id);
      } else if (athlete) {
        const a = await c4.updateAthlete(athlete.id, form);
        setAthletes((list) => list.map((x) => (x.id === a.id ? a : x)));
        generatePlan(); // injury history changes the plan
      }
      if (router.canGoBack()) router.back(); else router.replace('/profile');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen footer={<Button title={isNew ? 'Create profile' : 'Save changes'} icon="checkmark" onPress={save} loading={busy} />}>
      <Section title="Bowler">
        <Card><IdentityFields form={form} setForm={setForm} isNew={isNew} errors={errors} /></Card>
      </Section>
      <Section title="Bowling">
        <Card><BowlingFields form={form} setForm={setForm} compact /></Card>
      </Section>
      <Section title="Injuries in the last 2 years">
        <InjuryFields form={form} setForm={setForm} />
      </Section>
      {error && <Banner tone="danger" icon="alert-circle-outline" title="Could not save"><Body muted>{error}</Body></Banner>}
    </Screen>
  );
}
