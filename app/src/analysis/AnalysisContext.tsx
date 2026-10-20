// One guided analysis: bowler -> camera setup -> video -> C1 > C2 > C3 > C4 -> results.
// Every backend call is the same call (and payload) the members' screens make:
//   C1 capture      c1.process(video, arm, angle, distance)
//   C2 features     c2.c1Keypoints(run_id) -> c2.compute(keypoints)
//   C2 SendToC4     c2.sendToC4(athlete.id, { ...row, bowler_id: athlete.bowler_id })
//   C3 risk         c3.assess(athleteId, { sendToC4: true })
//   C4 plan         c4.generatePlan(athleteId)
// Real data only: there is no demo path here.
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { c1, type PickedVideo } from '../api/c1';
import { c2 } from '../api/c2';
import { c4 } from '../api/c4';
import { c3 } from '../api/risk';
import type { CameraDistance, ProcessResult } from '../c1/types';
import type { FeatureRow } from '../c2/types';
import { FEATURE_ORDER } from '../c2/ui';
import type { Assessment } from '../c3/types';
import type { Athlete, PreventionPlan } from '../c4/types';
import { useApp } from '../shell/AppContext';
import { setItem } from '../shell/storage';
import { toRiskLevel, type CameraView, type ComponentKey, type StepState } from '../ui';

export type Video = PickedVideo & { durationMs: number | null; source: 'library' | 'camera' };

export type Results = {
  pose?: ProcessResult;
  row?: FeatureRow;
  sent?: { deliveries: number };
  risk?: Assessment;
  plan?: PreventionPlan;
};

type StepInfo = { state: StepState; text: string; startedAt?: number; endedAt?: number; error?: string };
const IDLE: Record<ComponentKey, StepInfo> = {
  c1: { state: 'pending', text: 'Find the bowler and 33 body points in every frame' },
  c2: { state: 'pending', text: 'Measure joint angles at foot contact and release' },
  c3: { state: 'pending', text: 'Combine technique, workload and history into a risk score' },
  c4: { state: 'pending', text: 'Turn the risk into this week’s plan' },
};
const ORDER: ComponentKey[] = ['c1', 'c2', 'c3', 'c4'];

/** C2 reads the bowler code from the start of the video name (B03_...); C4 rejects a row for another code. */
const hasCode = (id: string | null | undefined): id is string => !!id && id !== 'unknown';

/** Upload name: <code>_D<month><day>-<hhmm>_<angle>_<distance>m, like the study clips (B01_D01_side_5m). */
function uploadName(code: string, angle: CameraView, distance: number, original: string) {
  const ext = (original.match(/\.[A-Za-z0-9]+$/)?.[0] ?? '.mp4').toLowerCase();
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return `${code.replace(/[^A-Za-z0-9-]/g, '')}_D${stamp}_${angle}_${distance}m${ext}`;
}

type AnalysisState = {
  athlete: Athlete | null;
  angle: CameraView | null;
  distance: CameraDistance;
  video: Video | null;
  steps: Record<ComponentKey, StepInfo>;
  results: Results;
  running: boolean;
  startedAt: number | null;
  finished: boolean;
  failedStep: ComponentKey | null;
  begin: (a: Athlete) => void;
  setSetup: (angle: CameraView | null, distance: CameraDistance) => void;
  setVideo: (v: Video | null) => void;
  /** Start from C1 (fresh run). */
  run: () => Promise<void>;
  /** Re-run the failed step and continue. */
  retry: () => Promise<void>;
  /** Clear results so a new video can be taken (keeps bowler + setup). */
  retake: () => void;
  reset: () => void;
};

const Ctx = createContext<AnalysisState | null>(null);

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [angle, setAngle] = useState<CameraView | null>(null);
  const [distance, setDistance] = useState<CameraDistance>(5);
  const [video, setVideoState] = useState<Video | null>(null);
  const [steps, setSteps] = useState(IDLE);
  const [results, setResults] = useState<Results>({});
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const busy = useRef(false);
  const app = useApp();
  const appRef = useRef(app);
  appRef.current = app;
  // Latest values for the async runner (state inside a running promise would be stale).
  const live = useRef({ athlete, angle, distance, video, results });
  live.current = { athlete, angle, distance, video, results };

  const patch = (k: ComponentKey, p: Partial<StepInfo>) => setSteps((s) => ({ ...s, [k]: { ...s[k], ...p } }));

  const execute = useCallback(async (from: ComponentKey) => {
    const { athlete: a, angle: ang, distance: dist, video: v } = live.current;
    if (busy.current || !a || !ang || !v) return;
    busy.current = true;
    setRunning(true);
    const res: Results = { ...live.current.results };
    const start = ORDER.indexOf(from);
    // Steps from `from` onward start again; earlier finished steps stay viewable.
    setSteps((s) => Object.fromEntries(ORDER.map((k, i) => [k, i < start ? s[k] : { ...IDLE[k] }])) as Record<ComponentKey, StepInfo>);
    if (start === 0) setStartedAt(Date.now());

    const step = async (k: ComponentKey, work: () => Promise<void>) => {
      patch(k, { state: 'running', startedAt: Date.now(), endedAt: undefined, error: undefined });
      try {
        await work();
        patch(k, { state: 'done', endedAt: Date.now() });
        setResults({ ...res });
        return true;
      } catch (e) {
        patch(k, { state: 'failed', endedAt: Date.now(), error: (e as Error).message });
        setResults({ ...res });
        return false;
      }
    };

    const plan: [ComponentKey, () => Promise<void>][] = [
      ['c1', async () => {
        patch('c1', { text: 'Uploading the video and finding the bowler… (about 1–2 min)' });
        const named = { ...v, name: uploadName(a.bowler_id, ang, dist, v.name) };
        res.pose = await c1.process(named, a.dominant_arm, ang, dist);
        res.row = undefined; res.sent = undefined; res.risk = undefined; res.plan = undefined;
      }],
      ['c2', async () => {
        if (!res.pose) throw new Error('Pose step has no result yet.');
        patch('c2', { text: 'Getting the keypoints from C1…' });
        const kp = await c2.c1Keypoints(res.pose.run_id);
        patch('c2', { text: 'Measuring joint angles…' });
        res.row = await c2.compute(kp);
        if (hasCode(res.row.bowler_id) && res.row.bowler_id !== a.bowler_id) {
          throw new Error(`This video is from ${res.row.bowler_id}, not ${a.bowler_id}. C4 only accepts a delivery for the same bowler code.`);
        }
        patch('c2', { text: `Saving the angles to ${a.bowler_id}…` });
        res.sent = await c2.sendToC4(a.id, { ...res.row, bowler_id: a.bowler_id });
      }],
      ['c3', async () => {
        patch('c3', { text: 'Running the risk model…' });
        res.risk = await c3.assess(a.id, { sendToC4: true });
      }],
      ['c4', async () => {
        patch('c4', { text: 'Building the prevention plan…' });
        res.plan = await c4.generatePlan(a.id);
        // Same cache C4's plan screens read (src/c4/C4Context.tsx planKey), so Plan opens on this plan.
        await setItem(`cricshield.c4.plan.${a.id}`, JSON.stringify(res.plan));
      }],
    ];

    let ok = true;
    for (const [k, work] of plan.slice(start)) {
      if (!(await step(k, work))) { ok = false; break; }
    }
    // A finished analysis: log it on this phone (Home "recent analyses") and mark the bowler as analysed.
    if (ok && res.pose) {
      const at = new Date().toISOString();
      const top = res.risk ? (res.risk.all_factors.find((f) => f.feature === res.risk!.top_factors[0]?.feature) ?? res.risk.top_factors[0]) : null;
      await appRef.current.logAnalysis({
        athleteId: a.id, code: a.bowler_id, at,
        level: res.risk ? toRiskLevel(res.risk.risk_tier ?? res.risk.risk_level) : null,
        score: res.risk ? Math.round(res.risk.risk_score * 100) : null,
        redFlags: res.row ? FEATURE_ORDER.filter((n) => res.row!.features[n]?.breach && res.row!.features[n]?.reliable).length : null,
        detection: res.pose.detection_rate,
        reason: top?.label ?? null,
      });
      await appRef.current.saveExtra(a.id, { lastAnalysedAt: at });
    }
    busy.current = false;
    setRunning(false);
  }, []);

  const failedStep = ORDER.find((k) => steps[k].state === 'failed') ?? null;
  const finished = ORDER.every((k) => steps[k].state === 'done');

  const value = useMemo<AnalysisState>(() => ({
    athlete, angle, distance, video, steps, results, running, startedAt, finished, failedStep,
    begin: (a) => {
      setAthlete(a); setVideoState(null); setResults({}); setSteps(IDLE); setStartedAt(null);
    },
    setSetup: (ang, dist) => { setAngle(ang); setDistance(dist); },
    setVideo: (v) => { setVideoState(v); setResults({}); setSteps(IDLE); setStartedAt(null); },
    run: () => execute('c1'),
    retry: () => (failedStep ? execute(failedStep) : Promise.resolve()),
    retake: () => { setVideoState(null); setResults({}); setSteps(IDLE); setStartedAt(null); },
    reset: () => {
      setAthlete(null); setAngle(null); setDistance(5); setVideoState(null); setResults({}); setSteps(IDLE); setStartedAt(null);
    },
  }), [athlete, angle, distance, video, steps, results, running, startedAt, finished, failedStep, execute]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAnalysis() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAnalysis must be used inside AnalysisProvider');
  return v;
}
