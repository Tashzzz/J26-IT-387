// Add a bowler (no id) or edit one (?id=). Same payload as C4's profile screen.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { BowlerForm } from '../../src/shell/BowlerForm';
import { nextCode, useSquad } from '../../src/shell/squad';
import { EmptyState, Screen, Skeleton } from '../../src/ui';

export default function EditBowler() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { rows, loading, refresh, byId } = useSquad();
  const row = id ? byId(Number(id)) : undefined;
  const codes = rows.map((r) => r.athlete.bowler_id);

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? `Edit ${row?.athlete.bowler_id ?? 'bowler'}` : 'Add bowler' }} />
      {loading ? <Skeleton height={360} round={20} />
        : id && !row ? <EmptyState icon="help-circle" title="Bowler not found" text="It may have been removed on the team computer." />
        : (
          <BowlerForm key={row?.athlete.id ?? 'new'} athlete={row?.athlete} suggestedCode={nextCode(codes)} takenCodes={codes}
            onSaved={async (a) => {
              await refresh();
              if (id) router.back();
              else router.replace({ pathname: '/bowler/[id]', params: { id: String(a.id) } });
            }} />
        )}
    </Screen>
  );
}
