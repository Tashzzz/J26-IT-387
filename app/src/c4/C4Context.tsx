import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { c4 as api } from '../api/c4';
import { ApiError, defaultApiBase, getApiBase, setApiBase } from '../api/client';
import type { Athlete, PreventionPlan } from './types';

const KEY_API = 'cricshield.apiBase';
const KEY_SELECTED = 'cricshield.c4.selectedAthlete';
const planKey = (id: number) => `cricshield.c4.plan.${id}`;

// AsyncStorage can be unavailable (private browsing etc.) – never let it crash the app.
async function store(key: string, value: string) {
  try { await AsyncStorage.setItem(key, value); } catch { /* ignore */ }
}
async function load(key: string) {
  try { return await AsyncStorage.getItem(key); } catch { return null; }
}

interface C4State {
  apiBase: string;
  online: boolean | null;
  athletes: Athlete[];
  athlete: Athlete | null;
  plan: PreventionPlan | null;
  planIsCached: boolean;
  loading: boolean;
  error: string | null;
  selectAthlete: (id: number) => void;
  refreshAthletes: () => Promise<void>;
  generatePlan: () => Promise<void>;
  changeApiBase: (url: string) => Promise<void>;
  setAthletes: React.Dispatch<React.SetStateAction<Athlete[]>>;
}

const Ctx = createContext<C4State | null>(null);

export function C4Provider({ children }: { children: React.ReactNode }) {
  const [apiBase, setBase] = useState(getApiBase());
  const [online, setOnline] = useState<boolean | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [plan, setPlan] = useState<PreventionPlan | null>(null);
  const [planIsCached, setPlanIsCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const athlete = useMemo(() => athletes.find((a) => a.id === selectedId) ?? null, [athletes, selectedId]);

  const refreshAthletes = useCallback(async () => {
    try {
      const list = await api.athletes();
      setAthletes(list);
      setOnline(true);
      setError(null);
      setSelectedId((cur) => (cur && list.some((a) => a.id === cur) ? cur : list[0]?.id ?? null));
    } catch (e) {
      setOnline(false);
      setError((e as Error).message);
    }
  }, []);

  // Restore settings on start
  useEffect(() => {
    (async () => {
      const savedBase = await load(KEY_API);
      if (savedBase) { setApiBase(savedBase); setBase(savedBase); }
      const savedSel = await load(KEY_SELECTED);
      if (savedSel) setSelectedId(Number(savedSel));
      await refreshAthletes();
    })();
  }, [refreshAthletes]);

  // Show the cached plan immediately when switching athlete (also the offline fallback)
  useEffect(() => {
    if (selectedId == null) return;
    store(KEY_SELECTED, String(selectedId));
    (async () => {
      const cached = await load(planKey(selectedId));
      setPlan(cached ? JSON.parse(cached) : null);
      setPlanIsCached(Boolean(cached));
    })();
  }, [selectedId]);

  const generatePlan = useCallback(async () => {
    if (selectedId == null) return;
    setLoading(true);
    try {
      const p = await api.generatePlan(selectedId);
      setPlan(p);
      setPlanIsCached(false);
      setOnline(true);
      setError(null);
      await store(planKey(selectedId), JSON.stringify(p));
    } catch (e) {
      if (!(e instanceof ApiError && e.status)) setOnline(false);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const changeApiBase = useCallback(async (url: string) => {
    setApiBase(url || defaultApiBase());
    setBase(getApiBase());
    await store(KEY_API, getApiBase());
    await refreshAthletes();
  }, [refreshAthletes]);

  const value: C4State = {
    apiBase, online, athletes, athlete, plan, planIsCached, loading, error,
    selectAthlete: setSelectedId, refreshAthletes, generatePlan, changeApiBase, setAthletes,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useC4() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useC4 must be used inside C4Provider');
  return v;
}
