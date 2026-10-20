// Squad: search + filters + bowler cards (real first, demo last) and a floating "Add bowler" button.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BowlerCard } from '../../src/shell/BowlerCard';
import { isHighRisk, needsAnalysis, useSquad } from '../../src/shell/squad';
import {
  ChipGroup, color, EmptyState, ErrorBanner, font, GradientHeader, glow, gradient, Screen, Skeleton, sp, TextField,
} from '../../src/ui';

type Filter = 'all' | 'high' | 'analyse';

export default function Squad() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const { rows, loading, error, refresh, riskUnavailable } = useSquad();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => { if (params.filter === 'analyse' || params.filter === 'high') setFilter(params.filter); }, [params.filter]);

  const counts = useMemo(() => ({
    all: rows.length,
    high: rows.filter((r) => isHighRisk(r.level)).length,
    analyse: rows.filter(needsAnalysis).length,
  }), [rows]);

  const shown = rows.filter((r) =>
    r.athlete.bowler_id.toLowerCase().includes(q.trim().toLowerCase())
    && (filter === 'all' || (filter === 'high' ? isHighRisk(r.level) : needsAnalysis(r))));
  const firstDemo = shown.findIndex((r) => r.demo);

  return (
    <View style={{ flex: 1 }}>
      <Screen safeTop onRefresh={refresh} style={{ paddingBottom: 120 }}>
        <GradientHeader title="Squad" subtitle="Every bowler you track. Tap one for risk, workload and plans." icon="people" />
        <TextField label="Search" value={q} onChangeText={setQ} placeholder="Bowler code, e.g. B03" icon="search" autoCapitalize="characters" />
        <ChipGroup value={filter} onChange={setFilter} options={[
          { value: 'all', label: `All · ${counts.all}` },
          { value: 'high', label: `High risk · ${riskUnavailable ? '–' : counts.high}` },
          { value: 'analyse', label: `Needs analysis · ${counts.analyse}` },
        ]} />

        {error ? <ErrorBanner title="Can't load the squad" message={error} onRetry={refresh} />
          : loading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} height={92} round={20} />)
          : rows.length === 0 ? (
            <EmptyState icon="person-add" title="No bowlers yet" text="Add a bowler with an anonymous code to start analysing deliveries."
              actionTitle="Add bowler" onAction={() => router.push('/bowler/edit')} />
          ) : shown.length === 0 ? (
            <EmptyState icon="search" title="No match" text={filter === 'high' ? 'No bowler is at high risk.' : filter === 'analyse' ? 'Every bowler has at least one analysed delivery.' : `No bowler code contains "${q}".`} />
          ) : shown.map((r, i) => (
            <View key={r.athlete.id} style={{ gap: sp(1) }}>
              {i === firstDemo && <Text style={s.section}>Demo bowlers</Text>}
              <BowlerCard row={r} onPress={() => router.push({ pathname: '/bowler/[id]', params: { id: String(r.athlete.id) } })} />
            </View>
          ))}
      </Screen>

      <Pressable onPress={() => router.push('/bowler/edit')} accessibilityRole="button" accessibilityLabel="Add bowler"
        style={({ pressed }) => [s.fab, glow(gradient.brand[0], 1), pressed && { transform: [{ scale: 0.97 }] }]}>
        <LinearGradient colors={gradient.brand} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={s.fabInner}>
          <Ionicons name="add" size={22} color={color.onBrand} />
          <Text style={s.fabText}>Add bowler</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  section: { ...font.caption, color: color.muted, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: sp(1) },
  fab: { position: 'absolute', right: sp(2), bottom: sp(2), borderRadius: 28 },
  fabInner: { flexDirection: 'row', alignItems: 'center', gap: sp(1), height: 56, paddingHorizontal: sp(2.5), borderRadius: 28 },
  fabText: { ...font.h2, color: color.onBrand, fontWeight: '800' },
});
