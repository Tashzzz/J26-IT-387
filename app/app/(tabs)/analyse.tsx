// Analyse a delivery - one guided flow for the whole video pipeline:
//   1 Video  ->  2 Camera set-up  ->  3 Processing (pose keypoints, then joint angles)  ->  4 Results
// "Save & check injury risk" stores the angles for the current bowler, runs the risk model and
// updates the prevention plan in one step, then opens the risk report.
// Pose estimation: C1 (src/api/c1.ts) · joint angles: C2 (src/api/c2.ts, src/c2/ui.tsx).
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { c1, type PickedVideo } from '../../src/api/c1';
import { c2 } from '../../src/api/c2';
import { c3 } from '../../src/api/risk';
import type { CameraAngle, CameraDistance, ProcessResult } from '../../src/c1/types';
import type { C1Keypoints, Events, FeatureRow, Thresholds } from '../../src/c2/types';
import { EventsCard, FEATURE_LABEL, FEATURE_ORDER, FeatureCard } from '../../src/c2/ui';
import { useApp } from '../../src/state/AppContext';
import {
  Banner, Body, Button, Card, Chips, EmptyState, Field, OptionCard, ProgressBar, Row, Screen, Section, Segmented, Small, Stepper,
} from '../../src/ui/components';
import { colors, radius, type as t } from '../../src/ui/theme';

type Step = 'video' | 'setup' | 'processing' | 'results';
const STEPS = ['Video', 'Camera', 'Analyse', 'Results'];
const STEP_INDEX: Record<Step, number> = { video: 0, setup: 1, processing: 2, results: 3 };

// Below this share of frames the joint angles have many gaps.
const LOW_DETECTION = 0.5;

const ANGLES: { value: CameraAngle; title: string; text: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'side', title: 'Side-on', text: 'Square to the pitch, bowler runs across the frame', icon: 'swap-horizontal-outline' },
  { value: 'semi_side', title: 'Diagonal', text: 'About 45° between side-on and front-on', icon: 'trending-up-outline' },
  { value: 'front', title: 'Front-on', text: 'Ball comes towards the camera', icon: 'arrow-down-outline' },
  { value: 'rear', title: 'Behind', text: 'From behind the run-up, ball goes away', icon: 'arrow-up-outline' },
];

const toFrame = (txt: string) => (/^\d+$/.test(txt.trim()) ? Number(txt.trim()) : undefined);
const hasCode = (id: string | null | undefined): id is string => !!id && id !== 'unknown';

export default function Analyse() {
  const router = useRouter();
  const { athlete, athletes, selectAthlete, generatePlan } = useApp();

  const [step, setStep] = useState<Step>('video');
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [arm, setArm] = useState<'right' | 'left'>(athlete?.dominant_arm ?? 'right');
  const [angle, setAngle] = useState<CameraAngle | null>(null);
  const [distance, setDistance] = useState<CameraDistance | null>(null);

  const [phase, setPhase] = useState<'pose' | 'angles'>('pose');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [pose, setPose] = useState<ProcessResult | null>(null);
  const [keypoints, setKeypoints] = useState<C1Keypoints | null>(null);
  const [row, setRow] = useState<FeatureRow | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);

  const [saving, setSaving] = useState<null | 'save' | 'risk' | 'plan'>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => { c2.thresholds().then(setThresholds).catch(() => setThresholds(null)); }, []);
  useEffect(() => { if (athlete) setArm(athlete.dominant_arm); }, [athlete]);

  // Elapsed-time counter while the server works (pose estimation takes 1-2 minutes on a laptop).
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (step !== 'processing') return;
    setElapsed(0);
    timer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [step]);

  function reset() {
    setStep('video'); setVideo(null); setAngle(null); setDistance(null);
    setPose(null); setKeypoints(null); setRow(null); setError(null); setSaveError(null);
  }

  async function choose(source: 'camera' | 'library') {
    setError(null);
    let res: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setError('Camera permission is needed to record. You can also choose a video from your gallery.'); return; }
      res = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoMaxDuration: 20 });
    } else {
      res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsEditing: false });
    }
    if (res.canceled || !res.assets.length) return;
    const a = res.assets[0];
    const name = a.fileName ?? `video.${a.mimeType?.includes('quicktime') ? 'mov' : 'mp4'}`;
    setVideo({ uri: a.uri, name, mimeType: a.mimeType ?? 'video/mp4', file: a.file ?? undefined });
    setStep('setup');
  }

  async function analyse() {
    if (!video) return;
    setError(null);
    setStep('processing');
    try {
      setPhase('pose');
      const p = await c1.process(video, arm, angle ?? undefined, distance ?? undefined);
      setPose(p);
      setPhase('angles');
      const kp = await c2.c1Keypoints(p.run_id);
      setKeypoints(kp);
      setRow(await c2.compute(kp));
      setStep('results');
    } catch (e) {
      setError((e as Error).message);
      setStep('setup');
    }
  }

  async function sample() {
    setError(null);
    setPose(null);
    setStep('processing');
    setPhase('angles');
    try {
      setRow(await c2.demo());
      setStep('results');
    } catch (e) {
      setError((e as Error).message);
      setStep('video');
    }
  }

  async function recompute(events: Events) {
    if (!keypoints) return;
    setError(null);
    try { setRow(await c2.compute(keypoints, events)); } catch (e) { setError((e as Error).message); }
  }

  async function saveAndAssess() {
    if (!athlete || !row) return;
    setSaveError(null);
    try {
      setSaving('save');
      // A video without a bowler code belongs to the bowler being analysed.
      await c2.sendToC4(athlete.id, { ...row, bowler_id: athlete.bowler_id });
      setSaving('risk');
      let riskOk = true;
      try { await c3.assess(athlete.id); } catch { riskOk = false; } // the plan still works from guidelines
      setSaving('plan');
      await generatePlan();
      reset();
      router.push(riskOk ? '/risk' : '/plan');
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  if (!athlete) {
    return (
      <Screen title="Analyse">
        <EmptyState icon="person-add-outline" title="Set up a bowler first" text="Videos are saved to a bowler’s profile."
          action="Create bowler profile" onAction={() => router.push({ pathname: '/bowler', params: { mode: 'new' } })} />
      </Screen>
    );
  }

  const otherBowler = row && !row.synthetic && hasCode(row.bowler_id) && row.bowler_id !== athlete.bowler_id ? row.bowler_id : null;
  const otherAthlete = otherBowler ? athletes.find((a) => a.bowler_id === otherBowler) : undefined;

  const footer =
    step === 'setup' ? (
      <Button title="Analyse delivery" icon="scan-outline" onPress={analyse} />
    ) : step === 'results' && row ? (
      row.synthetic ? (
        <Button title="Analyse a real video" icon="videocam-outline" onPress={reset} />
      ) : (
        <Button title={saving === 'save' ? 'Saving the delivery…' : saving === 'risk' ? 'Checking injury risk…' : saving === 'plan' ? 'Updating the plan…' : `Save & check ${athlete.bowler_id}’s injury risk`}
          icon="pulse-outline" onPress={saveAndAssess} loading={!!saving} disabled={!!otherBowler} />
      )
    ) : undefined;

  return (
    <Screen title="Analyse" subtitle={`Delivery check for ${athlete.bowler_id}`} footer={footer}>
      <Stepper steps={STEPS} current={STEP_INDEX[step]} />

      {/* ---------------- 1. video ---------------- */}
      {step === 'video' && (
        <>
          <View style={{ gap: 10 }}>
            {Platform.OS !== 'web' && (
              <OptionCard icon="videocam" title="Record a delivery" text="Film one ball now with the phone camera" onPress={() => choose('camera')} />
            )}
            <OptionCard icon="images-outline" title="Choose from gallery" text="MP4 or MOV, a few seconds around the delivery" onPress={() => choose('library')} />
          </View>
          {error && <Banner tone="danger" icon="alert-circle-outline" title="Something went wrong"><Body muted>{error}</Body></Banner>}

          <Section title="Filming tips">
            <Card>
              <Tip icon="person-outline" text="Only the bowler in the frame — other players can be tracked by mistake." />
              <Tip icon="resize-outline" text="Side-on, about 4–5 m away, whole body visible from run-up to follow-through." />
              <Tip icon="sunny-outline" text="Good light, phone held still (a tripod helps)." />
              <Tip icon="speedometer-outline" text="Use 60 fps slow-motion if the phone has it — angles are more accurate." />
              <Button title="Camera setup guide" variant="ghost" icon="book-outline" size="sm" onPress={() => router.push('/reliability')} />
            </Card>
          </Section>

          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={sample} accessibilityLabel="Try with a sample delivery">
            <View style={s.sampleIcon}><Ionicons name="flask-outline" size={20} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.sampleTitle}>No video yet?</Text>
              <Small>See how results look with a sample delivery (not saved).</Small>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Card>
        </>
      )}

      {/* ---------------- 2. camera set-up ---------------- */}
      {step === 'setup' && video && (
        <>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={s.sampleIcon}><Ionicons name="film-outline" size={20} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.sampleTitle} numberOfLines={1}>{video.name}</Text>
              <Small>Ready to analyse</Small>
            </View>
            <Button title="Change" variant="ghost" size="sm" onPress={() => setStep('video')} />
          </Card>

          {error && <Banner tone="danger" icon="alert-circle-outline" title="Could not analyse this video"><Body muted>{error}</Body></Banner>}

          <Section title="Bowling arm">
            <Segmented value={arm} onChange={setArm} options={[{ label: 'Right-arm', value: 'right' }, { label: 'Left-arm', value: 'left' }]} />
          </Section>

          <Section title="Where was the camera?">
            <Small>Helps CricShield decide which angles it can measure reliably. Optional.</Small>
            <View style={{ gap: 8 }}>
              {ANGLES.map((a) => (
                <OptionCard key={a.value} icon={a.icon} title={a.title} text={a.text} selected={angle === a.value}
                  onPress={() => setAngle(angle === a.value ? null : a.value)} />
              ))}
            </View>
          </Section>

          <Section title="Distance from the bowler">
            <Chips value={distance} onChange={(d) => setDistance(distance === d ? null : d)}
              options={[{ label: '4 m', value: 4 }, { label: '5 m', value: 5 }, { label: '6 m', value: 6 }, { label: '10 m', value: 10 }]}
              hint="Optional. Tap again to clear." />
          </Section>
        </>
      )}

      {/* ---------------- 3. processing ---------------- */}
      {step === 'processing' && (
        <Card style={{ paddingVertical: 28, alignItems: 'center', gap: 14 }}>
          <View style={s.procIcon}><Ionicons name="scan" size={32} color={colors.primary} /></View>
          <Text style={[t.heading, { textAlign: 'center' }]}>{phase === 'pose' ? 'Tracking the bowling action' : 'Measuring joint angles'}</Text>
          <Body muted style={{ textAlign: 'center' }}>
            {phase === 'pose' ? 'Finding 33 body points in every frame. This usually takes 1–2 minutes — keep the app open.' : 'Finding back-foot contact, front-foot contact and ball release.'}
          </Body>
          <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 6 }}>
            <Phase label="Upload video" state={pose || phase === 'angles' ? 'done' : 'active'} hidden={!video} />
            <Phase label="Track body keypoints" state={pose || phase === 'angles' ? 'done' : 'active'} hidden={!video} />
            <Phase label="Measure joint angles" state={phase === 'angles' ? 'active' : 'todo'} />
          </View>
          {phase === 'pose' && <><ProgressBar value={Math.min(0.95, elapsed / 120)} /><Small>{elapsed} s</Small></>}
        </Card>
      )}

      {/* ---------------- 4. results ---------------- */}
      {step === 'results' && row && (
        <Results row={row} pose={pose} thresholds={thresholds} error={error}
          canCorrect={!!keypoints} onRecompute={recompute} onRestart={reset} />
      )}

      {step === 'results' && otherBowler && (
        <Banner tone="warn" icon="person-outline" title={`This video looks like ${otherBowler}`}
          action={otherAthlete ? `Switch to ${otherBowler}` : undefined} onAction={otherAthlete ? () => selectAthlete(otherAthlete.id) : undefined}>
          <Body muted>The file name has the code {otherBowler}, but you are analysing {athlete.bowler_id}. Switch bowler, or rename the file, so deliveries are not mixed up.</Body>
        </Banner>
      )}
      {saveError && <Banner tone="danger" icon="alert-circle-outline" title="Could not save"><Body muted>{saveError}</Body></Banner>}
    </Screen>
  );
}

// ---------------------------------------------------------------- results

function Results({ row, pose, thresholds, error, canCorrect, onRecompute, onRestart }: {
  row: FeatureRow; pose: ProcessResult | null; thresholds: Thresholds | null; error: string | null;
  canCorrect: boolean; onRecompute: (e: Events) => void; onRestart: () => void;
}) {
  const router = useRouter();
  const [showMoments, setShowMoments] = useState(false);
  const [frames, setFrames] = useState({ bfc: '', ffc: '', release: '' });
  const [showNotes, setShowNotes] = useState(false);

  const names = FEATURE_ORDER.filter((n) => row.features[n]);
  const red = names.filter((n) => row.features[n].breach && row.features[n].reliable);
  const amber = names.filter((n) => row.features[n].level === 'amber' && row.features[n].reliable);
  const lowVis = names.filter((n) => row.features[n].breach && !row.features[n].reliable);
  const reliable = names.filter((n) => row.features[n].reliable).length;

  const verdict = red.length
    ? { tone: 'danger' as const, icon: 'alert-circle' as const, title: `${red.length} ${red.length === 1 ? 'angle is' : 'angles are'} over the risk limit`, text: red.map((n) => FEATURE_LABEL[n]).join(', ') }
    : amber.length
      ? { tone: 'warn' as const, icon: 'warning' as const, title: `${amber.length} ${amber.length === 1 ? 'angle is' : 'angles are'} close to the limit`, text: amber.map((n) => FEATURE_LABEL[n]).join(', ') }
      : { tone: 'ok' as const, icon: 'checkmark-circle' as const, title: 'Action looks within the limits', text: `${reliable} of ${names.length} angles could be measured reliably from this video.` };

  return (
    <>
      {row.synthetic && (
        <Banner tone="info" icon="flask-outline" title="Sample delivery — not a real bowler">
          <Body muted>Made-up angles to show how results look. It is not saved.</Body>
        </Banner>
      )}

      {pose && <OverlayVideo url={c1.fileUrl(pose.overlay_url)} />}

      <View style={[s.verdict, { backgroundColor: verdict.tone === 'danger' ? colors.dangerSoft : verdict.tone === 'warn' ? colors.warnSoft : colors.okSoft }]}>
        <Ionicons name={verdict.icon} size={28} color={verdict.tone === 'danger' ? colors.danger : verdict.tone === 'warn' ? colors.warn : colors.ok} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.verdictTitle, { color: verdict.tone === 'danger' ? colors.danger : verdict.tone === 'warn' ? colors.warn : colors.ok }]}>{verdict.title}</Text>
          <Text style={t.small}>{verdict.text}</Text>
        </View>
      </View>

      {lowVis.length > 0 && (
        <Banner tone="warn" icon="eye-off-outline" title={`${lowVis.length} more may be over the limit`}>
          <Body muted>{lowVis.map((n) => FEATURE_LABEL[n]).join(', ')} — this camera view cannot see {lowVis.length === 1 ? 'it' : 'them'} clearly. Re-film from the suggested angle to confirm.</Body>
        </Banner>
      )}

      {pose && <VideoQuality pose={pose} />}

      <Section title="Joint angles">
        {names.map((n) => (
          <FeatureCard key={n} name={n} f={row.features[n]} info={thresholds?.[n]} trueValue={row.true_values?.[n]} />
        ))}
      </Section>

      {red.length > 0 && (
        <Card>
          <Text style={t.heading}>What to do about a red angle</Text>
          <Numbered n={1} text="Today: lower the bowling intensity and avoid long spells." />
          <Numbered n={2} text="Coaching: work on hip–shoulder alignment with technique drills." />
          <Numbered n={3} text="Red again in 2 or more sessions: refer to a sports physiotherapist for a lower-back check." />
        </Card>
      )}

      <Banner tone="info" icon="information-circle-outline" title="Screening, not a diagnosis">
        <Body muted>Red means the angle is like bowlers who got injured in published studies. Judge an over (4–6 balls), not one ball — a warning that repeats matters.</Body>
      </Banner>

      {/* delivery moments + optional manual correction */}
      <Card>
        <Pressable onPress={() => setShowMoments(!showMoments)} accessibilityRole="button" accessibilityState={{ expanded: showMoments }} style={s.expand}>
          <View style={{ flex: 1 }}>
            <Text style={s.sampleTitle}>Delivery moments</Text>
            <Small>When the angles were measured</Small>
          </View>
          <Ionicons name={showMoments ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
        </Pressable>
        {showMoments && (
          <>
            <EventsCard events={row.events} method={row.event_method} fps={row.fps} />
            {canCorrect && (
              <>
                <Small>If a moment is wrong, type the right frame number from the video and recompute. Leave a box empty to keep it.</Small>
                <Row>
                  <Field half label="Back-foot" placeholder={String(row.events.bfc_frame ?? '')} keyboardType="number-pad" value={frames.bfc} onChangeText={(v) => setFrames({ ...frames, bfc: v })} />
                  <Field half label="Front-foot" placeholder={String(row.events.ffc_frame ?? '')} keyboardType="number-pad" value={frames.ffc} onChangeText={(v) => setFrames({ ...frames, ffc: v })} />
                  <Field half label="Release" placeholder={String(row.events.release_frame ?? '')} keyboardType="number-pad" value={frames.release} onChangeText={(v) => setFrames({ ...frames, release: v })} />
                </Row>
                <Button title="Recompute angles" icon="refresh-outline" variant="secondary"
                  onPress={() => onRecompute({ bfc_frame: toFrame(frames.bfc), ffc_frame: toFrame(frames.ffc), release_frame: toFrame(frames.release) })} />
              </>
            )}
            {error && <Banner tone="danger" icon="alert-circle-outline" title="Could not recompute"><Body muted>{error}</Body></Banner>}
          </>
        )}
      </Card>

      {row.warnings.length > 0 && (
        <>
          <Button title={showNotes ? 'Hide technical notes' : `Technical notes (${row.warnings.length})`} icon="document-text-outline" variant="ghost" size="sm" onPress={() => setShowNotes(!showNotes)} />
          {showNotes && <Card>{row.warnings.map((w, i) => <Small key={i}>• {w}</Small>)}</Card>}
        </>
      )}

      {!row.synthetic && <Button title="Discard and analyse another" variant="ghost" icon="refresh" onPress={onRestart} />}
      {row.synthetic && <Button title="Camera setup guide" variant="ghost" icon="book-outline" onPress={() => router.push('/reliability')} />}
    </>
  );
}

function OverlayVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.loop = true; p.muted = true; p.play(); });
  return (
    <View style={s.videoWrap}>
      <VideoView player={player} nativeControls contentFit="contain" style={s.video} />
    </View>
  );
}

function VideoQuality({ pose }: { pose: ProcessResult }) {
  const router = useRouter();
  const rate = pose.detection_rate;
  const r = pose.reliability;
  const good = rate >= LOW_DETECTION;
  return (
    <Card>
      <View style={s.expand}>
        <View style={{ flex: 1 }}>
          <Text style={s.sampleTitle}>Video quality</Text>
          <Small>{pose.frames} frames · processed in {pose.processing_seconds} s</Small>
        </View>
        <View style={[s.qBadge, { backgroundColor: good ? colors.okSoft : colors.warnSoft }]}>
          <Text style={{ color: good ? colors.ok : colors.warn, fontWeight: '800' }}>{Math.round(rate * 100)}%</Text>
        </View>
      </View>
      <Small>Bowler tracked in {Math.round(rate * 100)}% of frames{good ? '.' : ' — film closer or in better light for more reliable angles.'}</Small>
      {r?.setup_matched ? (
        <View style={{ gap: 4 }}>
          {r.reliable_regions.length > 0 && <QualityLine ok text={`Reliable from this camera: ${r.reliable_regions.join(', ')}`} />}
          {r.less_reliable_regions.length > 0 && <QualityLine text={`Less reliable: ${r.less_reliable_regions.join(', ')}`} />}
        </View>
      ) : (
        <Small>No reliability study for this camera position yet — tell us where the camera was for a better check.</Small>
      )}
      <Button title="Camera setup guide" variant="ghost" size="sm" icon="book-outline" onPress={() => router.push('/reliability')} />
    </Card>
  );
}

function QualityLine({ ok, text }: { ok?: boolean; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={16} color={ok ? colors.ok : colors.warn} style={{ marginTop: 1 }} />
      <Text style={[t.small, { flex: 1, color: colors.textSoft }]}>{text}</Text>
    </View>
  );
}

function Phase({ label, state, hidden }: { label: string; state: 'done' | 'active' | 'todo'; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name={state === 'done' ? 'checkmark-circle' : state === 'active' ? 'ellipse' : 'ellipse-outline'} size={20}
        color={state === 'done' ? colors.ok : state === 'active' ? colors.primary : colors.borderStrong} />
      <Text style={{ color: state === 'todo' ? colors.muted : colors.text, fontWeight: state === 'active' ? '700' : '500', fontSize: 15 }}>{label}</Text>
    </View>
  );
}

function Tip({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={18} color={colors.primary} style={{ marginTop: 2 }} />
      <Text style={[t.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

function Numbered({ n, text }: { n: number; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={s.num}><Text style={s.numText}>{n}</Text></View>
      <Text style={[t.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  sampleIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sampleTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  procIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.lg, padding: 16 },
  verdictTitle: { fontSize: 17, fontWeight: '800' },
  videoWrap: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  video: { width: '100%', aspectRatio: 9 / 16, maxHeight: 480 },
  expand: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  qBadge: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  num: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  numText: { color: colors.danger, fontWeight: '800', fontSize: 13 },
});
