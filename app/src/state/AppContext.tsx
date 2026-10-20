// App-wide state: backend address, the bowler currently being looked after, and that bowler's
// latest prevention plan. Every tab reads the same "current bowler", so the coach chooses them once.
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { c4 as api } from '../api/c4';
import { ApiError, defaultApiBase, getApiBase, setApiBase } from '../api/client';
import type { Athlete, PreventionPlan } from '../c4/types';

const KEY_API = 'cricshield.apiBase';
const KEY_SELECTED = 'cricshield.selectedAthlete';
const KEY_SELECTED_OLD = 'cricshield.c4.selectedAthlete';
const KEY_ONBOARDED = 'cricshield.onboarded';
const planKey = (id: number) => `cricshield.c4.plan.${id}`;

// AsyncStorage can be unavailable (private browsing etc.) - never let it crash the app.
async function store(key: string, value: string) {
  try { await AsyncStorage.setItem(key, value); } catch { /* ignore */ }
}
async function load(key: string) {
  try { return await AsyncStorage.getItem(key); } catch { return null; }
}
async function remove(key: string) {
  try { await AsyncStorage.removeItem(key); } catch { /* ignore */ }
}

interface AppState {
  ready: boolean; // saved settings restored and the first bowler list requested
  onboarded: boolean;
  apiBase: string;
  online: boolean | null;
  error: string | null;
  athletes: Athlete[];
  athlete: Athlete | null;
  selectAthlete: (id: number) => void;
  refreshAthletes: () => Promise<Athlete[] | null>;
  setAthletes: React.Dispatch<React.SetStateAction<Athlete[]>>;
  plan: PreventionPlan | null;
  planIsCached: boolean;
  planLoading: boolean;
  planError: string | null;
  generatePlan: () => Promise<PreventionPlan | null>;
  changeApiBase: (url: string) => Promise<void>;
  completeOnboarding: (athleteId: number) => Promise<void>;
  restartOnboarding: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [apiBase, setBase] = useState(getApiBase());
  const [online, setOnline] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [plan, setPlan] = useState<PreventionPlan | null>(null);
  const [planIsCached, setPlanIsCached] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const athlete = useMemo(() => athletes.find((a) => a.id === selectedId) ?? null, [athletes, selectedId]);

  const refreshAthletes = useCallback(async () => {
    try {
      const list = await api.athletes();
      setAthletes(list);
      setOnline(true);
      setError(null);
      setSelectedId((cur) => (cur && list.some((a) => a.id === cur) ? cur : list[0]?.id ?? null));
      return list;
    } catch (e) {
      setOnline(false);
      setError((e as Error).message);
      return null;
    }
  }, []);

  // Restore settings on start.
  useEffect(() => {
    (async () => {
      const savedBase = await load(KEY_API);
      if (savedBase) { setApiBase(savedBase); setBase(savedBase); }
      const savedSel = (await load(KEY_SELECTED)) ?? (await load(KEY_SELECTED_OLD));
      if (savedSel) setSelectedId(Number(savedSel));
      setOnboarded((await load(KEY_ONBOARDED)) === '1');
      await refreshAthletes();
      setReady(true);
    })();
  }, [refreshAthletes]);

  // Switching bowler: show their last saved plan straight away (also the offline fallback).
  useEffect(() => {
    if (selectedId == null) return;
    store(KEY_SELECTED, String(selectedId));
    setPlanError(null);
    (async () => {
      const cached = await load(planKey(selectedId));
      setPlan(cached ? JSON.parse(cached) : null);
      setPlanIsCached(Boolean(cached));
    })();
  }, [selectedId]);

  const generatePlan = useCallback(async () => {
    if (selectedId == null) return null;
    setPlanLoading(true);
    try {
      const p = await api.generatePlan(selectedId);
      setPlan(p);
      setPlanIsCached(false);
      setOnline(true);
      setPlanError(null);
      await store(planKey(selectedId), JSON.stringify(p));
      return p;
    } catch (e) {
      if (!(e instanceof ApiError && e.status)) setOnline(false);
      setPlanError((e as Error).message);
      return null;
    } finally {
      setPlanLoading(false);
    }
  }, [selectedId]);

  const changeApiBase = useCallback(async (url: string) => {
    setApiBase(url || defaultApiBase());
    setBase(getApiBase());
    await store(KEY_API, getApiBase());
    await refreshAthletes();
  }, [refreshAthletes]);

  const completeOnboarding = useCallback(async (athleteId: number) => {
    setSelectedId(athleteId);
    await store(KEY_SELECTED, String(athleteId));
    await store(KEY_ONBOARDED, '1');
    setOnboarded(true);
  }, []);

  const restartOnboarding = useCallback(async () => {
    await remove(KEY_ONBOARDED);
    setOnboarded(false);
  }, []);

  const value: AppState = {
    ready, onboarded, apiBase, online, error, athletes, athlete,
    selectAthlete: setSelectedId, refreshAthletes, setAthletes,
    plan, planIsCached, planLoading, planError, generatePlan,
    changeApiBase, completeOnboarding, restartOnboarding,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}

/** Age this year from the birth year in the profile. */
export const ageOf = (a: Pick<Athlete, 'birth_year'>) => new Date().getFullYear() - a.birth_year;

export const LEVEL_LABEL: Record<Athlete['playing_level'], string> = {
  school: 'School', club: 'Club', provincial: 'Provincial', national: 'National',
};

/** "Club · 17 yrs · Right-arm" */
export const athleteLine = (a: Athlete) =>
  `${LEVEL_LABEL[a.playing_level]} · ${ageOf(a)} yrs · ${a.dominant_arm === 'right' ? 'Right' : 'Left'}-arm`;
