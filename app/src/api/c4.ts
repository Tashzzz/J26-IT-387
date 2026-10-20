// C4 (Rathnayaka) - calls to /recommend on the shared backend.
import type {
  Athlete, AthleteInput, Feedback, FeedbackInput, PreventionPlan, Upstream, WhatIfResult, Workload, WorkloadInput,
} from '../c4/types';
import { request } from './client';

const R = '/recommend';
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const c4 = {
  ping: () => request<{ component: string; engine_version: string; rules: number }>(`${R}/ping`, undefined, 4000),

  athletes: () => request<Athlete[]>(`${R}/athletes`),
  createAthlete: (a: AthleteInput) => request<Athlete>(`${R}/athletes`, post(a)),
  updateAthlete: (id: number, a: AthleteInput) =>
    request<Athlete>(`${R}/athletes/${id}`, { method: 'PUT', body: JSON.stringify(a) }),

  workloads: (id: number) => request<Workload[]>(`${R}/athletes/${id}/workloads`),
  addWorkload: (id: number, w: WorkloadInput) => request<Workload>(`${R}/athletes/${id}/workloads`, post(w)),
  deleteWorkload: (wid: number) => request<void>(`${R}/workloads/${wid}`, { method: 'DELETE' }),

  upstream: (id: number) => request<Upstream>(`${R}/athletes/${id}/upstream`),

  generatePlan: (id: number) => request<PreventionPlan>(`${R}/athletes/${id}/plan`, { method: 'POST' }),
  plans: (id: number) => request<PreventionPlan[]>(`${R}/athletes/${id}/plans`),
  plan: (pid: number) => request<PreventionPlan & { feedback: Feedback[] }>(`${R}/plans/${pid}`),
  addFeedback: (pid: number, f: FeedbackInput) => request<Feedback>(`${R}/plans/${pid}/feedback`, post(f)),

  /** Model-guided check: how much would C3's risk model say each plan action lowers the risk? */
  whatif: (id: number) => request<WhatIfResult>(`${R}/athletes/${id}/whatif`, { method: 'POST' }, 12000),

  resetDemo: () => request<{ reset: boolean }>(`${R}/demo/reset`, { method: 'POST' }),
};
