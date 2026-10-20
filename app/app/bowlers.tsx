// Switch the current bowler, or add a new one. The choice applies to every tab.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { athleteLine, useApp } from '../src/state/AppContext';
import { Avatar, Button, EmptyState, Field, Screen, Small } from '../src/ui/components';
import { colors, radius } from '../src/ui/theme';

export default function Bowlers() {
  const router = useRouter();
  const { athletes, athlete, selectAthlete, refreshAthletes } = useApp();
  const [q, setQ] = useState('');
  const list = athletes.filter((a) => a.bowler_id.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Screen onRefresh={refreshAthletes} footer={<Button title="Add a bowler" icon="person-add-outline" onPress={() => router.push({ pathname: '/bowler', params: { mode: 'new' } })} />}>
      {athletes.length > 6 && <Field label="Search" value={q} onChangeText={setQ} placeholder="Bowler code" autoCapitalize="characters" />}
      {athletes.length === 0 && <EmptyState icon="people-outline" title="No bowlers yet" text="Add the first bowler to get started." />}
      <View style={{ gap: 10 }}>
        {list.map((a) => {
          const on = a.id === athlete?.id;
          return (
            <Pressable key={a.id} accessibilityRole="radio" accessibilityState={{ selected: on }}
              onPress={() => { selectAthlete(a.id); if (router.canGoBack()) router.back(); else router.replace('/'); }}
              style={({ pressed }) => [s.row, on && s.rowOn, pressed && { opacity: 0.85 }]}>
              <Avatar code={a.bowler_id} />
              <View style={{ flex: 1 }}>
                <Text style={s.code}>{a.bowler_id}</Text>
                <Small>{athleteLine(a)}{a.injury_history.length ? ` · ${a.injury_history.length} injur${a.injury_history.length === 1 ? 'y' : 'ies'}` : ''}</Small>
              </View>
              {on ? <Ionicons name="checkmark-circle" size={24} color={colors.primary} /> : <Ionicons name="ellipse-outline" size={24} color={colors.borderStrong} />}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14 },
  rowOn: { borderColor: colors.primary, backgroundColor: '#F5F8FF' },
  code: { color: colors.text, fontSize: 17, fontWeight: '800' },
});
