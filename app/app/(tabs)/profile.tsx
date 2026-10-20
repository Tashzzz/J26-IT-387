// Profile: the current bowler's details and injury history, switching bowlers, and app settings.
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { SITE_LABEL } from '../../src/c4/BowlerForm';
import { ageOf, LEVEL_LABEL, useApp } from '../../src/state/AppContext';
import { Avatar, Badge, Button, Card, EmptyState, List, ListItem, Screen, Section, Small } from '../../src/ui/components';
import { colors, radius } from '../../src/ui/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { athlete, athletes } = useApp();

  if (!athlete) {
    return (
      <Screen title="Profile">
        <EmptyState icon="person-add-outline" title="No bowler yet" text="Create a profile to start." action="Create bowler profile"
          onAction={() => router.push({ pathname: '/bowler', params: { mode: 'new' } })} />
        <List><ListItem icon="settings-outline" title="Settings" onPress={() => router.push('/settings')} last /></List>
      </Screen>
    );
  }

  const injuries = [...athlete.injury_history].sort((a, b) => b.injury_date.localeCompare(a.injury_date));

  return (
    <Screen title="Profile">
      <Card style={s.head}>
        <Avatar code={athlete.bowler_id} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.code}>{athlete.bowler_id}</Text>
          <Small>{LEVEL_LABEL[athlete.playing_level]} fast bowler</Small>
        </View>
        <Button title="Edit" size="sm" variant="secondary" icon="create-outline" onPress={() => router.push({ pathname: '/bowler', params: { mode: 'edit' } })} />
      </Card>

      <View style={s.facts}>
        <Fact label="Age" value={`${ageOf(athlete)}`} />
        <Fact label="Arm" value={athlete.dominant_arm === 'right' ? 'Right' : 'Left'} />
        <Fact label="Level" value={LEVEL_LABEL[athlete.playing_level]} />
      </View>

      <Section title="Injury history" action="Edit" onAction={() => router.push({ pathname: '/bowler', params: { mode: 'edit' } })}>
        {injuries.length === 0 ? (
          <Card><Small>No injuries recorded. Keep this up to date — past injuries strongly affect risk.</Small></Card>
        ) : (
          <List>
            {injuries.map((i, idx) => (
              <ListItem key={`${i.site}-${i.injury_date}`} icon="bandage-outline" iconColor={colors.danger} title={SITE_LABEL[i.site]}
                subtitle={`${new Date(i.injury_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}${i.notes ? ` · ${i.notes}` : ''}`}
                right={<Badge text={i.returned_to_play ? 'Recovered' : 'Not back yet'} tone={i.returned_to_play ? 'ok' : 'warn'} />}
                last={idx === injuries.length - 1} />
            ))}
          </List>
        )}
      </Section>

      <Section title="Bowling">
        <List>
          <ListItem icon="calendar-outline" title="Workload log" subtitle="Sessions, overs and soreness" onPress={() => router.push('/workload')} />
          <ListItem icon="time-outline" title="Plan history" subtitle="Every plan made for this bowler" onPress={() => router.push('/plan-history')} last />
        </List>
      </Section>

      <Section title="Bowlers">
        <List>
          <ListItem icon="people-outline" title="Switch bowler" subtitle={`${athletes.length} ${athletes.length === 1 ? 'profile' : 'profiles'} on this device’s server`} onPress={() => router.push('/bowlers')} />
          <ListItem icon="person-add-outline" title="Add a bowler" onPress={() => router.push({ pathname: '/bowler', params: { mode: 'new' } })} last />
        </List>
      </Section>

      <Section title="App">
        <List>
          <ListItem icon="book-outline" title="Camera setup guide" subtitle="Which camera positions give reliable results" onPress={() => router.push('/reliability')} />
          <ListItem icon="settings-outline" title="Settings" subtitle="Server connection, demo data, about" onPress={() => router.push('/settings')} last />
        </List>
      </Section>
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.fact}>
      <Text style={s.factValue}>{value}</Text>
      <Small>{label}</Small>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  code: { color: colors.text, fontSize: 24, fontWeight: '800' },
  facts: { flexDirection: 'row', gap: 10 },
  fact: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: 14, alignItems: 'center', gap: 2 },
  factValue: { color: colors.text, fontSize: 18, fontWeight: '800' },
});
