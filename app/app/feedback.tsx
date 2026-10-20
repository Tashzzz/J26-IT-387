// C4 FR11 - short coach / physiotherapist review of a plan or one action (usefulness score = KF2 metric).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { c4 } from '../src/api/c4';
import type { FeedbackInput } from '../src/c4/types';
import { useApp } from '../src/state/AppContext';
import { Banner, Body, Button, Card, Chips, EmptyState, Field, Screen, Segmented, Small } from '../src/ui/components';

export default function FeedbackScreen() {
  const { ruleId } = useLocalSearchParams<{ ruleId?: string }>();
  const router = useRouter();
  const { plan } = useApp();
  const [f, setF] = useState<FeedbackInput>({ reviewer: '', role: 'coach', decision: 'accept', usefulness: 4, rule_id: ruleId ?? null, comment: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<FeedbackInput>) => setF((x) => ({ ...x, ...patch }));
  const rec = plan?.recommendations.find((r) => r.rule_id === ruleId);

  if (!plan?.id) {
    return <Screen><EmptyState icon="clipboard-outline" title="No saved plan to review" text="Create or update the prevention plan first." action="Close" onAction={() => (router.canGoBack() ? router.back() : router.replace('/plan'))} /></Screen>;
  }

  async function submit() {
    if (!plan?.id) return;
    setBusy(true);
    setMsg(null);
    try {
      await c4.addFeedback(plan.id, { ...f, modified_action: f.decision === 'modify' ? f.modified_action : null });
      setMsg({ ok: true, text: 'Thank you — your review is saved with this plan.' });
      setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/plan')), 900);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen footer={<Button title="Submit review" icon="send-outline" onPress={submit} loading={busy} disabled={f.reviewer.trim().length < 2} />}>
      <Card>
        <Small>Reviewing</Small>
        <Body>{rec ? rec.title : `The whole plan for ${plan.bowler_id}`}</Body>
        <Small>Reviews from coaches and physiotherapists are used to improve the rules.</Small>
      </Card>
      <Field label="Your name" value={f.reviewer} onChangeText={(v) => set({ reviewer: v })} placeholder="e.g. Coach Silva" />
      <Chips label="Your role" value={f.role} onChange={(v) => set({ role: v })}
        options={[{ label: 'Coach', value: 'coach' }, { label: 'Physiotherapist', value: 'physiotherapist' }, { label: 'Sports scientist', value: 'sports_scientist' }]} />
      <Segmented label="Your decision" value={f.decision} onChange={(v) => set({ decision: v })}
        options={[{ label: 'Accept', value: 'accept' }, { label: 'Change', value: 'modify' }, { label: 'Reject', value: 'reject' }]} />
      {f.decision === 'modify' && (
        <Field label="What should it say instead?" value={f.modified_action ?? ''} onChangeText={(v) => set({ modified_action: v })} multiline />
      )}
      <Segmented label="How useful is it? (1 = not useful, 5 = very useful)" value={f.usefulness ?? null} onChange={(v) => set({ usefulness: v })}
        options={[1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: n }))} />
      <Field label="Comment (optional)" value={f.comment} onChangeText={(v) => set({ comment: v })} multiline />
      {msg && <Banner tone={msg.ok ? 'ok' : 'danger'} icon={msg.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'} title={msg.ok ? 'Saved' : 'Could not save'}><Body muted>{msg.text}</Body></Banner>}
    </Screen>
  );
}
