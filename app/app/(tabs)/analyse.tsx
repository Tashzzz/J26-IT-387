// C1 Capture (owner: Nethmi): pick a bowling video -> choose arm -> upload -> skeleton overlay + detection rate.
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';

import { c1, type PickedVideo } from '../../src/api/c1';
import type { BowlingArm, CameraAngle, CameraDistance, ProcessResult, ReliabilitySummary } from '../../src/c1/types';
import { Banner, Body, Button, Card, Chips, H, Row, Screen, Tile } from '../../src/c4/ui';

// Below this share of frames, joint angles downstream (C2) have many gaps.
const LOW_DETECTION = 0.5;

export default function Capture() {
  const router = useRouter();
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [arm, setArm] = useState<BowlingArm | null>(null);
  const [angle, setAngle] = useState<CameraAngle | null>(null);
  const [distance, setDistance] = useState<CameraDistance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsEditing: false });
    if (res.canceled || !res.assets.length) return;
    const a = res.assets[0];
    const name = a.fileName ?? `video.${a.mimeType?.includes('quicktime') ? 'mov' : 'mp4'}`;
    setVideo({ uri: a.uri, name, mimeType: a.mimeType ?? 'video/mp4', file: a.file ?? undefined });
    setResult(null);
    setError(null);
  }

  async function process() {
    if (!video || !arm) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await c1.process(video, arm, angle ?? undefined, distance ?? undefined));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Body>Upload a video of one delivery. CricShield finds 33 body keypoints in every frame and draws the skeleton on top.</Body>
      </Card>

      <Banner tone="info" icon="person-outline" title="Only the bowler in the frame">
        <Body muted>Other players or the umpire can be tracked instead of the bowler. Film from the side or semi-side, about 5 m away, in good light.</Body>
      </Banner>

      <H>1 · Video</H>
      <Card>
        <Body muted>{video ? video.name : 'No video chosen yet.'}</Body>
        <Button title={video ? 'Choose another video' : 'Choose video'} icon="film-outline" variant="secondary" onPress={pick} disabled={busy} />
      </Card>

      <H>2 · Bowler</H>
      <Card>
        <Chips label="Bowling arm (required)" value={arm} onChange={setArm}
          options={[{ label: 'Right arm', value: 'right' }, { label: 'Left arm', value: 'left' }]} />
        <Chips label="Camera angle (optional)" value={angle} onChange={setAngle}
          options={[{ label: 'Side', value: 'side' }, { label: 'Semi-side', value: 'semi_side' }, { label: 'Front', value: 'front' }]} />
        <Chips label="Camera distance (optional)" value={distance} onChange={setDistance}
          options={[{ label: '4 m', value: 4 }, { label: '5 m', value: 5 }, { label: '6 m', value: 6 }, { label: '10 m', value: 10 }]} />
      </Card>

      <Button title={busy ? 'Finding keypoints… (1–2 min)' : 'Process video'} icon="scan-outline"
        onPress={process} loading={busy} disabled={!video || !arm} />
      {!busy && (!video || !arm) && <Body muted>Choose a video and the bowling arm to continue.</Body>}

      {error && <Banner tone="danger" icon="alert-circle-outline" title="Could not process this video"><Body>{error}</Body></Banner>}

      {result && <ResultView result={result} />}
      {result && (
        <Button title="Analyse joint angles (C2)" icon="body-outline"
          onPress={() => router.push({ pathname: '/features', params: { run_id: result.run_id } })} />
      )}

      <Button title="How reliable are the keypoints?" icon="analytics-outline" variant="secondary"
        onPress={() => router.push('/reliability')} />
    </Screen>
  );
}

function ResultView({ result }: { result: ProcessResult }) {
  const player = useVideoPlayer(c1.fileUrl(result.overlay_url), (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  const rate = result.detection_rate;

  return (
    <>
      <H>Result · {result.clip_id}</H>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <VideoView player={player} nativeControls contentFit="contain" style={{ width: '100%', aspectRatio: 9 / 16, maxHeight: 520, backgroundColor: '#000' }} />
      </Card>
      <Row>
        <Tile label="Bowler found" value={`${Math.round(rate * 100)}%`} tone={rate >= LOW_DETECTION ? 'ok' : 'danger'} />
        <Tile label="Frames" value={String(result.frames)} />
        <Tile label="Arm" value={result.bowling_arm === 'right' ? 'Right' : 'Left'} />
        <Tile label="Pose time" value={`${result.processing_seconds} s`} />
      </Row>
      {rate < LOW_DETECTION && (
        <Banner tone="warn" icon="warning-outline" title="Bowler missing in many frames">
          <Body muted>Gaps of up to 5 frames are filled; longer gaps stay empty. Film closer or in better light for more reliable angles.</Body>
        </Banner>
      )}
      {result.reliability && <SetupReliability r={result.reliability} />}
    </>
  );
}

// Which body regions can be trusted for this camera setup (C1 ICC study). Keypoints are only tagged, never removed.
function SetupReliability({ r }: { r: ReliabilitySummary }) {
  if (!r.setup_matched) {
    return (
      <Card>
        <Body muted>No reliability study yet for this setup — keypoints passed on without a reliability check.</Body>
      </Card>
    );
  }
  const list = (regions: string[]) => (regions.length ? regions.join(', ') : 'none');
  return (
    <Card>
      <Body>
        Camera setup: {r.setup_matched} — reliable: {list(r.reliable_regions)} · less reliable: {list(r.less_reliable_regions)} (ICC &lt; {r.gate ?? 0.75})
      </Body>
      <Body muted>{r.usable} of {r.total} keypoints passed the reliability check.</Body>
    </Card>
  );
}
