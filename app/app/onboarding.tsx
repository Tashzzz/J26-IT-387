// First-launch profile set-up: 3 short steps (who, how they bowl, injuries) -> Home.
// ?mode=pick lists the existing profiles instead.
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { c4 } from '../src/api/c4';
import { blankAthlete, BowlingFields, IdentityFields, InjuryFields, suggestCode, validateIdentity, type FormErrors } from '../src/c4/BowlerForm';
import type { AthleteInput } from '../src/c4/types';
import { athleteLine, useApp } from '../src/state/AppContext';
import { Banner, Body, Button, OptionCard, Stepper } from '../src/ui/components';
import { colors, type as t } from '../src/ui/theme';

const STEPS = ['Bowler', 'Bowling', 'Injuries'];
const HEAD = [
  { title: 'Who are you setting up?', text: 'Each bowler gets an anonymous code so no names are stored.' },
  { title: 'How do they bowl?', text: 'This sets the right workload limits and how the video is read.' },
  { title: 'Any injuries in the last 2 years?', text: 'Past injuries are one of the strongest signs of future risk.' },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { athletes, refreshAthletes, completeOnboarding, online } = useApp();

  const [picking, setPicking] = useState(mode === 'pick' && athletes.length > 0);
  const [pick, setPick] = useState<number | null>(athletes[0]?.id ?? null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<AthleteInput>(() => blankAthlete(suggestCode(athletes)));
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (id: number) => {
    await completeOnboarding(id);
    router.replace('/');
  };

  const valid = useMemo(() => Object.keys(validateIdentity(form, athletes, true)).length === 0, [form, athletes]);

  async function next() {
    if (step === 0) {
      const e = validateIdentity(form, athletes, true);
      setErrors(e);
      if (Object.keys(e).length) return;
    }
    if (step < STEPS.length - 1) { setStep(step + 1); return; }
    setBusy(true);
    setError(null);
    try {
      const a = await c4.createAthlete(form);
      await refreshAthletes();
      await finish(a.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function back() {
    if (step > 0) setStep(step - 1);
    else if (router.canGoBack()) router.back();
  }

  if (picking) {
    return (
      <View style={[s.root, { paddingTop: insets.top + 8 }]}>
        <ScrollView contentContainerStyle={s.scroll}>
          <View style={s.inner}>
            <TopBar onBack={() => (router.canGoBack() ? router.back() : setPicking(false))} />
            <Text style={t.title}>Choose a bowler</Text>
            <Body muted>You can switch between bowlers any time from Home.</Body>
            <View style={{ gap: 10, marginTop: 8 }}>
              {athletes.map((a) => (
                <OptionCard key={a.id} icon="person-outline" title={a.bowler_id} text={athleteLine(a)} selected={pick === a.id} onPress={() => setPick(a.id)} />
              ))}
            </View>
            <Button title="Create a new profile instead" variant="ghost" icon="add" onPress={() => setPicking(false)} />
          </View>
        </ScrollView>
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={s.inner}><Button title="Continue" onPress={() => pick != null && finish(pick)} disabled={pick == null} /></View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[s.root, { paddingTop: insets.top + 8 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.inner}>
          <TopBar onBack={back} label={`Step ${step + 1} of ${STEPS.length}`} />
          <Stepper steps={STEPS} current={step} />
          <View style={{ gap: 6, marginTop: 12, marginBottom: 8 }}>
            <Text style={t.title}>{HEAD[step].title}</Text>
            <Body muted>{HEAD[step].text}</Body>
          </View>

          {step === 0 && <IdentityFields form={form} setForm={(f) => { setForm(f); setErrors({}); }} isNew errors={errors} />}
          {step === 1 && <BowlingFields form={form} setForm={setForm} />}
          {step === 2 && <InjuryFields form={form} setForm={setForm} />}

          {online === false && (
            <Banner tone="warn" icon="cloud-offline-outline" title="Not connected to the server" action="Connection settings" onAction={() => router.push('/settings')}>
              <Body muted>The profile is saved on the CricShield server, so a connection is needed.</Body>
            </Banner>
          )}
          {error && <Banner tone="danger" icon="alert-circle-outline" title="Could not create the profile"><Body muted>{error}</Body></Banner>}
        </View>
      </ScrollView>
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={s.inner}>
          <Button title={step < STEPS.length - 1 ? 'Continue' : 'Create profile'} icon={step < STEPS.length - 1 ? 'arrow-forward' : 'checkmark'}
            onPress={next} loading={busy} disabled={step === 0 && !valid} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function TopBar({ onBack, label }: { onBack: () => void; label?: string }) {
  return (
    <View style={s.top}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} style={s.back}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      {label ? <Text style={t.small}>{label}</Text> : null}
      <View style={{ width: 40 }} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  inner: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
