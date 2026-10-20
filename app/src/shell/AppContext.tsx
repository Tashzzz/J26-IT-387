// App-shell state kept on this phone: first-launch flag, coach details, per-bowler extras, backend URL.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { defaultApiBase, getApiBase, setApiBase } from '../api/client';
import { getItem, getJson, KEYS, removeItem, setItem, setJson } from './storage';

export type Coach = { name: string; team: string };
export type PaceBand = 'under_110' | '110_125' | '125_135' | 'over_135';
/** Fields C4's athlete model does not have; stored on this phone only and not sent to any model. */
export type BowlerExtra = { pace?: PaceBand | null; soreness?: number | null; lastAnalysedAt?: string; updatedAt?: string };

export const PACE_LABEL: Record<PaceBand, string> = {
  under_110: '< 110 km/h', '110_125': '110–125 km/h', '125_135': '125–135 km/h', over_135: '135+ km/h',
};

type AppState = {
  ready: boolean;
  onboarded: boolean;
  coach: Coach;
  extras: Record<number, BowlerExtra>;
  apiBase: string;
  /** Research mode: shows component owners and technical detail. */
  researchMode: boolean;
  setResearchMode: (on: boolean) => Promise<void>;
  finishOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
  saveCoach: (c: Coach) => Promise<void>;
  saveExtra: (athleteId: number, e: BowlerExtra) => Promise<void>;
  changeApiBase: (url: string) => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [coach, setCoach] = useState<Coach>({ name: '', team: '' });
  const [extras, setExtras] = useState<Record<number, BowlerExtra>>({});
  const [apiBase, setBase] = useState(getApiBase());
  const [researchMode, setResearch] = useState(false);
  const extrasRef = useRef<Record<number, BowlerExtra>>({});

  useEffect(() => {
    (async () => {
      const [base, ob, c, ex, rm] = await Promise.all([
        getItem(KEYS.apiBase), getItem(KEYS.onboarded),
        getJson<Coach>(KEYS.coach, { name: '', team: '' }), getJson<Record<number, BowlerExtra>>(KEYS.extras, {}),
        getItem(KEYS.research),
      ]);
      if (base) { setApiBase(base); setBase(getApiBase()); }
      setOnboarded(ob === '1');
      setResearch(rm === '1');
      setCoach(c);
      extrasRef.current = ex;
      setExtras(ex);
      setReady(true);
    })();
  }, []);

  const finishOnboarding = useCallback(async () => { setOnboarded(true); await setItem(KEYS.onboarded, '1'); }, []);
  const resetOnboarding = useCallback(async () => { setOnboarded(false); await removeItem(KEYS.onboarded); }, []);
  const saveCoach = useCallback(async (c: Coach) => { setCoach(c); await setJson(KEYS.coach, c); }, []);
  const saveExtra = useCallback(async (id: number, e: BowlerExtra) => {
    const cur = extrasRef.current;
    const next = { ...cur, [id]: { ...cur[id], ...e, updatedAt: new Date().toISOString() } };
    extrasRef.current = next;
    setExtras(next);
    await setJson(KEYS.extras, next);
  }, []);
  const setResearchMode = useCallback(async (on: boolean) => { setResearch(on); await setItem(KEYS.research, on ? '1' : '0'); }, []);
  const changeApiBase = useCallback(async (url: string) => {
    setApiBase(url.trim() || defaultApiBase());
    setBase(getApiBase());
    await setItem(KEYS.apiBase, getApiBase());
  }, []);

  return (
    <Ctx.Provider value={{ ready, onboarded, coach, extras, apiBase, researchMode, setResearchMode, finishOnboarding, resetOnboarding, saveCoach, saveExtra, changeApiBase }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
