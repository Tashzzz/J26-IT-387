// Squad data shared by Home, Squad, Analyse and the bowler screens.
// Athletes come from C4; the latest risk per bowler from C3 (one call); analysed deliveries from C4's inbox.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { c4 } from '../api/c4';
import { c3 } from '../api/risk';
import type { HistoryItem } from '../c3/types';
import type { Athlete } from '../c4/types';
import { toRiskLevel, type RiskLevel } from '../ui';
import { useApp } from './AppContext';

export type SquadRow = {
  athlete: Athlete;
  latest: HistoryItem | null;
  level: RiskLevel | null;
  /** C2 deliveries in C4's inbox; null when the inbox could not be read. */
  deliveries: number | null;
  demo: boolean;
};

export const isDemo = (code: string) => /^DEMO/i.test(code);
export const ageOf = (birthYear: number) => new Date().getFullYear() - birthYear;

/** Risk level of a C3 history item (tier when present, else level). */
export const levelOf = (h: HistoryItem | null | undefined): RiskLevel | null => (h ? toRiskLevel(h.risk_tier ?? h.risk_level) : null);

const SEVERITY: Record<RiskLevel, number> = { low: 0, moderate: 1, high: 2, critical: 3 };
export const severity = (l: RiskLevel | null) => (l ? SEVERITY[l] : -1);
export const isHighRisk = (l: RiskLevel | null) => l === 'high' || l === 'critical';
export const needsAnalysis = (r: SquadRow) => r.deliveries === 0;

/** Next free code in the B01, B02 ... series. */
export function nextCode(codes: string[]): string {
  const used = new Set(codes.map((c) => c.toUpperCase()));
  for (let n = 1; n < 1000; n++) {
    const code = `B${String(n).padStart(2, '0')}`;
    if (!used.has(code)) return code;
  }
  return '';
}

/** "today", "yesterday", "3 d ago", or a date. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} d ago`;
  return d.toLocaleDateString();
}

type SquadState = {
  rows: SquadRow[];
  loading: boolean;
  error: string | null;
  /** C3 could not be reached (risk shown as unknown). */
  riskUnavailable: boolean;
  refresh: () => Promise<void>;
  byId: (id: number) => SquadRow | undefined;
};

const Ctx = createContext<SquadState | null>(null);

export function SquadProvider({ children }: { children: React.ReactNode }) {
  const { ready, apiBase } = useApp();
  const [rows, setRows] = useState<SquadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [riskUnavailable, setRiskUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const athletes = await c4.athletes();
      const [risk, inboxes] = await Promise.all([
        c3.athletes().then((l) => ({ ok: true as const, l }), () => ({ ok: false as const, l: [] })),
        Promise.allSettled(athletes.map((a) => c4.upstream(a.id))),
      ]);
      setRiskUnavailable(!risk.ok);
      const latest = new Map(risk.l.map((r) => [r.athlete_id, r.latest]));
      const next = athletes.map((a, i): SquadRow => {
        const inbox = inboxes[i];
        const h = latest.get(a.id) ?? null;
        return {
          athlete: a, latest: h, level: levelOf(h), demo: isDemo(a.bowler_id),
          deliveries: inbox.status === 'fulfilled' ? inbox.value.c2.length : null,
        };
      });
      // Real bowlers first, demo bowlers last; each group by code.
      next.sort((x, y) => Number(x.demo) - Number(y.demo) || x.athlete.bowler_id.localeCompare(y.athlete.bowler_id));
      setRows(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (ready) { setLoading(true); refresh(); } }, [ready, apiBase, refresh]);

  const value = useMemo<SquadState>(() => ({
    rows, loading, error, riskUnavailable, refresh,
    byId: (id) => rows.find((r) => r.athlete.id === id),
  }), [rows, loading, error, riskUnavailable, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSquad() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSquad must be used inside SquadProvider');
  return v;
}
