// Safe AsyncStorage helpers for the app shell (storage can be unavailable - never crash).
import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYS = {
  apiBase: 'cricshield.apiBase', // shared with C3 / C4 screens
  onboarded: 'cricshield.app.onboarded',
  coach: 'cricshield.app.coach',
  extras: 'cricshield.app.bowlerExtras',
  research: 'cricshield.app.researchMode',
  analyses: 'cricshield.app.analyses',
  // Read by the members' screens to pick the bowler they open on (their keys, written here only to hand over).
  c4Selected: 'cricshield.c4.selectedAthlete',
  c3Selected: 'cricshield.c3.selectedAthlete',
} as const;

export async function getItem(key: string): Promise<string | null> {
  try { return await AsyncStorage.getItem(key); } catch { return null; }
}

export async function setItem(key: string, value: string) {
  try { await AsyncStorage.setItem(key, value); } catch { /* ignore */ }
}

export async function removeItem(key: string) {
  try { await AsyncStorage.removeItem(key); } catch { /* ignore */ }
}

export async function getJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export const setJson = (key: string, value: unknown) => setItem(key, JSON.stringify(value));
