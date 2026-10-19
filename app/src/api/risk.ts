// C3 - calls to /risk on the shared backend.
import type { Assessment, HistoryItem, ModelCard, RiskAthlete } from '../c3/types';
import { request } from './client';

const R = '/risk';

export const c3 = {
  ping: () => request<{ component: string; status: string; model_loaded: boolean; model?: string; detail?: string }>(`${R}/ping`, undefined, 4000),
  model: () => request<ModelCard>(`${R}/model`),
  athletes: () => request<RiskAthlete[]>(`${R}/athletes`),
  assess: (athleteId: number, opts: { sendToC4?: boolean } = {}) =>
    request<Assessment>(`${R}/athletes/${athleteId}/assess`, {
      method: 'POST',
      body: JSON.stringify({ send_to_c4: opts.sendToC4 ?? true }),
    }, 15000),
  history: (athleteId: number, limit = 12) => request<HistoryItem[]>(`${R}/athletes/${athleteId}/history?limit=${limit}`),
  assessment: (id: number) => request<Assessment>(`${R}/assessments/${id}`),
};
