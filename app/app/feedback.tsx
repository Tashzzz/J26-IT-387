// C4 FR11 - short coach / physiotherapist feedback form (usefulness score = KF2 metric).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { c4 } from '../../src/api/c4';
import { useC4 } from '../../src/c4/C4Context';
import type { FeedbackInput } from '../../src/c4/types';
import { Banner, Body, Button, Card, Chips, Field, Screen } from '../../src/c4/ui';

export default function FeedbackScreen() {
  const { ruleId } = useLocalSearchParams<{ ruleId?: string }>();
  const router = useRouter();
  const { plan } = useC4();
  const [f, setF] = useState<FeedbackInput>({ reviewer: '', role: 'coach', decision: 'accept', usefulness: 4, rule_id: ruleId ?? null, comment: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<FeedbackInput>) => setF((x) => ({ ...x, ...patch }));
  const rec = plan?.recommendations.find((r) => r.rule_id === ruleId);

  async function submit() {
    if (!plan?.id) return;
    setBusy(true);
    setMsg(null);
    try {
      await c4.addFeedback(plan.id, { ...f, modified_action: f.decision === 'modify' ? f.modified_action : null });
      setMsg({ ok: true, text: 'Feedback saved. It is stored with this plan for the validation study.' });
      setTimeout(() => router.back(), 900);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Body>{rec ? `Recommendation: ${rec.title}` : `Whole plan for ${plan?.bowler_id ?? ''}`}</Body>
        <Body muted>Your answer is used to refine the rules (design-science iteration).</Body>
      </Card>
      <Field label="Your name" value={f.reviewer} onChangeText={(t) => set({ reviewer: t })} placeholder="e.g. Coach Silva" />
      <Chips label="Role" value={f.role} onChange={(v) => set({ role: v })}
        options={[{ label: 'Coach', value: 'coach' }, { label: 'Physiotherapist', value: 'physiotherapist' }, { label: 'Sports scientist', value: 'sports_scientist' }]} />
      <Chips label="Decision" value={f.decision} onChange={(v) => set({ decision: v })}
        options={[{ label: 'Accept', value: 'accept' }, { label: 'Modify', value: 'modify' }, { label: 'Reject', value: 'reject' }]} />
      {f.decision === 'modify' && (
        <Field label="What should it say instead?" value={f.modified_action ?? ''} onChangeText={(t) => set({ modified_action: t })} multiline />
      )}
      <Chips label="How useful is this? (1 = not useful, 5 = very useful)" value={f.usefulness ?? null} onChange={(v) => set({ usefulness: v })}
        options={[1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: n }))} />
      <Field label="Comment (optional)" value={f.comment} onChangeText={(t) => set({ comment: t })} multiline />
      {msg && <Banner tone={msg.ok ? 'info' : 'danger'} icon={msg.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'} title={msg.ok ? 'Saved' : 'Could not save'}><Body muted>{msg.text}</Body></Banner>}
      <Button title="Submit feedback" icon="send-outline" onPress={submit} loading={busy} disabled={!plan?.id} />
    </Screen>
  );
}
