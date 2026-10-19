// C2 (Samarasinghe) - calls to /features on the shared backend. Every call goes through request() in client.ts.
import type { C1Keypoints, Events, FeatureRow, Thresholds } from '../c2/types';
import { request } from './client';

const F = '/features';

// A real clip has a few hundred frames: filtering + angles take a few seconds on a laptop.
const COMPUTE_TIMEOUT_MS = 30000;

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
};
