// C1 (Nethmi) - full pose result. Hero: the skeleton replay (DeliveryPlayer, with the key-moment markers when
// the joint-angle row is passed in). Then tracking quality, how reliable each body part is from this camera
// setup, and filming advice when the bowler was often missed.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { regionsFromSummary } from '../../analysis/reliability';
import { c1 } from '../../api/c1';
import type { FeatureRow } from '../../c2/types';
import {
  BodyReliabilityMap, Card, color, COMPONENT, DeliveryPlayer, font, MetricTile, RISK, ScoreRing, sp, useResearchMode,
} from '../../ui';
import type { ProcessResult } from '../types';

export type DetectionQuality = 'good' | 'fair' | 'poor';

/** Share of frames where the bowler was found: good >= 60 %, fair 40-60 %, poor < 40 %. */
export function detectionQuality(rate: number): DetectionQuality {
  return rate >= 0.6 ? 'good' : rate >= 0.4 ? 'fair' : 'poor';
}

export const QUALITY: Record<DetectionQuality, { label: string; color: string; icon: 'checkmark-circle' | 'alert-circle' | 'close-circle'; text: string }> = {
  good: { label: 'Good', color: RISK.low.color, icon: 'checkmark-circle', text: 'The bowler was tracked through most of the delivery.' },
  fair: { label: 'Fair', color: RISK.moderate.color, icon: 'alert-circle', text: 'Some frames were missed; short gaps are filled, longer ones stay empty.' },
  poor: { label: 'Poor', color: RISK.critical.text, icon: 'close-circle', text: 'The bowler was missed in many frames, so joint angles will have gaps.' },
};

export function PoseResultScreen({ result, rawUri, row }: {
  result: ProcessResult;
  /** The original clip, for the skeleton on/off toggle. */
  rawUri?: string | null;
  /** Joint-angle result for this clip: its fps and back-foot / front-foot / release frames become scrubber markers. */
  row?: FeatureRow | null;
}) {
  const rate = result.detection_rate;
  const q = QUALITY[detectionQuality(rate)];
  const rel = result.reliability;
  const tint = COMPONENT.c1.color;
  const research = useResearchMode();

  return (
    <View style={{ gap: sp(2) }}>
      <DeliveryPlayer overlayUri={c1.fileUrl(result.overlay_url)} rawUri={rawUri} fps={row?.fps}
        events={row ? { bfc: row.events.bfc_frame, ffc: row.events.ffc_frame, release: row.events.release_frame } : null}
        caption={research ? `${result.clip_id} · run ${result.run_id}` : undefined} />

      <Card>
        <View style={s.qualityRow}>
          <ScoreRing value={rate * 100} tint={q.color} size={96} label="Frames with the bowler" />
          <View style={{ flex: 1, gap: sp(0.75) }}>
            <View style={s.qualityHead}>
              <Ionicons name={q.icon} size={20} color={q.color} />
              <Text style={[s.qualityWord, { color: q.color }]}>{q.label} tracking</Text>
            </View>
            <Text style={s.body}>{q.text}</Text>
          </View>
        </View>
        <View style={s.tiles}>
          <MetricTile label="Frames" value={result.frames} icon="film-outline" />
          {research && <MetricTile label="Pose time" value={result.processing_seconds} unit="s" icon="time-outline" />}
          <MetricTile label="Arm" value={result.bowling_arm === 'right' ? 'Right' : 'Left'} icon="hand-left-outline" />
        </View>
      </Card>

      <Card>
        <Text style={s.h2}>How well each body part is tracked from here</Text>
        {rel?.setup_matched ? (
          <Text style={s.muted}>Camera position {rel.setup_matched}: {rel.usable} of {rel.total} body points tracked reliably{research ? ` (ICC ≥ ${rel.gate ?? 0.75}). Points are only tagged, never removed` : ''}.</Text>
        ) : (
          <View style={s.unverified}>
            <Ionicons name="help-circle" size={20} color={RISK.moderate.color} />
            <Text style={[s.body, { flex: 1 }]}>This camera position hasn't been tested yet, so results are marked unverified.</Text>
          </View>
        )}
        <BodyReliabilityMap regions={regionsFromSummary(rel)} />
      </Card>

      {detectionQuality(rate) !== 'good' && (
        <Card>
          <Text style={s.h2}>Filming tips for next time</Text>
          {[
            'Only the bowler in the frame – no umpire or batter crossing.',
            'Whole body visible from run-up to follow-through.',
            'Hold the phone landscape, steady, at hip height.',
            'Good light behind the camera; 60 fps slow-mo if the phone has it.',
            'Stand about 5 m away (closer if the bowler looks small).',
          ].map((t) => (
            <View key={t} style={s.tip}>
              <Ionicons name="videocam-outline" size={16} color={tint} />
              <Text style={[s.body, { flex: 1 }]}>{t}</Text>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  qualityRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  qualityHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qualityWord: { ...font.h2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1) },
  h2: { ...font.h2, color: color.text },
  body: { ...font.body, color: color.text },
  muted: { ...font.body, color: color.muted },
  unverified: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(1) },
});
