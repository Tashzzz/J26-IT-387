// Open the members' existing screens for one bowler. Their screens remember the selected athlete in
// AsyncStorage; writing that key before navigating makes them open on this bowler (their code is unchanged).
import type { Router } from 'expo-router';

import { KEYS, setItem } from './storage';

async function select(athleteId: number) {
  await Promise.all([setItem(KEYS.c4Selected, String(athleteId)), setItem(KEYS.c3Selected, String(athleteId))]);
}

export async function openPlan(router: Router, athleteId: number, page: 'index' | 'history' | 'workload' = 'index') {
  await select(athleteId);
  router.push(page === 'index' ? '/plan' : page === 'history' ? '/plan/history' : '/plan/workload');
}

export async function openRisk(router: Router, athleteId: number) {
  await select(athleteId);
  router.push('/risk');
}

/** Start a new analysis (C1 capture for now; Phase 4 replaces this with the guided flow). */
export async function openAnalysis(router: Router, athleteId?: number) {
  if (athleteId != null) await select(athleteId);
  router.push('/capture');
}
