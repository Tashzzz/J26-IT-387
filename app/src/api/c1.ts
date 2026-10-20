// C1 (Nethmi) - calls to /pose on the shared backend.
import type { BowlingArm, CameraAngle, CameraDistance, ProcessResult, Reliability } from '../c1/types';
import { ApiError, getApiBase, request } from './client';

const P = '/pose';

// Pose estimation + overlay takes about 1-2 minutes for a phone clip on a laptop CPU.
const PROCESS_TIMEOUT_MS = 5 * 60 * 1000;

export type PickedVideo = { uri: string; name: string; mimeType: string; file?: Blob };

export const c1 = {
  ping: () => request<{ component: string; status: string }>(`${P}/ping`, undefined, 4000),

  reliability: () => request<Reliability>(`${P}/reliability`),

  /** Full URL of a file the backend serves (overlay video, keypoints JSON). */
  fileUrl: (path: string) => `${getApiBase()}${path}`,

  /** Upload one video. Not via request(): a file upload is multipart form data, not JSON. */
  async process(video: PickedVideo, arm: BowlingArm, angle?: CameraAngle, distance?: CameraDistance): Promise<ProcessResult> {
    const form = new FormData();
    if (video.file) form.append('video', video.file, video.name); // web: real File object
    else form.append('video', { uri: video.uri, name: video.name, type: video.mimeType } as unknown as Blob); // phone
    form.append('bowling_arm', arm);
    if (angle) form.append('angle', angle);
    if (distance) form.append('distance_m', String(distance));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROCESS_TIMEOUT_MS);
    try {
      const res = await fetch(`${getApiBase()}${P}/process`, { method: 'POST', body: form, signal: controller.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new ApiError(typeof body?.detail === 'string' ? body.detail : `Upload failed (${res.status})`, res.status);
      return body as ProcessResult;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (controller.signal.aborted) throw new ApiError('Processing took too long. Try a shorter clip (a few seconds around the delivery).');
      throw new ApiError(`Cannot reach the backend at ${getApiBase()}. Is uvicorn running on port 8000?`);
    } finally {
      clearTimeout(timer);
    }
  },
};
