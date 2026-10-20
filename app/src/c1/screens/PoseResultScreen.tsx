// C1 (Nethmi) - full pose result: skeleton overlay video, detection quality, keypoint reliability
// for this camera setup, and filming advice when the bowler was often missed.
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { regionsFromSummary } from '../../analysis/reliability';
import { c1 } from '../../api/c1';
import {
  BodyReliabilityMap, Card, color, COMPONENT, font, IconButton, MetricTile, radius, RISK, ScoreRing, SegmentedControl, sp, useResearchMode,
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

const SPEEDS = [{ value: '1', label: '1×' }, { value: '0.5', label: '½×' }, { value: '0.25', label: '¼×' }] as const;

function OverlayVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.loop = true; p.muted = true; p.play(); });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]['value']>('1');
  return (
    <View style={{ gap: sp(1) }}>
      <View style={s.videoBox}>
        <VideoView player={player} nativeControls={false} contentFit="contain" style={s.video} />
      </View>
      <View style={s.controls}>
        <IconButton icon={isPlaying ? 'pause' : 'play'} label={isPlaying ? 'Pause' : 'Play'} filled tint={COMPONENT.c1.color}
          onPress={() => (isPlaying ? player.pause() : player.play())} />
        <View style={{ flex: 1 }}>
          <SegmentedControl options={SPEEDS} value={speed} tint={COMPONENT.c1.color}
            onChange={(v) => { setSpeed(v); player.playbackRate = Number(v); }} />
        </View>
      </View>
    </View>
  );
}

export function PoseResultScreen({ result }: { result: ProcessResult }) {
  const rate = result.detection_rate;
  const q = QUALITY[detectionQuality(rate)];
  const rel = result.reliability;
  const tint = COMPONENT.c1.color;
  const research = useResearchMode();

  return (
    <View style={{ gap: sp(2) }}>
      <Card style={{ padding: sp(1.5) }}>
        <OverlayVideo url={c1.fileUrl(result.overlay_url)} />
        <Text style={s.caption}>{result.clip_id} · skeleton overlay</Text>
      </Card>

      <Card>
        <View style={s.qualityRow}>
          <ScoreRing value={rate * 100} tint={q.color} size={104} label="Bowler found" />
          <View style={{ flex: 1, gap: sp(0.75) }}>
            <View style={s.qualityHead}>
              <Ionicons name={q.icon} size={20} color={q.color} />
              <Text style={[s.qualityWord, { color: q.color }]}>{q.label} detection</Text>
            </View>
            <Text style={s.body}>{q.text}</Text>
          </View>
        </View>
        <View style={s.tiles}>
          <MetricTile label="Frames" value={result.frames} icon="film-outline" />
          <MetricTile label="Pose time" value={result.processing_seconds} unit="s" icon="time-outline" />
          <MetricTile label="Arm" value={result.bowling_arm === 'right' ? 'Right' : 'Left'} icon="hand-left-outline" />
        </View>
      </Card>

      <Card>
        <Text style={s.h2}>Keypoint reliability for this setup</Text>
        {rel?.setup_matched ? (
          <Text style={s.muted}>Camera setup {rel.setup_matched}: {rel.usable} of {rel.total} body points passed the reliability check{research ? ` (ICC ≥ ${rel.gate ?? 0.75})` : ''}. Points are only tagged, never removed.</Text>
        ) : (
          <View style={s.unverified}>
            <Ionicons name="help-circle" size={20} color={RISK.moderate.color} />
            <Text style={[s.body, { flex: 1 }]}>Not tested yet for this camera setup – results are marked unverified.</Text>
          </View>
        )}
        <BodyReliabilityMap regions={regionsFromSummary(rel)} />
      </Card>

      {detectionQuality(rate) !== 'good' && (
        <Card variant="glow" accent={tint}>
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
  videoBox: { borderRadius: radius.button, overflow: 'hidden', backgroundColor: '#000' },
  video: { width: '100%', aspectRatio: 16 / 9, maxHeight: 480 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5) },
  caption: { ...font.caption, color: color.muted },
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
