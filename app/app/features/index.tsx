// C2 Joint angles (owner: Samarasinghe S.A.T.M.).
// Data:  /features?run_id=abc123  -> C1 keypoints of that Capture run -> POST /features/compute
//        no run_id                -> "Try demo delivery" -> GET /features/demo (synthetic, labelled)
// Shows: summary tiles, BFC / FFC / release frames, one card per joint angle with its limit.
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { c2 } from '../../src/api/c2';
import type { C1Keypoints, Events, FeatureRow, Thresholds } from '../../src/c2/types';
import { SendToC4 } from '../../src/c2/SendToC4';
import { EventsCard, FEATURE_ORDER, FeatureCard } from '../../src/c2/ui';
import { Banner, Body, Button, Card, Field, H, Loading, Row, Screen, Tile } from '../../src/c4/ui';

type Source = 'capture' | 'demo';

/** Text box -> frame number (empty or not a number -> undefined = let C2 find it). */
const toFrame = (txt: string) => (/^\d+$/.test(txt.trim()) ? Number(txt.trim()) : undefined);

export default function Features() {
  const { run_id: runId } = useLocalSearchParams<{ run_id?: string }>();

  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [row, setRow] = useState<FeatureRow | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  // C1 keypoints of the current run, kept so frames can be re-entered without downloading them again.
  const [keypoints, setKeypoints] = useState<{ runId: string; data: C1Keypoints } | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // loading text, null = idle
  const [error, setError] = useState<string | null>(null);
  const [frames, setFrames] = useState({ bfc: '', ffc: '', release: '' });
  const [showNotes, setShowNotes] = useState(false);
  const [showFrames, setShowFrames] = useState(false); // frame boxes are hidden unless the user wants to correct them

  // Limits + meanings: loaded once. Not fatal if it fails (the cards still show value and limit).
  useEffect(() => {
    c2.thresholds().then(setThresholds).catch(() => setThresholds(null));
  }, []);

  /** Run C2 on a Capture run (C1 keypoints), optionally with hand-typed event frames. */
  const analyseRun = useCallback(async (id: string, events?: Events) => {
    setError(null);
    try {
      let kp = keypoints?.runId === id ? keypoints.data : null;
      if (!kp) {
        setBusy('Getting the keypoints from Capture (C1)…');
        kp = await c2.c1Keypoints(id);
        setKeypoints({ runId: id, data: kp });
      }
      setBusy('Computing joint angles…');
      setRow(await c2.compute(kp, events));
      setSource('capture');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [keypoints]);

  async function runDemo() {
    setError(null);
    setBusy('Computing the demo delivery…');
    try {
      setRow(await c2.demo());
      setSource('demo');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Opened from Capture with a run id -> analyse it straight away.
  useEffect(() => {
    setRow(null);
    setFrames({ bfc: '', ffc: '', release: '' });
    setShowFrames(false);
    if (runId) analyseRun(runId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const reliable = row ? FEATURE_ORDER.filter((n) => row.features[n]?.reliable).length : 0;
  const confirmedBreaches = row ? FEATURE_ORDER.filter((n) => row.features[n]?.breach && row.features[n]?.reliable).length : 0;
  const uncheckedBreaches = row ? row.n_breaches - confirmedBreaches : 0;

  return (
    <Screen>
      <Card>
        <Body>Joint angles of one delivery at back-foot contact, front-foot contact and ball release, compared with published injury-risk limits.</Body>
      </Card>

      {!runId && (
        <Card>
          <Body muted>Process a video in the Capture tab to analyse a real delivery. Until then you can try a synthetic one.</Body>
          <Button title="Try demo delivery" icon="flask-outline" onPress={runDemo} loading={busy !== null} />
        </Card>
      )}

      {busy && <Loading text={busy} />}
      {error && (
        <Banner tone="danger" icon="alert-circle-outline" title="Could not compute the joint angles">
          <Body>{error}</Body>
        </Banner>
      )}

      {row && !busy && (
        <>
          {row.synthetic ? (
            <Banner tone="info" icon="flask-outline" title="SYNTHETIC DATA · not a real bowler">
              <Body muted>A made-up delivery with known angles, used to check the app and the maths.</Body>
            </Banner>
          ) : (
            <H>{row.video_id}{row.view ? ` · ${row.view.replace('_', '-')} view` : ''} · {Math.round(row.fps)} fps</H>
          )}

          <Row>
            <Tile label="Breaches" value={String(confirmedBreaches)} tone={confirmedBreaches ? 'danger' : 'ok'} />
            <Tile label="Reliable angles" value={`${reliable} / ${FEATURE_ORDER.length}`} tone={reliable ? 'neutral' : 'danger'} />
          </Row>
          {uncheckedBreaches > 0 && (
            <Banner tone="warn" icon="eye-off-outline" title={`${uncheckedBreaches} more over the limit, not confirmed`}>
              <Body muted>Measured from a camera view that cannot see that angle reliably. Check on video before acting.</Body>
            </Banner>
          )}

          <H>Delivery events</H>
          <EventsCard events={row.events} method={row.event_method} fps={row.fps} />

          {source === 'capture' && runId && (
            <>
              <Button title={showFrames ? 'Hide event frames' : 'Correct event frames (optional)'} icon="create-outline"
                variant="secondary" onPress={() => setShowFrames(!showFrames)} />
              {showFrames && (
                <Card>
                  <Body muted>Only if an event above is wrong: type the right frame from the video and recompute. Leave a box empty to keep the automatic frame.</Body>
                  <Row>
                    <Field half label="BFC frame" placeholder={String(row.events.bfc_frame ?? '')} keyboardType="number-pad" value={frames.bfc} onChangeText={(t) => setFrames({ ...frames, bfc: t })} />
                    <Field half label="FFC frame" placeholder={String(row.events.ffc_frame ?? '')} keyboardType="number-pad" value={frames.ffc} onChangeText={(t) => setFrames({ ...frames, ffc: t })} />
                    <Field half label="Release frame" placeholder={String(row.events.release_frame ?? '')} keyboardType="number-pad" value={frames.release} onChangeText={(t) => setFrames({ ...frames, release: t })} />
                  </Row>
                  <Button title="Recompute with these frames" icon="refresh-outline" variant="secondary"
                    onPress={() => analyseRun(runId, { bfc_frame: toFrame(frames.bfc), ffc_frame: toFrame(frames.ffc), release_frame: toFrame(frames.release) })} />
                </Card>
              )}
            </>
          )}

          <H>Joint angles</H>
          {FEATURE_ORDER.filter((n) => row.features[n]).map((n) => (
            <FeatureCard key={n} name={n} f={row.features[n]} info={thresholds?.[n]} trueValue={row.true_values?.[n]} />
          ))}

          <H>Send to Risk & Plan</H>
          <SendToC4 row={row} />

          {row.warnings.length > 0 && (
            <>
              <Button title={showNotes ? 'Hide technical notes' : `Technical notes (${row.warnings.length})`}
                icon="document-text-outline" variant="secondary" onPress={() => setShowNotes(!showNotes)} />
              {showNotes && <Card>{row.warnings.map((w, i) => <Body key={i} muted>• {w}</Body>)}</Card>}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
