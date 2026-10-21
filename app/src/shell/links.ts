// Open the members' existing screens for one bowler. Their screens remember the selected athlete in
// AsyncStorage; writing that key before navigating makes them open on this bowler (their code is unchanged).
import type { useRouter } from 'expo-router';

import { c4 } from '../api/c4';
import { c3 } from '../api/risk';
import { KEYS, setItem } from './storage';

type Router = ReturnType<typeof useRouter>;

async function select(athleteId: number) {
  await Promise.all([setItem(KEYS.c4Selected, String(athleteId)), setItem(KEYS.c3Selected, String(athleteId))]);
}

const PLAN_PAGES = {
  index: '/plan', history: '/plan/history', workload: '/plan/workload', 'week-plan': '/plan/week-plan', whatif: '/plan/whatif',
} as const;

export async function openPlan(router: Router, athleteId: number, page: keyof typeof PLAN_PAGES = 'index') {
  await select(athleteId);
  router.push(PLAN_PAGES[page]);
}

/**
 * C4 week planner for one bowler. Refreshes C3's risk (latest video angles, workload log, profile) and C4's
 * plan first, so the planner never works from a stale score. Either step may fail (e.g. C3's model not
 * loaded); the planner screen then shows why.
 */
export async function openWeekPlanner(router: Router, athleteId: number) {
  try { await c3.assess(athleteId, { sendToC4: true }); } catch { /* C3 unavailable */ }
  try { await c4.generatePlan(athleteId); } catch { /* shown on the plan screens */ }
  await openPlan(router, athleteId, 'week-plan');
}

export async function openRisk(router: Router, athleteId: number) {
  await select(athleteId);
  router.push('/risk');
}
