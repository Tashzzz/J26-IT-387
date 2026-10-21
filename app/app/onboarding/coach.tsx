// Coach setup: name and team, kept on this phone.
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useApp } from '../../src/shell/AppContext';
import { ONBOARDING_STEPS } from '../../src/shell/onboarding';
import { Card, GradientHeader, PrimaryButton, Screen, SecondaryButton, StepIndicator, TextField } from '../../src/ui';

export default function CoachSetup() {
  const router = useRouter();
  const { coach, saveCoach } = useApp();
  const [name, setName] = useState(coach.name);
  const [team, setTeam] = useState(coach.team);

  return (
    <Screen safeTop>
      <StepIndicator steps={ONBOARDING_STEPS} current={2} />
      <GradientHeader title="About you" subtitle="Shown on Home. Saved on this phone only." icon="person" />
      <Card>
        <TextField label="Your name" value={name} onChangeText={setName} placeholder="e.g. Coach Perera" icon="person-outline" autoFocus />
        <TextField label="Team or school" value={team} onChangeText={setTeam} placeholder="e.g. U17 fast-bowling squad" icon="shield-outline" />
      </Card>
      <PrimaryButton title="Continue" icon="arrow-forward" disabled={!name.trim()}
        onPress={async () => { await saveCoach({ name: name.trim(), team: team.trim() }); router.push('/onboarding/bowler'); }} />
      <SecondaryButton title="Back" onPress={() => router.back()} />
    </Screen>
  );
}
