// C2 (Samarasinghe) - calls to /features on the shared backend. Every call goes through request() in client.ts.
import type { AthleteRef, C1Keypoints, Events, FeatureRow, Thresholds, Upstream } from '../c2/types';
import { request } from './client';

const F = '/features';

// A real clip has a few hundred frames: filtering + angles take a few seconds on a laptop.
const COMPUTE_TIMEOUT_MS = 30000;

// C4 keeps at most 50 C2 rows per athlete (UpstreamInput in c4_recommend/models.py).
const MAX_ROWS = 50;

/** Manual event frames -> "?bfc_frame=98&ffc_frame=108" (empty string when none are set). */
function eventQuery(events?: Events): string {
  const q = Object.entries(events ?? {})
    .filter(([, v]) => v !== undefined && v !== null && Number.isFinite(v))
    .map(([k, v]) => `${k}=${v}`);
  return q.length ? `?${q.join('&')}` : '';
}

export const c2 = {
  ping: () => request<{ component: string; status: string }>(`${F}/ping`, undefined, 4000),

  /** Published limits + plain-English meaning of every feature. */
  thresholds: () => request<Thresholds>(`${F}/thresholds`),

  /** Synthetic delivery with known angles (response has synthetic: true). */
  demo: () => request<FeatureRow>(`${F}/demo`, undefined, COMPUTE_TIMEOUT_MS),

  /** C1's keypoints for one video processed in the Capture tab (owned by C1, read only here). */
  c1Keypoints: (runId: string) => request<C1Keypoints>(`/pose/runs/${encodeURIComponent(runId)}/keypoints`, undefined, 15000),

  /** C1 keypoints -> C2 feature row. events = BFC / FFC / release frames typed by hand (optional). */
  compute: (keypoints: C1Keypoints, events?: Events) =>
    request<FeatureRow>(`${F}/compute${eventQuery(events)}`, { method: 'POST', body: JSON.stringify(keypoints) }, COMPUTE_TIMEOUT_MS),

  /** Athletes registered in C4 (Plan tab), to choose who this delivery belongs to. */
  athletes: () => request<AthleteRef[]>('/recommend/athletes'),

  /**
   * Save one C2 row in C4's inbox for this athlete, where C3 reads it (POST /recommend/athletes/{id}/upstream).
   * C4 replaces the whole inbox on every POST, so first read it and keep C3's last risk result and the
   * earlier deliveries; a row for the same video replaces the old one. The per-frame series is not sent.
   */
  async sendToC4(athleteId: number, row: FeatureRow): Promise<{ deliveries: number }> {
    const { series, true_values, synthetic, ...clean } = row; // eslint-disable-line @typescript-eslint/no-unused-vars
    const inbox = await request<Upstream>(`/recommend/athletes/${athleteId}/upstream`);
    const c2rows = [...(inbox.c2 ?? []).filter((r) => r.video_id !== row.video_id), clean].slice(-MAX_ROWS);
    await request(`/recommend/athletes/${athleteId}/upstream`, {
      method: 'POST',
      body: JSON.stringify({ c3: inbox.c3 ?? null, c2: c2rows }),
    });
    return { deliveries: c2rows.length };
  },
};
