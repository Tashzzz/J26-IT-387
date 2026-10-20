// One bowler in a list: avatar with risk ring, code, tags, latest risk, last assessed.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, color, font, glow, radius, RiskBadge, sp, Tag } from '../ui';
import { useApp } from './AppContext';
import { ageOf, ago, type SquadRow } from './squad';

const LEVEL: Record<string, string> = { school: 'School', club: 'Club', provincial: 'Provincial', national: 'National' };

export function BowlerCard({ row, onPress, selected, right }: {
  row: SquadRow;
  onPress: () => void;
  selected?: boolean;
  right?: React.ReactNode;
}) {
  const a = row.athlete;
  const analysed = useApp().extras[a.id]?.lastAnalysedAt;
  const status = analysed ? `Analysed ${ago(analysed)}` : row.latest ? `Assessed ${ago(row.latest.created_at)}` : 'No risk assessment yet';
  const deliveries = row.deliveries == null ? null
    : row.deliveries === 0 ? 'Not analysed yet' : `${row.deliveries} ${row.deliveries === 1 ? 'delivery' : 'deliveries'} analysed`;
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`Bowler ${a.bowler_id}${row.demo ? ', demo' : ''}. ${row.level ? `${row.level} risk.` : 'Risk not assessed.'} ${deliveries ?? ''}`}
      style={({ pressed }) => [s.card, selected && [s.selected, glow(color.brandText, 0.6)], pressed && { opacity: 0.8 }]}>
      <Avatar code={a.bowler_id} risk={row.level} size={52} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={s.top}>
          <Text style={[s.code, row.demo && { color: color.muted }]}>{a.bowler_id}</Text>
          {row.demo && <Tag label="Demo" />}
        </View>
        <View style={s.tags}>
          <Tag label={`Age ${ageOf(a.birth_year)}`} />
          <Tag label={LEVEL[a.playing_level] ?? a.playing_level} />
          <Tag label={a.dominant_arm === 'left' ? 'Left-arm' : 'Right-arm'} icon="hand-left-outline" />
        </View>
        <Text style={s.meta} numberOfLines={1}>{[deliveries, status].filter(Boolean).join(' · ')}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: sp(1) }}>
        {right ?? (row.level ? <RiskBadge level={row.level} size="sm" suffix="" /> : <Tag label="No risk yet" />)}
        <Ionicons name="chevron-forward" size={18} color={color.muted} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: radius.card, padding: sp(1.5) },
  selected: { borderColor: color.brandText },
  top: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  code: { ...font.h2, color: color.text, letterSpacing: 0.5 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  meta: { ...font.caption, color: color.muted },
});
