// Analysis step 3 - choose or record the delivery video, preview it, then start the pipeline.
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAnalysis, type Video } from '../../src/analysis/AnalysisContext';
import { ANALYSIS_STEPS } from '../../src/analysis/steps';
import {
  CAMERA_VIEW, Card, color, COMPONENT, EmptyState, ErrorBanner, font, MetricTile, PrimaryButton, radius, Screen, SecondaryButton, sp,
  StepIndicator,
} from '../../src/ui';

const C1 = COMPONENT.c1.color;

function Preview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.muted = true; p.loop = true; });
  return <VideoView player={player} nativeControls contentFit="contain" style={s.video} />;
}

const toVideo = (a: ImagePicker.ImagePickerAsset, source: Video['source']): Video => ({
  uri: a.uri,
  name: a.fileName ?? `video.${a.mimeType?.includes('quicktime') ? 'mov' : 'mp4'}`,
  mimeType: a.mimeType ?? 'video/mp4',
  file: a.file ?? undefined,
  durationMs: a.duration ?? null,
  source,
});

export default function VideoStep() {
  const router = useRouter();
  const { athlete, angle, distance, video, setVideo, run } = useAnalysis();
  const [err, setErr] = useState<string | null>(null);

  if (!athlete || !angle) {
    return <Screen><EmptyState icon="videocam" title="Set up the analysis first" actionTitle="Start again" onAction={() => router.replace('/analyse')} /></Screen>;
  }

  async function pick() {
    setErr(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsEditing: false });
    if (!res.canceled && res.assets.length) setVideo(toVideo(res.assets[0], 'library'));
  }

  async function record() {
    setErr(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setErr('Camera permission is needed to record. You can still choose a video from the gallery.'); return; }
    try {
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoMaxDuration: 15, videoQuality: ImagePicker.UIImagePickerControllerQualityType.High });
      if (!res.canceled && res.assets.length) setVideo(toVideo(res.assets[0], 'camera'));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const secs = video?.durationMs != null ? video.durationMs / 1000 : null;

  return (
    <Screen>
      <StepIndicator steps={ANALYSIS_STEPS} current={2} tint={C1} />
      <Text style={s.title}>One delivery of {athlete.bowler_id}</Text>
      <Text style={s.muted}>{CAMERA_VIEW[angle].label} · ~{distance} m · {athlete.dominant_arm === 'left' ? 'left' : 'right'}-arm. A few seconds around the delivery is enough.</Text>

      {video ? (
        <Card style={{ padding: sp(1.5) }}>
          <View style={s.videoBox}><Preview uri={video.uri} /></View>
          <View style={s.tiles}>
            <MetricTile label="Length" value={secs != null ? secs.toFixed(1) : '–'} unit={secs != null ? 's' : undefined} icon="time-outline"
              hint={secs != null && secs > 15 ? 'Long clip: processing takes longer' : undefined} />
            <MetricTile label="From" value={video.source === 'camera' ? 'Camera' : 'Gallery'} icon={video.source === 'camera' ? 'videocam-outline' : 'images-outline'} />
          </View>
          <Text style={s.caption} numberOfLines={1}>{video.name}</Text>
        </Card>
      ) : (
        <EmptyState icon="film" tint={C1} title="No video yet" text="Record the delivery now, or choose one you filmed earlier." />
      )}

      <View style={s.row}>
        <View style={{ flex: 1 }}><SecondaryButton title={video ? 'Record again' : 'Record'} icon="videocam" tint={C1} onPress={record} /></View>
        <View style={{ flex: 1 }}><SecondaryButton title={video ? 'Choose another' : 'Gallery'} icon="images" tint={C1} onPress={pick} /></View>
      </View>
      {err && <ErrorBanner title="Camera" message={err} />}

      <PrimaryButton title="Analyse delivery" icon="sparkles" disabled={!video}
        onPress={() => { run(); router.push('/analyse/run'); }} />
      <Text style={s.caption}>The video is sent to the team computer only. It is saved as {athlete.bowler_id}'s delivery.</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { ...font.title, color: color.text },
  muted: { ...font.body, color: color.muted },
  caption: { ...font.caption, color: color.muted, textAlign: 'center' },
  videoBox: { borderRadius: radius.button, overflow: 'hidden', backgroundColor: '#000' },
  video: { width: '100%', aspectRatio: 16 / 9, maxHeight: 420 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1), marginTop: sp(1) },
  row: { flexDirection: 'row', gap: sp(1.5) },
});
