// The C4 state moved to src/state/AppContext.tsx, which the whole app now shares
// (one current bowler for every tab). Kept so older imports keep working.
import { useApp } from '../state/AppContext';

export { AppProvider as C4Provider } from '../state/AppContext';

export function useC4() {
  const app = useApp();
  return { ...app, loading: app.planLoading, error: app.planError ?? app.error };
}
