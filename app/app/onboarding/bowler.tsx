// Add the first bowler, then finish onboarding and land on Home.
import { useRouter } from 'expo-router';

import { useApp } from '../../src/shell/AppContext';
import { BowlerForm } from '../../src/shell/BowlerForm';
import { ONBOARDING_STEPS } from '../../src/shell/onboarding';
import { nextCode, useSquad } from '../../src/shell/squad';
import { ErrorBanner, GradientHeader, Screen, SecondaryButton, Skeleton, StepIndicator } from '../../src/ui';

export default function FirstBowler() {
  const router = useRouter();
  const { finishOnboarding } = useApp();
  const { rows, loading, error, refresh } = useSquad();
  const codes = rows.map((r) => r.athlete.bowler_id);

  async function done() {
    await finishOnboarding();
    router.replace('/');
  }

  return (
    <Screen safeTop>
      <StepIndicator steps={ONBOARDING_STEPS} current={3} />
      <GradientHeader title="Add your first bowler" subtitle="Profile first: every video, risk score and plan is saved to a bowler." icon="person-add" />
      {error ? (
        <ErrorBanner title="Can't reach the team computer" message={`${error}\nCheck the backend URL in Settings, or add bowlers later.`} onRetry={refresh} />
      ) : loading ? (
        <Skeleton height={320} round={20} />
      ) : (
        <BowlerForm suggestedCode={nextCode(codes)} takenCodes={codes} submitTitle="Add bowler & finish"
          onSaved={async () => { await refresh(); await done(); }} />
      )}
      <SecondaryButton title="Skip - I'll add bowlers later" onPress={done} />
    </Screen>
  );
}
