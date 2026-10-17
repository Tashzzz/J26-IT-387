/**
 * Single place for the backend address (app/README.md rule).
 * Every component's API module (c4.ts, risk.ts, ...) calls `request()` from here.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 8000;

/**
 * Where is the FastAPI backend?
 * - Web: same computer -> localhost
 * - Phone with Expo Go: Expo already knows the PC's LAN IP (hostUri), so reuse it with port 8000.
 * Can be overridden at runtime with setApiBase() (Plan -> Profile -> Server).
 */
export function defaultApiBase(): string {
  if (Platform.OS === 'web') return `http://localhost:${API_PORT}`;
  const host = Constants.expoConfig?.hostUri?.split(':')[0]; // e.g. "192.168.1.23"
  if (host) return `http://${host}:${API_PORT}`;
  return Platform.OS === 'android' ? `http://10.0.2.2:${API_PORT}` : `http://localhost:${API_PORT}`;
}

let base = defaultApiBase();
export const setApiBase = (url: string) => {
  base = url.trim().replace(/\/+$/, '') || defaultApiBase();
};
export const getApiBase = () => base;

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

/** FastAPI / Pydantic 422 errors -> one readable message per line. */
function readableError(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: { loc?: (string | number)[]; msg?: string }) => {
        const field = d.loc?.filter((x) => x !== 'body').join('.') || 'input';
        return `${field}: ${(d.msg ?? '').replace(/^Value error, /, '')}`;
      })
      .join('\n');
  }
  return `Request failed (${status})`;
}

export async function request<T>(path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    if (res.status === 204) return undefined as T;
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(readableError(body, res.status), res.status);
    return body as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(`Cannot reach the backend at ${base}. Is uvicorn running on port ${API_PORT}?`);
  } finally {
    clearTimeout(timer);
  }
}
