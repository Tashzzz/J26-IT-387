// C2 -> C3/C4 hand-off: save this delivery's feature row in C4's inbox for one athlete.
// C3 reads the rows from there when it assesses the bowler, so without this C3 sees "0 deliveries".
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { c2 } from '../api/c2';
import { Banner, Body, Button, Card, Chips } from '../c4/ui';
import type { AthleteRef, FeatureRow } from './types';

/** C2 uses "unknown" when the video name has no anonymised code (B01, B02 ...). */
const hasCode = (id: string | null | undefined): id is string => !!id && id !== 'unknown';

export function SendToC4({ row }: { row: FeatureRow }) {
  const router = useRouter();
  const [athletes, setAthletes] = useState<AthleteRef[] | null>(null);
  const [athleteId, setAthleteId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ code: string; deliveries: number } | null>(null);

  // Load the athletes once; pick the one whose code matches the video (e.g. B03_D04... -> B03).
  useEffect(() => {
    c2.athletes()
      .then((list) => {
        setAthletes(list);
        const match = list.find((a) => a.bowler_id === row.bowler_id);
        setAthleteId(match ? match.id : null);
      })
      .catch((e) => setError((e as Error).message));
  }, [row.bowler_id]);

  // A new result replaces the old "sent" message.
  useEffect(() => setSent(null), [row]);

  if (row.synthetic) {
    return <Body muted>Demo data is not sent to Risk (C3) or Plan (C4): it is not a real bowler.</Body>;
  }

  const athlete = athletes?.find((a) => a.id === athleteId) ?? null;
  // C4 rejects a row whose bowler code differs from the athlete's, so check it here first.
  const mismatch = athlete && hasCode(row.bowler_id) && row.bowler_id !== athlete.bowler_id;

  async function send() {
    if (!athlete) return;
    setBusy(true);
    setError(null);
    try {
      // A video without a code (e.g. from Capture) belongs to the athlete the coach chose.
      const res = await c2.sendToC4(athlete.id, { ...row, bowler_id: athlete.bowler_id });
      setSent({ code: athlete.bowler_id, ...res });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Body>Save these angles for the bowler, so the Risk tab (C3) and the prevention plan (C4) can use them.</Body>
      {athletes && athletes.length === 0 && <Body muted>No athletes yet. Add the bowler in Plan → Profile first.</Body>}
      {athletes && athletes.length > 0 && (
        <Chips label={hasCode(row.bowler_id) ? `Bowler (video code ${row.bowler_id})` : 'Which bowler is this?'}
          value={athleteId} onChange={setAthleteId}
          options={athletes.map((a) => ({ label: a.bowler_id, value: a.id }))} />
      )}
      {athletes && hasCode(row.bowler_id) && !athletes.some((a) => a.bowler_id === row.bowler_id) && (
        <Body muted>No athlete with code {row.bowler_id} yet. Add {row.bowler_id} in Plan → Profile & inputs, then come back.</Body>
      )}
      {mismatch && (
        <Banner tone="warn" icon="person-outline" title="Different bowler">
          <Body muted>This video is from {row.bowler_id}, not {athlete.bowler_id}. C4 only accepts a delivery for the same bowler code.</Body>
        </Banner>
      )}
      <Button title="Send to Risk & Plan (C3/C4)" icon="send-outline" onPress={send} loading={busy}
        disabled={!athlete || !!mismatch} />
      {error && (
        <Banner tone="danger" icon="alert-circle-outline" title="Could not send">
          <Body>{error}</Body>
        </Banner>
      )}
      {sent && (
        <Banner tone="info" icon="checkmark-circle-outline" title={`Saved for ${sent.code}`}>
          <Body muted>{sent.deliveries} {sent.deliveries === 1 ? 'delivery' : 'deliveries'} stored for this bowler. Open the Risk tab to assess.</Body>
          <Button title="Open Risk (C3)" icon="pulse-outline" variant="secondary" onPress={() => router.push('/risk')} />
        </Banner>
      )}
    </Card>
  );
}
