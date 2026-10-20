# CricShield mobile app (Expo / React Native)

Expo SDK 58 · Expo Router · TypeScript.

## User flow

```
Welcome → Create bowler profile (3 steps) → Home
Tabs:  Home · Analyse · Risk · Plan · Profile
```

The coach chooses **one current bowler** (Home → tap the bowler name), and every tab works on that bowler.
**Analyse** is one guided flow: video → camera setup → processing → results. One button,
*Save & check injury risk*, saves the joint angles for the bowler, runs the risk model and updates the
prevention plan, then opens the risk report. Component codes (C1–C4) are never shown to users.

## Screens and owners

| Route | Screen | Component (owner) |
|-------|--------|-------------------|
| `app/welcome.tsx`, `app/onboarding.tsx` | First launch, bowler profile set-up | shared / C4 athlete registry |
| `app/(tabs)/index.tsx` | Home: risk status, today's limits, next steps | shared |
| `app/(tabs)/analyse.tsx` | Video → pose → joint angles → save & assess | C1 Nethmi (pose) + C2 Samarasinghe (angles) |
| `app/reliability.tsx` | Camera setup guide (ICC per body region) | C1 Nethmi |
| `app/(tabs)/risk.tsx` | Risk score, reasons, two-level SHAP, history | C3 Rizma |
| `app/(tabs)/plan.tsx`, `app/why/[ruleId].tsx`, `app/workload.tsx`, `app/plan-history.tsx`, `app/feedback.tsx` | Prevention plan and its tools | C4 Rathnayaka |
| `app/(tabs)/profile.tsx`, `app/bowler.tsx`, `app/bowlers.tsx` | Bowler profile, add / edit / switch | C4 athlete registry |
| `app/settings.tsx` | Server connection, demo data, about, research diagnostics | shared |

## Code layout

- `src/ui/theme.ts` + `src/ui/components.tsx`: the design system. Every screen uses only these, so the
  look can be changed in one place. (`src/c4/theme.ts` and `src/c4/ui.tsx` re-export them for older code.)
- `src/state/AppContext.tsx`: app-wide state (server address, current bowler, latest plan, onboarding).
- `src/api/*`: one module per component, all through `src/api/client.ts` (the API address is set in one place).
- `src/<component>/`: component-specific types and UI pieces (e.g. `src/c2/ui.tsx` joint-angle cards,
  `src/c3/ui.tsx` risk meter and SHAP bars, `src/c4/BowlerForm.tsx` profile form).

## Run

```bash
# 1. backend (another terminal) – see backend/README.md
cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 2. app
cd app
npm install
npx expo start            # press w for web, or scan the QR code with Expo Go (SDK 58)
npm run typecheck
```

On a phone the app finds the backend automatically on your PC's IP (same Wi-Fi). If not, set it in
**Profile → Settings → Server connection** (e.g. `http://192.168.1.23:8000`). Windows Firewall must allow port 8000.
