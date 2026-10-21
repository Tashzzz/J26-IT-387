// Full results, one page per result (swipe or tap a tab): Tracking, Joint angles, Injury risk, Plan. Each page
// is the owner's screen from src/c1..c4/screens; Research mode adds the component badge and owner.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useAnalysis } from '../../src/analysis/AnalysisContext';
import { c2 } from '../../src/api/c2';
import { OWNER } from '../../src/analysis/owners';
import { RESULT_NAME } from '../../src/analysis/steps';
import { PoseResultScreen } from '../../src/c1/screens/PoseResultScreen';
import { BiomechanicsResultScreen } from '../../src/c2/screens/BiomechanicsResultScreen';
import { RiskResultScreen } from '../../src/c3/screens/RiskResultScreen';
import type { Thresholds } from '../../src/c2/types';
import { PlanResultScreen } from '../../src/c4/screens/PlanResultScreen';
import { useApp } from '../../src/shell/AppContext';
import { alpha, color, COMPONENT, COMPONENT_KEYS, ComponentBadge, EmptyState, font, gradient, radius, sp, type ComponentKey } from '../../src/ui';

const TAB: Record<ComponentKey, string> = { c1: 'Video', c2: 'Angles', c3: 'Risk', c4: 'Plan' };

export default function Details() {
  const { start } = useLocalSearchParams<{ start?: string }>();
  const { width } = useWindowDimensions();
  const { results, video, athlete } = useAnalysis();
  const { researchMode, coach } = useApp();
  const first = Math.max(0, COMPONENT_KEYS.indexOf((start ?? 'c1') as ComponentKey));
  const [page, setPage] = useState(first);
  // Height of the pager: each page's ScrollView needs a fixed height to scroll (on web it otherwise grows to its content).
  const [pageH, setPageH] = useState(0);
  const list = useRef<FlatList<ComponentKey>>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  // Limits + meanings (as on the Joint angles screen); not fatal if it fails.
  useEffect(() => { c2.thresholds().then(setThresholds, () => setThresholds(null)); }, []);

  const body = (k: ComponentKey) => {
    if (k === 'c1' && results.pose) return <PoseResultScreen result={results.pose} rawUri={video?.uri} row={results.row} />;
    if (k === 'c2' && results.row) return <BiomechanicsResultScreen row={results.row} thresholds={thresholds} />;
    if (k === 'c3' && results.risk) return <RiskResultScreen result={results.risk} />;
    if (k === 'c4' && results.plan) return <PlanResultScreen plan={results.plan} reviewer={coach.name} athleteId={athlete?.id} />;
    return <EmptyState spot="results" title="This step did not finish" text="Go back to the analysis to retry it." />;
  };

  return (
    <View style={s.screen}>
      <View style={s.tabs} accessibilityRole="tablist">
        {COMPONENT_KEYS.map((k, i) => {
          const on = i === page;
          const c = COMPONENT[k];
          const tint = gradient.brand[1];
          return (
            <Pressable key={k} onPress={() => { setPage(i); list.current?.scrollToIndex({ index: i, animated: true }); }}
              accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={RESULT_NAME[k]}
              style={[s.tab, on && { backgroundColor: alpha(tint, 0.14), borderColor: tint }]}>
              <Text style={[s.tabText, { color: on ? tint : color.muted }]} numberOfLines={1}>{researchMode ? c.code : TAB[k]}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        style={s.pager}
        onLayout={(e) => setPageH(e.nativeEvent.layout.height)}
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
          <ScrollView style={{ width, height: pageH || undefined }} contentContainerStyle={s.page}>
            <View style={s.inner}>
              {researchMode && (
                <View style={s.head}>
                  <ComponentBadge component={k} />
                  <Text style={s.owner}>Owner: {OWNER[k]}</Text>
                </View>
              )}
              <Text style={s.title} accessibilityRole="header">{RESULT_NAME[k]}</Text>
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
  pager: { flex: 1 },
  tabs: { flexDirection: 'row', gap: sp(1), paddingHorizontal: sp(2), paddingVertical: sp(1), borderBottomWidth: 1, borderBottomColor: color.border, backgroundColor: color.surface },
  tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: color.border },
  tabText: { ...font.body, fontWeight: '700' },
  page: { padding: sp(2), paddingBottom: sp(6) },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: sp(1.5) },
  head: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  owner: { ...font.caption, color: color.muted },
  title: { ...font.title, color: color.text },
});
