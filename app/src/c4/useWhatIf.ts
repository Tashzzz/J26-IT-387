// Model-guided what-if check for the current plan. Re-runs whenever a new plan is made.
// If C3's risk model is not available the result is null and `unavailable` explains why,
// so the plan screen keeps working exactly as before.
import { useCallback, useEffect, useState } from 'react';

import { c4 } from '../api/c4';
import { ApiError } from '../api/client';
import type { WhatIfResult } from './types';

export function useWhatIf(athleteId: number | null | undefined, planKey: string | number | null | undefined) {
  const [data, setData] = useState<WhatIfResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (athleteId == null) return;
    setLoading(true);
    try {
      setData(await c4.whatif(athleteId));
      setUnavailable(null);
    } catch (e) {
      setData(null);
      setUnavailable(e instanceof ApiError && e.status === 503
        ? 'The risk model is not loaded on the server, so the plan cannot be checked yet.'
        : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => { if (planKey != null) run(); }, [run, planKey]);

  return { data, loading, unavailable, rerun: run };
}

/** Risk 0-1 -> points on the 0-100 scale used everywhere in the app. */
export const pts = (x: number) => Math.round(x * 100);
