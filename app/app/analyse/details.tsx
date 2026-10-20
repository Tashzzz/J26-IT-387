// Full result screens, one page per component (swipe or tap a tab). Each page is the owner's screen
// from src/c1..c4/screens; in Research mode the owner's name is shown under the badge.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useAnalysis } from '../../src/analysis/AnalysisContext';
import { c2 } from '../../src/api/c2';
import { OWNER } from '../../src/analysis/owners';
import { PoseResultScreen } from '../../src/c1/screens/PoseResultScreen';
import { BiomechanicsResultScreen } from '../../src/c2/screens/BiomechanicsResultScreen';
import { RiskResultScreen } from '../../src/c3/screens/RiskResultScreen';
import type { Thresholds } from '../../src/c2/types';
import { PlanResultScreen } from '../../src/c4/screens/PlanResultScreen';
import { useApp } from '../../src/shell/AppContext';
import { alpha, color, COMPONENT, COMPONENT_KEYS, ComponentBadge, EmptyState, font, radius, sp, type ComponentKey } from '../../src/ui';

const TITLE: Record<ComponentKey, string> = { c1: 'Pose', c2: 'Joint angles', c3: 'Injury risk', c4: 'Prevention plan' };

export default function Details() {
  const { start } = useLocalSearchParams<{ start?: string }>();
  const { width } = useWindowDimensions();
  const { results } = useAnalysis();
  const { researchMode, coach } = useApp();
  const first = Math.max(0, COMPONENT_KEYS.indexOf((start ?? 'c1') as ComponentKey));
  const [page, setPage] = useState(first);
  const list = useRef<FlatList<ComponentKey>>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  // Limits + meanings (as on the Joint angles screen); not fatal if it fails.
  useEffect(() => { c2.thresholds().then(setThresholds, () => setThresholds(null)); }, []);

  const body = (k: ComponentKey) => {
    if (k === 'c1' && results.pose) return <PoseResultScreen result={results.pose} />;
    if (k === 'c2' && results.row) return <BiomechanicsResultScreen row={results.row} thresholds={thresholds} />;
    if (k === 'c3' && results.risk) return <RiskResultScreen result={results.risk} />;
    if (k === 'c4' && results.plan) return <PlanResultScreen plan={results.plan} reviewer={coach.name} />;
    return <EmptyState icon="hourglass-outline" tint={COMPONENT[k].color} title="This step did not finish" text="Go back to retry it." />;
  };

  return (
    <View style={s.screen}>
      <View style={s.tabs} accessibilityRole="tablist">
        {COMPONENT_KEYS.map((k, i) => {
          const on = i === page;
          const c = COMPONENT[k];
          return (
            <Pressable key={k} onPress={() => { setPage(i); list.current?.scrollToIndex({ index: i, animated: true }); }}
              accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${c.code} ${TITLE[k]}`}
              style={[s.tab, on && { backgroundColor: alpha(c.color, 0.18), borderColor: c.color }]}>
              <Text style={[s.tabText, { color: on ? c.color : color.muted }]}>{c.code}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        ref={list}
        data={COMPONENT_KEYS}
        keyExtractor={(k) => k}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={first}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item: k }) => (
          <ScrollView style={{ width }} contentContainerStyle={s.page}>
            <View style={s.inner}>
              <View style={s.head}>
                <ComponentBadge component={k} />
                {researchMode && <Text style={s.owner}>Owner: {OWNER[k]}</Text>}
              </View>
              <Text style={[s.title, { color: COMPONENT[k].color }]}>{TITLE[k]}</Text>
              {body(k)}
            </View>
          </ScrollView>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  tabs: { flexDirection: 'row', gap: sp(1), paddingHorizontal: sp(2), paddingVertical: sp(1), borderBottomWidth: 1, borderBottomColor: color.border, backgroundColor: color.surface },
  tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: color.border },
  tabText: { ...font.h2, fontSize: 15 },
  page: { padding: sp(2), paddingBottom: sp(6) },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: sp(2) },
  head: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  owner: { ...font.caption, color: color.muted, fontStyle: 'italic' },
  title: { ...font.title },
});
